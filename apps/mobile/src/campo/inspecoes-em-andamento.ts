import { supabase } from "../lib/supabase";
import { abrirFila } from "./fila";
import { inicioDoDia } from "./rascunho";

/**
 * "Inspecao em andamento, iniciada em ..." embaixo do site, na lista do "Ver
 * sites", como no app do sistema de referencia (comparacao de 17/11/2026,
 * item 4; pedido do dono em 22/11/2026).
 *
 * Em andamento e o que o toque no site RETOMA, e nada alem disso -- o aviso
 * nao pode prometer uma inspecao que o toque nao abre:
 *
 *   1. Checklist comecado e nao enviado (rascunho com conteudo), de qualquer
 *      dia: o da ronda pelo QR (`rascunhoDeRondaDoSite`) e o do proprio "Ver
 *      sites" (guardado pelo site, com chave negativa).
 *   2. Inspecao de HOJE ainda nao finalizada (`visitaDoDiaAberta`): a lida
 *      pelo QR neste aparelho (sem Termino na fila) e, com sinal, as do
 *      servidor com `finalizada_em` nulo -- inclusive a aberta pelo "Ver
 *      sites", que nasce no envio do primeiro checklist (0114).
 *
 * Sem sinal, a visita da fila conta como em andamento: melhor um aviso a mais
 * do que esconder uma inspecao aberta.
 */

export type InspecaoEmAndamento = {
  siteId: number;
  /** ISO. Quando a inspecao comecou: a leitura do QR ou a abertura do checklist. */
  iniciadaEm: string;
};

type Candidata = InspecaoEmAndamento & { visitaId: number | null };

/**
 * Uma por site, a que comecou primeiro (o aviso conta desde quando o site
 * esta aberto). Pura: e a regra que o teste confere.
 */
export function juntarPorSite(candidatas: readonly Candidata[], finalizadas: ReadonlySet<number>): Map<number, InspecaoEmAndamento> {
  const porSite = new Map<number, InspecaoEmAndamento>();
  for (const c of candidatas) {
    if (c.visitaId !== null && finalizadas.has(c.visitaId)) continue;
    const atual = porSite.get(c.siteId);
    if (!atual || c.iniciadaEm < atual.iniciadaEm) porSite.set(c.siteId, { siteId: c.siteId, iniciadaEm: c.iniciadaEm });
  }
  return porSite;
}

const TEM_CONTEUDO = `(r.respostas <> '{}' or r.motivo <> '' or r.fotos <> '[]'
  or ifnull(r.fotos_de_pergunta, '{}') <> '{}' or ifnull(r.observacoes, '{}') <> '{}')`;

export async function inspecoesEmAndamento(funcionarioId: string, agora: Date = new Date()): Promise<Map<number, InspecaoEmAndamento>> {
  const banco = await abrirFila();

  const [daRonda, doVerSites, doDia] = await Promise.all([
    // Rascunho de visita da ronda: o site e a hora vem da visita na fila.
    banco.getAllAsync<{ site_id: number; inicio: string; visita_id: number }>(
      `select v.site_id, v.capturado_em as inicio, r.visita_id
         from rascunhos_de_checklist r
         join visitas_na_fila v on v.visita_id = r.visita_id
        where r.visita_id > 0 and r.funcionario_id = ? and ${TEM_CONTEUDO}`,
      funcionarioId,
    ),
    // Rascunho do "Ver sites": a chave e o site com sinal trocado.
    banco.getAllAsync<{ site_id: number; inicio: string }>(
      `select -r.visita_id as site_id, coalesce(r.criado_em, r.atualizado_em) as inicio
         from rascunhos_de_checklist r
        where r.visita_id < 0 and r.funcionario_id = ? and ${TEM_CONTEUDO}`,
      funcionarioId,
    ),
    // Visita de hoje na fila; `finalizada` marca a que tem Termino aqui.
    banco.getAllAsync<{ site_id: number; inicio: string; visita_id: number | null; chave: string; finalizada: number }>(
      `select v.site_id, v.capturado_em as inicio, v.visita_id, v.chave,
              exists (select 1 from leituras_na_fila l where l.chave_da_visita = v.chave and l.termino = 1) as finalizada
         from visitas_na_fila v
        where v.funcionario_id = ?
          and v.capturado_em >= ?`,
      funcionarioId,
      inicioDoDia(agora),
    ),
  ]);

  const finalizadasAqui = new Set(doDia.filter((l) => l.finalizada).map((l) => l.chave));

  const candidatas: Candidata[] = [
    // O rascunho da ronda vale mesmo com checklist ja enviado? Nao chega a
    // acontecer: o envio descarta o rascunho. Entra sem `visitaId`.
    ...daRonda.map((l) => ({ siteId: l.site_id, iniciadaEm: l.inicio, visitaId: null })),
    ...doVerSites.map((l) => ({ siteId: l.site_id, iniciadaEm: l.inicio, visitaId: null })),
    ...doDia
      .filter((l) => !l.finalizada)
      .map((l) => ({ siteId: l.site_id, iniciadaEm: l.inicio, visitaId: l.visita_id })),
  ];

  // As de hoje no servidor: as abertas entram (a do "Ver sites" so existe
  // la); as finalizadas tiram a da fila que ja foi enviada.
  const finalizadasNoServidor = new Set<number>();
  try {
    const { data, error } = await supabase
      .from("visitas")
      .select("id, site_id, criado_em, numero_coleta, finalizada_em")
      .eq("funcionario_id", funcionarioId)
      .gte("criado_em", inicioDoDia(agora));
    if (!error) {
      for (const v of data ?? []) {
        if (v.finalizada_em !== null) finalizadasNoServidor.add(v.id);
        else if (!finalizadasAqui.has(v.numero_coleta)) {
          candidatas.push({ siteId: v.site_id, iniciadaEm: v.criado_em, visitaId: v.id });
        }
      }
    }
  } catch {
    // Sem sinal: fica so o que o aparelho sabe (ver o cabecalho).
  }

  return juntarPorSite(candidatas, finalizadasNoServidor);
}

/** "22/11/2026 14:05", no fuso do aparelho. */
export function dataEHoraDaInspecao(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}
