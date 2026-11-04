import { lerLocalizacao } from "../lib/localizacao";
import { supabase } from "../lib/supabase";
import { abrirFila, registrarLeitura } from "./fila";
import { descartarRascunho } from "./rascunho";

/**
 * As duas acoes do menu da inspecao aberta no app do sistema de referencia.
 *
 * "CONVERTER PARA VISITA": a inspecao vira uma visita simples -- fica a
 * presenca (o Inicio da leitura do QR) e entra o Termino agora, sem checklist.
 * O Termino vai pela fila, como o do "Encerrar ronda" (`ronda.ts`), e a
 * sincronizacao o envia com a area "Termino" (0077). Com isso a proxima
 * leitura do QR do mesmo site nao reabre esta visita (`visita-do-dia.ts`
 * ignora visita com Termino): ela foi concluida como visita.
 *
 * "ABANDONAR INSPECAO": desistir da inspecao aberta por engano. Ja no
 * servidor, apaga pela `abandonar_visita` (0088: so a do proprio inspetor,
 * sem checklist, dos ultimos 2 dias); ainda so no aparelho, sai da fila.
 * Nos dois casos o rascunho do checklist vai junto.
 */

export type ResultadoDaAcao = { ok: true } | { ok: false; erro: string };

/** Visita da fila pelo numero de coleta (a chave local e o numero). */
async function visitaNaFila(numeroColeta: string): Promise<{ visita_id: number | null } | null> {
  const banco = await abrirFila();
  return banco.getFirstAsync<{ visita_id: number | null }>(
    "select visita_id from visitas_na_fila where chave = ?",
    numeroColeta,
  );
}

export async function converterParaVisita(entrada: {
  visitaId: number;
  numeroColeta: string;
  agora?: Date;
}): Promise<ResultadoDaAcao> {
  const dataHora = (entrada.agora ?? new Date()).toISOString();
  try {
    // O ponto do termino, como o `geodata_termino` do app de referencia.
    const local = await lerLocalizacao();
    if (await visitaNaFila(entrada.numeroColeta)) {
      await registrarLeitura({ chaveDaVisita: entrada.numeroColeta, dataHora, termino: true, local });
    } else {
      // Visita aberta em outro aparelho (veio da lista de Inspecao): nao esta
      // na fila daqui, entao o Termino vai direto, e precisa de sinal.
      const { data: area, error: erroDaArea } = await supabase
        .from("areas")
        .select("id")
        .eq("nome", "Término")
        .maybeSingle();
      if (erroDaArea) return { ok: false, erro: "Sem conexão para converter agora. Tente de novo com sinal." };
      const { error } = await supabase
        .from("leituras")
        .insert({
          visita_id: entrada.visitaId,
          data_hora: dataHora,
          area_id: area?.id ?? null,
          tem_localizacao: local !== null,
          latitude: local?.latitude ?? null,
          longitude: local?.longitude ?? null,
          precisao_metros: local?.precisao ?? null,
        });
      if (error) return { ok: false, erro: "Não foi possível converter para visita. Tente de novo com sinal." };
    }
    await descartarRascunho(entrada.visitaId).catch(() => undefined);
    return { ok: true };
  } catch {
    return { ok: false, erro: "Não foi possível converter para visita. Tente de novo." };
  }
}

export async function abandonarInspecao(entrada: {
  visitaId: number | null;
  numeroColeta: string;
  siteId?: number | null;
}): Promise<ResultadoDaAcao> {
  try {
    const naFila = await visitaNaFila(entrada.numeroColeta);
    const idNoServidor = entrada.visitaId ?? naFila?.visita_id ?? null;

    if (idNoServidor !== null) {
      const { error } = await supabase.rpc("abandonar_visita", { p_visita_id: idNoServidor });
      if (error) {
        return {
          ok: false,
          erro:
            error.code === "42501" || error.code === "P0002"
              ? error.message
              : "Sem conexão para abandonar agora. Tente de novo com sinal.",
        };
      }
    }

    if (naFila) {
      const banco = await abrirFila();
      await banco.runAsync("delete from leituras_na_fila where chave_da_visita = ?", entrada.numeroColeta);
      await banco.runAsync("delete from visitas_na_fila where chave = ?", entrada.numeroColeta);
    }

    // A chave do rascunho e a da tela do checklist: o id da visita, ou o site
    // negativo quando a visita ainda nao existe ("Ver sites").
    const chaveDoRascunho = entrada.visitaId ?? -(entrada.siteId ?? 0);
    await descartarRascunho(chaveDoRascunho).catch(() => undefined);
    return { ok: true };
  } catch {
    return { ok: false, erro: "Não foi possível abandonar a inspeção. Tente de novo." };
  }
}
