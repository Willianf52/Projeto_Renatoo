import { ROTULO_DO_TIPO_DE_RESPOSTA, tipoDeResposta, type TipoDeResposta } from "@projeto-renatoo/shared";
import { createClient } from "@/lib/supabase/server";
import { termoParaOr } from "@/lib/postgrest-escape";
import { paginar } from "@/lib/supabase/query-helpers";

export const PAGE_SIZE = 25;

export type PerguntaFiltros = {
  busca?: string;
  /** "ativo" | "inativo" | undefined (todos). */
  status?: string;
  /** Id do modelo, em texto -- vem da querystring. */
  modelo?: string;
  pagina: number;
};

export type PerguntaRow = {
  id: number;
  ordem: number;
  texto: string;
  ativo: boolean;
  modeloId: number;
  modelo: string;
  tipoResposta: TipoDeResposta;
  /** Grupo de Perguntas (0073); vazio quando a pergunta nao tem. */
  grupoId: number | null;
  grupo: string;
  grupoCor: string | null;
  /** Tipo de evento que a resposta abre (0063); vazio: "NÃO CONFORMIDADE". */
  eventoId: number | null;
  evento: string;
};

type LinhaBruta = {
  id: number;
  ordem: number;
  texto: string;
  ativo: boolean;
  modelo_id: number;
  tipo_resposta: string;
  modelos_checklist: { nome: string } | null;
  grupo_pergunta_id: number | null;
  grupos_perguntas: { nome: string; cor: string | null } | null;
  evento_id: number | null;
  eventos: { nome: string } | null;
};

const COLUNAS = `id, ordem, texto, ativo, modelo_id, tipo_resposta, modelos_checklist ( nome ),
  grupo_pergunta_id, grupos_perguntas ( nome, cor ), evento_id, eventos ( nome )`;

function paraLinha(bruta: LinhaBruta): PerguntaRow {
  return {
    id: bruta.id,
    ordem: bruta.ordem,
    texto: bruta.texto,
    ativo: bruta.ativo,
    modeloId: bruta.modelo_id,
    modelo: bruta.modelos_checklist?.nome ?? "",
    tipoResposta: tipoDeResposta(bruta.tipo_resposta),
    grupoId: bruta.grupo_pergunta_id,
    grupo: bruta.grupos_perguntas?.nome ?? "",
    grupoCor: bruta.grupos_perguntas?.cor ?? null,
    eventoId: bruta.evento_id,
    evento: bruta.eventos?.nome ?? "",
  };
}

/** Id de modelo valido da querystring, ou `null`. `modelo=abc` nao vira um
 * filtro com NaN -- vira "sem filtro". */
export function modeloDoFiltro(valor: string | undefined): number | null {
  const id = Number(valor);
  return valor && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Busca livre num campo so, sobre o texto da pergunta. Diferente de
 * `grupo-de-sites`, aqui nao ha segunda coluna de texto para procurar junto --
 * a tabela e proposital e deliberadamente magra (migration 0042).
 *
 * O cast de volta para `Q` e o mesmo preco documentado em
 * `grupo-de-sites/queries.ts`: o builder do PostgREST nao expoe um tipo
 * generico para "o mesmo builder de volta" depois do `.or()`.
 */
function comBusca<Q extends { or(filtro: string): unknown }>(query: Q, busca: string | undefined): Q {
  if (!busca) return query;
  return query.or(`texto.ilike."%${termoParaOr(busca)}%"`) as Q;
}

export async function getPerguntas(filtros: PerguntaFiltros): Promise<{
  rows: PerguntaRow[];
  totalItems: number;
}> {
  const supabase = await createClient();
  const { from, to } = paginar(filtros.pagina, PAGE_SIZE);

  let query = supabase
    .from("perguntas_checklist")
    .select(COLUNAS, { count: "exact" })
    // Modelo, depois `ordem`: dentro de um modelo, e a sequencia que o
    // inspetor ve no celular. `(modelo_id, ordem)` e unique desde a 0061, entao
    // a ordenacao e total e a paginacao nao repete nem pula linha -- `ordem`
    // sozinha deixou de ser unica quando cada modelo ganhou a sua pergunta 1.
    .order("modelo_id", { ascending: true })
    .order("ordem", { ascending: true })
    .range(from, to);

  if (filtros.status === "ativo") query = query.eq("ativo", true);
  if (filtros.status === "inativo") query = query.eq("ativo", false);

  const modelo = modeloDoFiltro(filtros.modelo);
  if (modelo !== null) query = query.eq("modelo_id", modelo);

  const { data, error, count } = await comBusca(query, filtros.busca);
  if (error) throw error;

  return {
    rows: ((data ?? []) as unknown as LinhaBruta[]).map(paraLinha),
    totalItems: count ?? 0,
  };
}

export async function getPergunta(id: number): Promise<PerguntaRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("perguntas_checklist")
    .select(COLUNAS)
    .eq("id", id)
    // `maybeSingle` e nao `single`: id que nao existe e um 404 da tela, nao um
    // erro do Postgres borbulhando ate a fronteira de erro do App Router.
    .maybeSingle();

  if (error) throw error;
  return data ? paraLinha(data as unknown as LinhaBruta) : null;
}

