import {
  notaDoChecklist,
  tipoDeResposta,
  type RespostaDoChecklist,
  type TipoDeResposta,
} from "@projeto-renatoo/shared";
import { dataValida, listarDias, periodoEntreDatas } from "@/lib/data-hora";
import { filtroDeId, filtroDeUuid } from "@/lib/id-na-url";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";

/**
 * Base dos tres relatorios com nota do ChecklistLab (issue #209): Analitico
 * por Checklist, Indicadores por Site e Detalhamento do Checklist. Uma leitura
 * e tres agregacoes puras, para os numeros de uma tela baterem com os da
 * outra -- na referencia nao batem (o mesmo checklist sai 0% num relatorio e
 * 100 no medidor do outro).
 *
 * A CONTA E A DA NOTA (`notaDoChecklist`, shared): % de Conforme entre as
 * respostas Conforme e Nao conforme. "Nao se aplica" e perguntas Sim/Nao
 * ficam de fora, e sem nada para medir o valor e vazio, nao zero. Na
 * referencia o percentual sai do "valor" cadastrado em cada resposta, que a
 * maioria dos checklists de la nem preencheu -- por isso la so aparece 0 ou
 * 100.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

/** "Apenas Checklists Ativos" e o padrao, como na referencia. */
export type SituacaoDoModelo = "ativos" | "inativos" | "todos";

export const SITUACOES_DO_MODELO: { value: SituacaoDoModelo; label: string }[] = [
  { value: "ativos", label: "Apenas Checklists Ativos" },
  { value: "inativos", label: "Apenas Checklists Inativos" },
  { value: "todos", label: "Todos os Checklists" },
];

export type Filtros = {
  dataInicial: string;
  dataFinal: string;
  usuario?: string;
  site?: string;
  grupoSite?: string;
  modelo?: string;
  situacao: SituacaoDoModelo;
};

/** Os ultimos 7 dias ate hoje (Brasilia), o periodo que a referencia abre. */
export function periodoPadrao(agora: Date): { dataInicial: string; dataFinal: string } {
  const hoje = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const inicio = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { dataInicial: inicio.toISOString().slice(0, 10), dataFinal: hoje.toISOString().slice(0, 10) };
}

export function extrairFiltros(params: SearchParams, agora: Date): Filtros {
  const padrao = periodoPadrao(agora);
  const situacao = primeiro(params.situacao);
  return {
    dataInicial: dataValida(primeiro(params.data_inicial)) ?? padrao.dataInicial,
    dataFinal: dataValida(primeiro(params.data_final)) ?? padrao.dataFinal,
    usuario: filtroDeUuid(primeiro(params.usuario)),
    site: filtroDeId(primeiro(params.site)),
    grupoSite: filtroDeId(primeiro(params.grupo_site)),
    modelo: filtroDeId(primeiro(params.modelo)),
    situacao: situacao === "inativos" || situacao === "todos" ? situacao : "ativos",
  };
}

export type Opcao = { value: string; label: string };
export type OpcoesFiltros = { usuarios: Opcao[]; sites: Opcao[]; gruposSites: Opcao[]; modelos: Opcao[] };

/** Sem cache: `sites` e `profiles` sao recortados por RLS conforme quem pede. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();
  const [usuarios, sites, grupos, modelos] = await Promise.all([
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
    supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
    supabase.from("grupos_sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("modelos_checklist").select("id, nome, ativo").order("nome"),
  ]);
  return {
    usuarios: (usuarios.data ?? []).map((u) => ({ value: u.id, label: u.nome_completo ?? "" })),
    sites: ((sites.data ?? []) as unknown as { id: number; nome: string; grupos_sites: { nome: string } | null }[]).map(
      (s) => ({ value: String(s.id), label: s.grupos_sites?.nome ? `${s.grupos_sites.nome} - ${s.nome}` : s.nome }),
    ),
    gruposSites: (grupos.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
    modelos: (modelos.data ?? []).map((m) => ({ value: String(m.id), label: m.ativo ? m.nome : `${m.nome} (inativo)` })),
  };
}

// --- Leitura -------------------------------------------------------------------------

export type PerguntaLida = {
  id: number;
  ordem: number;
  texto: string;
  tipo: TipoDeResposta;
  grupoId: number | null;
  grupo: string;
  grupoOrdem: number;
};

export type ChecklistLido = {
  id: number;
  /** "yyyy-mm-dd" do envio, em Brasilia. */
  dia: string;
  modeloId: number;
  modelo: string;
  siteId: number;
  site: string;
  respostas: { pergunta: PerguntaLida; resposta: string }[];
};

