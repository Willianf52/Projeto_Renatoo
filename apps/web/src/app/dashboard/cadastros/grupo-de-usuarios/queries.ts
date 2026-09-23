import { createClient } from "@/lib/supabase/server";
import { montarHierarquiaDePerfis } from "@/lib/hierarquia-de-perfis";
import { termoParaOr } from "@/lib/postgrest-escape";
import { LIMITE_EXPORTACAO, paginar, resultadoExportacao } from "@/lib/supabase/query-helpers";

export { LIMITE_EXPORTACAO };

export const PAGE_SIZE = 25;

export type GrupoUsuariosFiltros = {
  busca?: string;
  pagina: number;
};

export type GrupoUsuariosRow = {
  id: number;
  nome: string;
  descricao: string | null;
  /**
   * Os NOMES dos membros, e nao o `count` do embed que havia aqui: a coluna
   * "Usuarios" do sistema de referencia lista as pessoas, nao quantas sao --
   * e saber QUEM esta no grupo e o que faz a tela valer a consulta.
   *
   * O custo e aceitavel porque o vinculo e pequeno por natureza: um grupo de
   * usuarios reune a equipe de um contrato, nao a base inteira. A pagina traz
   * 25 grupos, e o embed resolve tudo numa consulta so.
   *
   * `profiles` pode vir `null` quando o RLS esconde o perfil de quem esta
   * olhando -- o vinculo existe, o nome nao e legivel. Nesse caso a pessoa
   * simplesmente nao entra na lista, em vez de aparecer como um vazio.
   */
  grupos_usuarios_membros: { profiles: { nome_completo: string | null } | null }[];
};

const COLUNAS = "id, nome, descricao, grupos_usuarios_membros ( profiles ( nome_completo ) )";

/** Formato bruto do `searchParams` do Next -- cada chave pode vir repetida na
 * URL, daí o valor poder ser array. */
export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

/** Exportada para as rotas de Excel/PDF lerem exatamente os mesmos filtros da
 * listagem, sem duplicar o mapeamento campo a campo. */
