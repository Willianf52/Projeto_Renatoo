import { createClient } from "@/lib/supabase/server";
import { termoParaOr } from "@/lib/postgrest-escape";
import { paginar } from "@/lib/supabase/query-helpers";

export const PAGE_SIZE = 25;

export type PerguntaFiltros = {
  busca?: string;
  /** "ativo" | "inativo" | undefined (todos). */
  status?: string;
  pagina: number;
};

export type PerguntaRow = {
  id: number;
  ordem: number;
  texto: string;
  ativo: boolean;
};

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
    .select("id, ordem, texto, ativo", { count: "exact" })
    // Por `ordem`, e nao por `id`: e a sequencia que o inspetor ve no celular
    // (`TelaDeChecklist` ordena igual). Uma listagem de gestao que mostrasse
    // outra ordem obrigaria a conferir a numeracao de cabeca para saber como
    // o checklist sai em campo.
    //
    // Sem desempate porque `ordem` e `unique` (constraint
    // `perguntas_checklist_ordem_unica`, 0042): a ordenacao ja e total e a
    // paginacao nao repete nem pula linha.
    .order("ordem", { ascending: true })
    .range(from, to);

  if (filtros.status === "ativo") query = query.eq("ativo", true);
  if (filtros.status === "inativo") query = query.eq("ativo", false);

  const { data, error, count } = await comBusca(query, filtros.busca);
  if (error) throw error;

  return { rows: (data ?? []) as PerguntaRow[], totalItems: count ?? 0 };
}

export async function getPergunta(id: number): Promise<PerguntaRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("perguntas_checklist")
    .select("id, ordem, texto, ativo")
    .eq("id", id)
    // `maybeSingle` e nao `single`: id que nao existe e um 404 da tela, nao um
    // erro do Postgres borbulhando ate a fronteira de erro do App Router.
    .maybeSingle();

  if (error) throw error;
  return data;
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
export async function getProximaOrdem(): Promise<number> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("perguntas_checklist")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.ordem ?? 0) + 1;
}

/** Colunas de texto da linha; a coluna "Ações" e montada na pagina. */
export function toTableRow(pergunta: PerguntaRow): string[] {
  return [
    String(pergunta.ordem),
    pergunta.texto,
    pergunta.ativo ? "Ativa" : "Inativa",
  ];
}