type ChecklistDoBanco = {
  id: number;
  criado_em: string;
  modelo_id: number;
  modelos_checklist: { nome: string; ativo: boolean } | null;
  visitas: { sites: { id: number; nome: string; grupos_sites: { nome: string } | null } | null } | null;
  checklist_respostas: {
    resposta: string;
    perguntas_checklist: {
      id: number;
      ordem: number;
      texto: string;
      tipo_resposta: string;
      grupo_pergunta_id: number | null;
      grupos_perguntas: { nome: string; ordem: number } | null;
    } | null;
  }[];
};

const SELECT = `id, criado_em, modelo_id,
  modelos_checklist!inner ( nome, ativo ),
  visitas!inner ( funcionario_id, sites!inner ( id, nome, grupo_site_id, grupos_sites ( nome ) ) ),
  checklist_respostas ( resposta, perguntas_checklist ( id, ordem, texto, tipo_resposta, grupo_pergunta_id,
    grupos_perguntas ( nome, ordem ) ) )`;

const DESLOCAMENTO_MS = 3 * 60 * 60 * 1000;

export function diaEmBrasilia(carimbo: string): string {
  return new Date(new Date(carimbo).getTime() - DESLOCAMENTO_MS).toISOString().slice(0, 10);
}

/** Pura: do formato do banco para o que as agregacoes usam. */
export function paraChecklist(c: ChecklistDoBanco): ChecklistLido {
  const site = c.visitas?.sites;
  return {
    id: c.id,
    dia: diaEmBrasilia(c.criado_em),
    modeloId: c.modelo_id,
    modelo: c.modelos_checklist?.nome ?? "",
    siteId: site?.id ?? 0,
    site: site ? (site.grupos_sites?.nome ? `${site.grupos_sites.nome} - ${site.nome}` : site.nome) : "",
    respostas: c.checklist_respostas
      .filter((r) => r.perguntas_checklist !== null)
      .map((r) => {
        const p = r.perguntas_checklist!;
        return {
          resposta: r.resposta,
          pergunta: {
            id: p.id,
            ordem: p.ordem,
            texto: p.texto,
            tipo: tipoDeResposta(p.tipo_resposta),
            grupoId: p.grupo_pergunta_id,
            grupo: p.grupos_perguntas?.nome ?? "",
            grupoOrdem: p.grupos_perguntas?.ordem ?? Number.MAX_SAFE_INTEGER,
          },
        };
      }),
  };
}

/** Os checklists do periodo e dos filtros, com as respostas. Paginado: o
 * PostgREST corta em 1000 sem avisar. */
export async function getChecklists(filtros: Filtros): Promise<ChecklistLido[]> {
  const supabase = await createClient();
  const { inicio, fim } = periodoEntreDatas(filtros.dataInicial, filtros.dataFinal);

  const { linhas, atingiuTeto } = await buscarEmPaginas<ChecklistDoBanco>((de, ate) => {
    let q = supabase.from("checklists_visita").select(SELECT).gte("criado_em", inicio).lt("criado_em", fim);
    if (filtros.modelo) q = q.eq("modelo_id", Number(filtros.modelo));
    if (filtros.situacao === "ativos") q = q.eq("modelos_checklist.ativo", true);
    if (filtros.situacao === "inativos") q = q.eq("modelos_checklist.ativo", false);
    if (filtros.usuario) q = q.eq("visitas.funcionario_id", filtros.usuario);
    if (filtros.site) q = q.eq("visitas.sites.id", Number(filtros.site));
    if (filtros.grupoSite) q = q.eq("visitas.sites.grupo_site_id", Number(filtros.grupoSite));
    return q.order("id", { ascending: true }).range(de, ate);
  });

  if (atingiuTeto) {
    erro(gerarIdDeRequisicao(), "Relatórios do ChecklistLab: teto de leitura atingido; o período está incompleto.");
  }
  return linhas.map(paraChecklist);
}

// --- Contas ----------------------------------------------------------------------------

