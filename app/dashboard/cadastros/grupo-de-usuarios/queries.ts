import { createClient } from "@/lib/supabase/server";
import { montarHierarquiaDePerfis } from "@/lib/hierarquia-de-perfis";
import { termoParaOr } from "@/lib/postgrest-escape";

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
   * `count` do embed, e nao a lista de membros: a listagem so mostra quantos
   * sao. Trazer as linhas para conta-las em TS puxaria a tabela de vinculos
   * inteira para exibir um numero.
   */
  grupos_usuarios_membros: [{ count: number }];
};

const COLUNAS = "id, nome, descricao, grupos_usuarios_membros ( count )";

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
export const COLUNAS_EXPORTACAO = ["ID", "Nome", "Descrição", "Membros"];

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

  const pagina = Math.max(1, filtros.pagina);
  const from = (pagina - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

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

/** Teto de linhas nas exportacoes: evita devolver uma tabela sem fim. */
export const LIMITE_EXPORTACAO = 2000;

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

  const rows = (data ?? []) as unknown as GrupoUsuariosRow[];
  return { rows: rows.slice(0, LIMITE_EXPORTACAO), truncado: rows.length > LIMITE_EXPORTACAO };
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
export function toTableRow(grupo: GrupoUsuariosRow): string[] {
  return [
    String(grupo.id),
    grupo.nome,
    grupo.descricao ?? "",
    // O embed de count volta como um array de um elemento. Sem membro nenhum
    // o PostgREST devolve `[{ count: 0 }]`, mas o `?? 0` cobre o caso de a
    // consulta ter sido montada sem o embed.
    String(grupo.grupos_usuarios_membros?.[0]?.count ?? 0),
  ];
}
