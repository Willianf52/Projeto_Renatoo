import { supabase } from "../lib/supabase";
import { idDaVisitaNoServidor, iniciarVisita, registrarLeitura } from "./fila";
import { sincronizar } from "./sincronizacao";

/**
 * O que acontece quando o inspetor (ou o gestor) le a etiqueta do site.
 *
 * A ORDEM E A DO MARCO 03: primeiro a fila, depois a rede. A visita e a
 * leitura vao para o SQLite do aparelho antes de qualquer envio -- se a rede
 * cair no meio, o registro de que alguem esteve no site ja esta salvo, e sobe
 * no proximo "Sincronizar". So depois a fila e drenada, porque o checklist
 * grava contra `visitas.id`, e esse id so existe no servidor.
 *
 * O QUE AINDA PEDE REDE: conferir o codigo. A tabela `qr_codes` nao tem copia
 * no aparelho, entao sem sinal a etiqueta nao e reconhecida e nada entra na
 * fila -- melhor recusar na hora do que guardar uma leitura que o servidor vai
 * recusar depois (o trigger da 0054 exige o QR do site da visita).
 */

export type ResultadoDaLeitura =
  /** Visita criada no servidor: o app segue direto para o checklist. */
  | { tipo: "pronta"; visitaId: number; numeroColeta: string }
  /** Salva no aparelho, mas ainda nao subiu: vai no proximo "Sincronizar". */
  | { tipo: "na-fila"; mensagem: string }
  /** Nada foi gravado. */
  | { tipo: "recusada"; mensagem: string };

export async function registrarLeituraDeQr(
  codigoLido: string,
  funcionarioId: string,
): Promise<ResultadoDaLeitura> {
  const codigo = codigoLido.trim();

  if (!codigo) {
    return { tipo: "recusada", mensagem: "Informe o código do QR." };
  }

  const { data: qr, error } = await supabase
    .from("qr_codes")
    .select("id, site_id, ativo")
    .eq("codigo", codigo)
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      tipo: "recusada",
      mensagem: "Não foi possível conferir o QR code agora. Verifique a conexão e tente de novo.",
    };
  }

  if (!qr) {
    return { tipo: "recusada", mensagem: `O código "${codigo}" não está cadastrado.` };
  }

  if (!qr.ativo) {
    return { tipo: "recusada", mensagem: `O código "${codigo}" está desativado.` };
  }

  // O mesmo instante para a abertura da visita e para a leitura: e um evento
  // so, o scan. `toISOString` termina em `Z`, que e o fuso que o esquema exige.
  const agora = new Date().toISOString();

  const chave = await iniciarVisita({
    siteId: qr.site_id,
    funcionarioId,
    capturadoEm: agora,
  });
  await registrarLeitura({ chaveDaVisita: chave, dataHora: agora, qrCodeId: qr.id });

  let falha: string | null = null;
  try {
    const resultado = await sincronizar(funcionarioId);
    falha = resultado.falhas.find((f) => f.chave === chave)?.erro ?? null;
  } catch {
    falha = null;
  }

  const visitaId = await idDaVisitaNoServidor(chave);

  if (visitaId === null) {
    return {
      tipo: "na-fila",
      mensagem: falha
        ? `Leitura salva no aparelho, mas o envio falhou: ${falha}`
        : "Leitura salva no aparelho. Ela sobe quando houver conexão — toque em Sincronizar.",
    };
  }

  return { tipo: "pronta", visitaId, numeroColeta: chave };
}