/** % de Conforme das respostas de UMA pergunta. Vazio (null) para Sim/Nao e
 * quando so houve "Nao se aplica" -- a mesma regra da nota. */
export function percentualConforme(tipo: TipoDeResposta, respostas: readonly string[]): number | null {
  if (tipo === "SN") return null;
  let medidas = 0;
  let conformes = 0;
  for (const r of respostas) {
    if (r === "NA") continue;
    medidas += 1;
    if (r === "SIM") conformes += 1;
  }
  return medidas === 0 ? null : Math.round((conformes / medidas) * 100);
}

function nota(c: ChecklistLido): number | null {
  return notaDoChecklist(
    // O banco so guarda SIM, NAO e NA (check da 0042); o cast so nomeia isso.
    c.respostas.map((r) => ({ tipo: r.pergunta.tipo, resposta: r.resposta as RespostaDoChecklist })),
  );
}

/** Media das notas, ignorando os checklists sem nota (so Sim/Nao ou N/A). */
export function mediaDasNotas(checklists: readonly ChecklistLido[]): number | null {
  const notas = checklists.map(nota).filter((n): n is number => n !== null);
  return notas.length === 0 ? null : Math.round(notas.reduce((s, n) => s + n, 0) / notas.length);
}

const comparar = (a: string, b: string) => a.localeCompare(b, "pt-BR");

function agruparPor<T, K>(itens: readonly T[], chave: (item: T) => K): Map<K, T[]> {
  const mapa = new Map<K, T[]>();
  for (const item of itens) mapa.set(chave(item), [...(mapa.get(chave(item)) ?? []), item]);
  return mapa;
}

export type LinhaDePergunta = { id: number; ordem: number; texto: string; percentual: number | null };
export type GrupoDoAnalitico = { nome: string; perguntas: LinhaDePergunta[] };
export type CartaoDoAnalitico = { modeloId: number; modelo: string; respondidos: number; grupos: GrupoDoAnalitico[] };

/**
 * Analitico por Checklist: um cartao por modelo, com quantos foram
 * respondidos e as perguntas agrupadas pelo Grupo de Perguntas (0073), cada
 * uma com o % de Conforme no periodo. Grupos na ordem do cadastro deles; as
 * perguntas sem grupo no fim, sob "Sem grupo".
 */
export function analiticoPorChecklist(checklists: readonly ChecklistLido[]): CartaoDoAnalitico[] {
  return [...agruparPor(checklists, (c) => c.modeloId).values()]
    .map((doModelo) => {
      const respostasPorPergunta = new Map<number, { pergunta: PerguntaLida; respostas: string[] }>();
      for (const c of doModelo) {
        for (const r of c.respostas) {
          const atual = respostasPorPergunta.get(r.pergunta.id) ?? { pergunta: r.pergunta, respostas: [] };
          atual.respostas.push(r.resposta);
          respostasPorPergunta.set(r.pergunta.id, atual);
        }
      }
      const porGrupo = agruparPor([...respostasPorPergunta.values()], (p) => p.pergunta.grupoId);
      const grupos = [...porGrupo.values()]
        .sort((a, b) => {
          const pa = a[0].pergunta;
          const pb = b[0].pergunta;
          if (pa.grupoId === null) return 1;
          if (pb.grupoId === null) return -1;
          return pa.grupoOrdem - pb.grupoOrdem || comparar(pa.grupo, pb.grupo);
        })
        .map((itens) => ({
          nome: itens[0].pergunta.grupoId === null ? "Sem grupo" : itens[0].pergunta.grupo,
          perguntas: itens
            .sort((a, b) => a.pergunta.ordem - b.pergunta.ordem)
            .map(({ pergunta, respostas }) => ({
              id: pergunta.id,
              ordem: pergunta.ordem,
              texto: pergunta.texto,
              percentual: percentualConforme(pergunta.tipo, respostas),
            })),
        }));
      return { modeloId: doModelo[0].modeloId, modelo: doModelo[0].modelo, respondidos: doModelo.length, grupos };
    })
    .sort((a, b) => comparar(a.modelo, b.modelo));
}

export type IndicadorDeModelo = { modeloId: number; modelo: string; media: number | null; respondidos: number };
export type CartaoDeSite = {
  siteId: number;
  site: string;
  media: number | null;
  respondidos: number;
  modelos: IndicadorDeModelo[];
};

