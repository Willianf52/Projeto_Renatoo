import { supabase } from "../lib/supabase";
import { abrirFila, idDaVisitaNoServidor } from "./fila";
import { sincronizar } from "./sincronizacao";

/**
 * A inspecao de HOJE, deste inspetor neste site, que ainda nao foi
 * finalizada.
 *
 * POR QUE EXISTE (achado de 26/10/2026, revisando o caminho sem sinal): o QR
 * lido sem sinal grava uma visita so com o Inicio, e o checklist nao abre. Com
 * sinal, o inspetor le o QR de novo para fazer o checklist -- e o QR criava
 * OUTRA visita, deixando a primeira sem checklist em Coletas Importadas e no
 * relatorio de Inicio e Fim. Agora o QR (e o "Ver sites") reabre a inspecao
 * que ja existe, e o Inicio continua sendo o da primeira leitura.
 *
 * VARIOS CHECKLISTS NA MESMA INSPECAO (0114, 22/11/2026): a inspecao so
 * termina no "Finalizar inspecao" (ou sozinha a meia-noite). Entao a regra
 * deixou de ser "sem checklist" e virou "nao finalizada" (`finalizada_em`
 * nulo no servidor; Termino na fila, no aparelho).
 *
 * Dois lugares onde a inspecao pode estar:
 *   1. Na fila do aparelho (lida pelo QR aqui). Visita ainda nao enviada e
 *      sincronizada antes, porque a conferencia e pelo id do servidor.
 *   2. So no servidor: a aberta pelo "Ver sites", que nasce no envio do
 *      primeiro checklist e nao passa pela fila.
 *
 * Sem conseguir confirmar no servidor (sem sinal, erro de consulta), devolve
 * `null` e o QR segue o caminho de sempre: este atalho nunca trava o inspetor.
 */
export async function visitaDoDiaAberta(
  siteId: number,
  funcionarioId: string,
  desde: string,
): Promise<{ visitaId: number; numeroColeta: string } | null> {
  const banco = await abrirFila();
  const linha = await banco.getFirstAsync<{ chave: string; visita_id: number | null }>(
    `select chave, visita_id
       from visitas_na_fila
      where site_id = ?
        and funcionario_id = ?
        and capturado_em >= ?
        -- Finalizada, convertida ou encerrada (Termino na fila): nao reabre.
        and not exists (
          select 1 from leituras_na_fila l where l.chave_da_visita = visitas_na_fila.chave and l.termino = 1
        )
      order by capturado_em desc
      limit 1`,
    siteId,
    funcionarioId,
    desde,
  );

  if (linha) {
    let visitaId = linha.visita_id;
    if (visitaId === null) {
      // `sincronizar` nao lanca por falha de rede: devolve em `falhas`.
      const resultado = await sincronizar(funcionarioId);
      if (resultado.falhas.length > 0) return null;
      visitaId = await idDaVisitaNoServidor(linha.chave);
      if (visitaId === null) return null;
    }

    const { data, error } = await supabase.from("visitas").select("finalizada_em").eq("id", visitaId).maybeSingle();
    if (error || !data) return null;
    return data.finalizada_em === null ? { visitaId, numeroColeta: linha.chave } : null;
  }

  // So no servidor (aberta pelo "Ver sites"). Fica de fora a que o aparelho
  // ja finalizou e ainda nao enviou o Termino.
  const finalizadasAqui = await banco.getAllAsync<{ chave: string }>(
    `select v.chave from visitas_na_fila v
      where exists (select 1 from leituras_na_fila l where l.chave_da_visita = v.chave and l.termino = 1)`,
  );
  const ignorar = new Set(finalizadasAqui.map((l) => l.chave));

  const { data, error } = await supabase
    .from("visitas")
    .select("id, numero_coleta")
    .eq("funcionario_id", funcionarioId)
    .eq("site_id", siteId)
    .gte("criado_em", desde)
    .is("finalizada_em", null)
    .order("criado_em", { ascending: false })
    .limit(5);
  if (error || !data) return null;

  const aberta = data.find((v) => !ignorar.has(v.numero_coleta));
  return aberta ? { visitaId: aberta.id, numeroColeta: aberta.numero_coleta } : null;
}