export function extrairFiltros(params: SearchParams): GrupoUsuariosFiltros {
  return {
    busca: primeiro(params.busca),
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

/** Cabecalhos da tabela, sem a coluna "Ações" -- que so existe na tela. */
/** "Usuários", e nao "Membros": e o cabecalho do sistema de referencia. */
export const COLUNAS_EXPORTACAO = ["ID", "Nome", "Descrição", "Usuários"];

/** Busca livre em nome e descricao, como na tela de Grupo de Sites: quem
 * digita "portaria" espera achar tambem o grupo cuja descricao a menciona.
 * Coberta pelos indices trigram da migration 0016. */
function comBusca<Q extends { or(filtro: string): unknown }>(query: Q, busca: string | undefined): Q {
  if (!busca) return query;
  const termo = termoParaOr(busca);
  return query.or(`nome.ilike."%${termo}%",descricao.ilike."%${termo}%"`) as Q;
}

export async function getGruposUsuarios(filtros: GrupoUsuariosFiltros): Promise<{
  rows: GrupoUsuariosRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  const { from, to } = paginar(filtros.pagina, PAGE_SIZE);

  const query = comBusca(
    supabase
      .from("grupos_usuarios")
      .select(COLUNAS, { count: "exact" })
      // Sem desempate: `nome` e `not null unique` (migration 0003), entao esta
      // ordenacao ja e total -- mesma situacao de `grupos_sites.nome`.
      .order("nome", { ascending: true })
      .range(from, to),
    filtros.busca,
  );

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as unknown as GrupoUsuariosRow[], totalItems: count ?? 0 };
}

/** Mesma consulta de `getGruposUsuarios`, sem paginacao. Pede um a mais que o
 * limite para saber, sem uma segunda consulta de `count`, se foi cortado. */
export async function getGruposUsuariosParaExportar(
  busca: string | undefined,
): Promise<{ rows: GrupoUsuariosRow[]; truncado: boolean }> {
  const supabase = await createClient();

  const query = comBusca(
    supabase
      .from("grupos_usuarios")
      .select(COLUNAS)
      .order("nome", { ascending: true })
      .range(0, LIMITE_EXPORTACAO),
    busca,
  );

  const { data, error } = await query;
  if (error) throw error;

  return resultadoExportacao((data ?? []) as unknown as GrupoUsuariosRow[]);
}

export async function getGrupoUsuarios(
  id: number,
): Promise<{ id: number; nome: string; descricao: string | null } | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grupos_usuarios")
    .select("id, nome, descricao")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export type Opcao = { value: string; label: string };

/**
 * Candidatos a membro, indentados por hierarquia de chefia
 * (`profiles.superior_id`, migration 0003) como no sistema de referencia --
 * mesmo algoritmo do campo "Responsável" de Site / Planta, em
 * `lib/hierarquia-de-perfis.ts`.
 *
 * Recortado pelo RLS de `profiles` (migration 0006), o que aqui nao
 * restringe nada na pratica: quem alcanca esta tela ja passou por
 * `pode_administrar_grupos_usuarios()`, que exige `pode_ver_toda_operacao()`
 * -- e o motivo de a migration 0016 usar a conjuncao em vez de so
 * `pode_administrar_cadastros()`.
 *
 * Inclui inativos: um grupo montado antes de alguem ser desativado nao deve
 * perder o membro em silencio no proximo salvamento, que e o que aconteceria
 * se a pessoa sumisse da lista de checkboxes. `montarHierarquiaDePerfis` nao
 * sabe de `ativo`, entao o sufixo entra depois, sobre o rotulo ja indentado.
 */
export async function getCandidatosAMembro(): Promise<Opcao[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, nome_completo, superior_id, ativo")
    .order("nome_completo");

  const ativoPorId = new Map((data ?? []).map((perfil) => [perfil.id, perfil.ativo]));

  return montarHierarquiaDePerfis(data ?? []).map((opcao) => ({
    ...opcao,
    label: ativoPorId.get(opcao.value) ? opcao.label : `${opcao.label} (inativo)`,
  }));
}

/** Ids dos membros atuais, para marcar os checkboxes do formulario. */
export async function getMembros(grupoId: number): Promise<string[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("grupos_usuarios_membros")
    .select("profile_id")
    .eq("grupo_id", grupoId);

  return (data ?? []).map((membro) => membro.profile_id);
}

/** Colunas de texto da linha; a coluna "Ações" e montada na pagina. */
/**
 * A LISTAGEM nao mostra o ID, para espelhar o sistema de referencia -- la a
 * tela traz `Nome | Descricao | Usuarios`. A exportacao continua com ele: numa
 * planilha o ID e o que permite cruzar com outra lista, e tirar coluna de um
 * arquivo que alguem ja usa e regressao.
 *
 * Por ROTULO e nao por indice fixo, para uma coluna nova em
 * `COLUNAS_EXPORTACAO` nao desalinhar a listagem em silencio.
 */
const OCULTAS_NA_LISTAGEM = ["ID"];

const INDICES_DA_LISTAGEM = COLUNAS_EXPORTACAO.map((coluna, indice) =>
  OCULTAS_NA_LISTAGEM.includes(coluna) ? -1 : indice,
).filter((indice) => indice >= 0);

export const COLUNAS_DA_LISTAGEM = INDICES_DA_LISTAGEM.map(
  (indice) => COLUNAS_EXPORTACAO[indice],
);

/** A linha da tela: as mesmas celulas de `toTableRow`, sem as ocultas. */
export function toListRow(grupo: GrupoUsuariosRow): string[] {
  const completa = toTableRow(grupo);
  return INDICES_DA_LISTAGEM.map((indice) => completa[indice]);
}

/**
 * Nomes dos membros em uma celula, como na referencia.
 *
 * Ordenado por nome, e nao na ordem em que o PostgREST devolver: sem ordenacao
 * explicita a mesma tela reordena entre dois carregamentos, e uma lista que
 * dança a cada F5 e dificil de conferir. `localeCompare` com `pt-BR` para
 * "Ângela" cair junto de "Angela", e nao depois de "Z".
 */
function nomesDosMembros(grupo: GrupoUsuariosRow): string {
  return (grupo.grupos_usuarios_membros ?? [])
    .map((membro) => membro.profiles?.nome_completo?.trim())
    .filter((nome): nome is string => Boolean(nome))
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .join(", ");
}

export function toTableRow(grupo: GrupoUsuariosRow): string[] {
  return [String(grupo.id), grupo.nome, grupo.descricao ?? "", nomesDosMembros(grupo)];
}