/**
 * Indicadores por Site: um cartao por site com a Media Geral (media das notas
 * do periodo) e um medidor por checklist respondido ali. So os sites com
 * checklist no periodo -- a referencia lista todos, e centenas de medidores
 * em zero escondem os poucos que dizem alguma coisa.
 */
export function indicadoresPorSite(checklists: readonly ChecklistLido[]): CartaoDeSite[] {
  return [...agruparPor(checklists, (c) => c.siteId).values()]
    .map((doSite) => ({
      siteId: doSite[0].siteId,
      site: doSite[0].site,
      media: mediaDasNotas(doSite),
      respondidos: doSite.length,
      modelos: [...agruparPor(doSite, (c) => c.modeloId).values()]
        .map((doModelo) => ({
          modeloId: doModelo[0].modeloId,
          modelo: doModelo[0].modelo,
          media: mediaDasNotas(doModelo),
          respondidos: doModelo.length,
        }))
        .sort((a, b) => comparar(a.modelo, b.modelo)),
    }))
    .sort((a, b) => comparar(a.site, b.site));
}

/** Teto do Detalhamento: uma coluna por dia, e mais que isso nao cabe legivel. */
export const MAXIMO_DE_DIAS = 31;

export type LinhaDoDetalhamento = { id: number; ordem: number; texto: string; porDia: (number | null)[] };
export type CartaoDoDetalhamento = {
  siteId: number;
  site: string;
  modeloId: number;
  modelo: string;
  media: number | null;
  perguntas: LinhaDoDetalhamento[];
};

/**
 * Detalhamento do Checklist: um cartao por site x checklist, com o medidor da
 * media e o % de Conforme de cada pergunta em cada dia do periodo (`dias`,
 * na ordem). Dia sem resposta da pergunta fica vazio.
 */
export function detalhamento(checklists: readonly ChecklistLido[], dias: readonly string[]): CartaoDoDetalhamento[] {
  return [...agruparPor(checklists, (c) => `${c.siteId}-${c.modeloId}`).values()]
    .map((doPar) => {
      const respostas = new Map<number, { pergunta: PerguntaLida; porDia: Map<string, string[]> }>();
      for (const c of doPar) {
        for (const r of c.respostas) {
          const atual = respostas.get(r.pergunta.id) ?? { pergunta: r.pergunta, porDia: new Map<string, string[]>() };
          atual.porDia.set(c.dia, [...(atual.porDia.get(c.dia) ?? []), r.resposta]);
          respostas.set(r.pergunta.id, atual);
        }
      }
      return {
        siteId: doPar[0].siteId,
        site: doPar[0].site,
        modeloId: doPar[0].modeloId,
        modelo: doPar[0].modelo,
        media: mediaDasNotas(doPar),
        perguntas: [...respostas.values()]
          .sort((a, b) => a.pergunta.ordem - b.pergunta.ordem)
          .map(({ pergunta, porDia }) => ({
            id: pergunta.id,
            ordem: pergunta.ordem,
            texto: pergunta.texto,
            porDia: dias.map((dia) => (porDia.has(dia) ? percentualConforme(pergunta.tipo, porDia.get(dia)!) : null)),
          })),
      };
    })
    .sort((a, b) => comparar(a.site, b.site) || comparar(a.modelo, b.modelo));
}

export function diasDoPeriodo(filtros: Filtros): string[] {
  return listarDias(filtros.dataInicial, filtros.dataFinal);
}

/** "85%", ou vazio quando nao ha o que medir. */
export function formatarPercentual(valor: number | null): string {
  return valor === null ? "" : `${valor}%`;
}

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export const COLUNAS_DO_ANALITICO = ["Checklist", "Respondidos", "Grupo", "Ordem", "Pergunta", "% Conforme"];

/** Uma linha por pergunta, com o checklist e o grupo repetidos: e o formato que
 * a planilha filtra e soma sem desmontar celula mesclada. */
export function linhasDoAnalitico(cartoes: readonly CartaoDoAnalitico[]): string[][] {
  return cartoes.flatMap((c) =>
    c.grupos.flatMap((g) =>
      g.perguntas.map((p) => [c.modelo, String(c.respondidos), g.nome, String(p.ordem), p.texto, formatarPercentual(p.percentual)]),
    ),
  );
}
