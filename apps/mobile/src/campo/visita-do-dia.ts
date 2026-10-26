import { supabase } from "../lib/supabase";
import { abrirFila, idDaVisitaNoServidor } from "./fila";
import { sincronizar } from "./sincronizacao";

/**
 * A visita de HOJE, deste inspetor neste site, que ainda nao tem checklist.
 *
 * POR QUE EXISTE (achado de 26/10/2026, revisando o caminho sem sinal): o QR
 * lido sem sinal grava uma visita so com o Inicio, e o checklist nao abre. Com
 * sinal, o inspetor le o QR de novo para fazer o checklist -- e o QR criava
 * OUTRA visita, deixando a primeira sem checklist em Coletas Importadas e no
 * relatorio de Inicio e Fim (a visita 102 do ensaio de 23/10). Agora o QR
 * reabre a visita que ja existe, e o Inicio continua sendo o da primeira
 * leitura.
 *
 * So a ULTIMA visita do dia: se ela ja tem checklist, o inspetor ja fez a
 * inspecao, e um QR novo e uma inspecao nova. Visita com rascunho comecado nao
 * chega aqui: `rascunhoDeRondaDoSite` a acha antes.
 *
 * Sem conseguir confirmar no servidor (sem sinal, erro de consulta), devolve
 * `null` e o QR segue o caminho de sempre: este atalho nunca trava o inspetor.
 * Visita nao enviada ainda e sincronizada antes, porque o checklist e
 * conferido pelo id do servidor.
 */
export async function visitaDoDiaSemChecklist(
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
      order by capturado_em desc
      limit 1`,
    siteId,
    funcionarioId,
    desde,
  );
  if (!linha) return null;

  let visitaId = linha.visita_id;
  if (visitaId === null) {
    // `sincronizar` nao lanca por falha de rede: devolve em `falhas`.
    const resultado = await sincronizar(funcionarioId);
    if (resultado.falhas.length > 0) return null;
    visitaId = await idDaVisitaNoServidor(linha.chave);
    if (visitaId === null) return null;
  }

  const { data, error } = await supabase
    .from("checklists_visita")
    .select("id")
    .eq("visita_id", visitaId)
    .limit(1);
  if (error || !data) return null;

  return data.length === 0 ? { visitaId, numeroColeta: linha.chave } : null;
}