/**
 * Proxima `ordem` livre, para o formulario de cadastro nascer preenchido.
 *
 * `ordem` e `unique` e obrigatoria: sem esta sugestao, cadastrar a segunda
 * pergunta significaria adivinhar um numero e levar um "Já existe uma pergunta
 * nessa ordem" na cara. Sugestao, nao imposicao -- o campo continua editavel,
 * porque inserir uma pergunta no meio da lista e exatamente o caso que a
 * coluna `ordem` existe para permitir.
 */
export async function getProximaOrdem(modeloId: number): Promise<number> {
  const supabase = await createClient();

  // Por modelo: a ordem e unica dentro dele (0061), e cada modelo tem a sua.
  const { data } = await supabase
    .from("perguntas_checklist")
    .select("ordem")
    .eq("modelo_id", modeloId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.ordem ?? 0) + 1;
}

/** Colunas de texto da linha; o grupo (com a cor) e "Ações" sao montados na
 * pagina. */
export function toTableRow(pergunta: PerguntaRow): string[] {
  return [
    pergunta.modelo,
    String(pergunta.ordem),
    pergunta.texto,
    ROTULO_DO_TIPO_DE_RESPOSTA[pergunta.tipoResposta],
    pergunta.evento,
    pergunta.ativo ? "Ativa" : "Inativa",
  ];
}

export type Opcao = { value: string; label: string };

/**
 * Grupos de Perguntas e eventos para os selects do formulario. Os inativos
 * so entram se forem o atual da pergunta: sumir da lista faria o proximo
 * "Salvar" tirar o grupo sem ninguem pedir.
 */
export async function getOpcoesDaPergunta(atual?: { grupoId: number | null; eventoId: number | null }): Promise<{
  grupos: Opcao[];
  eventos: Opcao[];
}> {
  const supabase = await createClient();
  const [grupos, eventos] = await Promise.all([
    supabase.from("grupos_perguntas").select("id, nome, ativo").order("ordem").order("nome"),
    supabase.from("eventos").select("id, nome, ativo").order("nome"),
  ]);
  const visivel = (linha: { id: number; ativo: boolean }, idAtual: number | null | undefined) =>
    linha.ativo || linha.id === idAtual;
  return {
    grupos: (grupos.data ?? [])
      .filter((g) => visivel(g, atual?.grupoId))
      .map((g) => ({ value: String(g.id), label: g.ativo ? g.nome : `${g.nome} (inativo)` })),
    eventos: (eventos.data ?? [])
      .filter((e) => visivel(e, atual?.eventoId))
      .map((e) => ({ value: String(e.id), label: e.ativo ? e.nome : `${e.nome} (inativo)` })),
  };
}
