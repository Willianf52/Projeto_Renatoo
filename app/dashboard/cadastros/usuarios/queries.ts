import { createClient } from "@/lib/supabase/server";
import { escaparLike } from "@/lib/postgrest-escape";
import { NIVEIS_ACESSO, type FilterOption } from "./constantes";

export const PAGE_SIZE = 25;

// Reexportadas para as telas que ja consumiam daqui nao terem que saber da
// divisao. A fonte e `constantes.ts`, que nao importa nada -- ver o cabecalho
// de la para o motivo.
export { SITUACOES } from "./constantes";
export { NIVEIS_ACESSO, type FilterOption };

export type UsuarioFiltros = {
  nome?: string;
  email?: string;
  nivelAcesso?: string;
  grupoUsuarios?: string;
  situacao?: "ativos" | "inativos";
  pagina: number;
};

export type UsuarioRow = {
  id: string;
  nome_completo: string | null;
  login: string | null;
  email: string;
  funcao: string | null;
  cargo: string;
  ativo: boolean;
  superior: { nome_completo: string | null } | null;
  /** So vem em `getUsuario`, para preencher o select do formulario -- a
   * listagem exibe o nome do superior, nao o id. */
  superior_id?: string | null;
};

const rotuloNivel = (cargo: string) =>
  NIVEIS_ACESSO.find((nivel) => nivel.value === cargo)?.label ?? cargo;

/**
 * Chama `pode_ver_toda_operacao()` (migration 0006) direto via RPC, em vez de
 * buscar `cargo` e reimplementar a regra em TS: define se a lista mostra
 * todos os perfis ou so o proprio (policy "Leitura do proprio perfil ou de
 * gestao"). Mesma razao do `podeAdministrarCadastros()` em
 * `grupo-de-sites/queries.ts` -- a funcao e `security definer`, estavel e ja
 * tem `grant execute` para `authenticated`.
 */
export async function podeVerTodaOperacao(): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("pode_ver_toda_operacao");

  if (error) {
    console.error("Falha ao verificar escopo de leitura de usuários:", error.message);
    return false;
  }

  return Boolean(data);
}

/** Grupos de usuarios para o select de filtro. A policy so libera a leitura
 * para gestao; para os demais a lista volta vazia e o select fica sem opcoes,
 * o que e coerente com nao poderem filtrar por grupo. */
export async function getGruposUsuarios(): Promise<FilterOption[]> {
  const supabase = await createClient();

  const { data } = await supabase.from("grupos_usuarios").select("id, nome").order("nome");

  return (data ?? []).map((grupo) => ({ value: String(grupo.id), label: grupo.nome }));
}

/**
 * O vinculo com grupo e N:N. Resolver antes para uma lista de profile_ids e
 * passa-la num `.in(...)` -- como era feito aqui -- esbarra no teto de linhas
 * por resposta do PostgREST: num grupo grande a lista volta truncada e parte
 * dos membros some da listagem sem erro nenhum. O join com `!inner` filtra no
 * banco, entra so quando ha filtro por grupo e nao duplica linha: a policy da
 * tabela de membros ja limita o embed, e a PK (grupo_id, profile_id) garante
 * no maximo um vinculo por grupo.
 */
export function montarSelectDeUsuarios(filtrandoPorGrupo: boolean): string {
  return `
      id,
      nome_completo,
      login,
      email,
      funcao,
      cargo,
      ativo,
      superior:profiles!superior_id ( nome_completo )
      ${filtrandoPorGrupo ? ", grupos_usuarios_membros!inner ( grupo_id )" : ""}
      `;
}

export async function getUsuarios(filtros: UsuarioFiltros): Promise<{
  rows: UsuarioRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  const pagina = Math.max(1, filtros.pagina);
  const from = (pagina - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("profiles")
    .select(montarSelectDeUsuarios(Boolean(filtros.grupoUsuarios)), { count: "exact" })
    .order("nome_completo", { ascending: true, nullsFirst: false })
    // Homonimo e perfil sem nome preenchido empatam nesta ordenacao. Sem
    // desempate a ordem entre eles varia de consulta para consulta, e como
    // cada pagina e uma consulta nova, um usuario pode se repetir numa pagina
    // e sumir da outra.
    .order("id", { ascending: true })
    .range(from, to);

  if (filtros.grupoUsuarios) {
    query = query.eq("grupos_usuarios_membros.grupo_id", filtros.grupoUsuarios);
  }
  if (filtros.nivelAcesso) query = query.eq("cargo", filtros.nivelAcesso);
  if (filtros.situacao) query = query.eq("ativo", filtros.situacao === "ativos");
  if (filtros.nome) query = query.ilike("nome_completo", `%${escaparLike(filtros.nome)}%`);
  if (filtros.email) query = query.ilike("email", `%${escaparLike(filtros.email)}%`);

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as unknown as UsuarioRow[], totalItems: count ?? 0 };
}

export async function getUsuario(id: string): Promise<UsuarioRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(montarSelectDeUsuarios(false) + ", superior_id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as UsuarioRow | null;
}

/**
 * Candidatos ao campo "Superior" do formulario. Exclui o proprio usuario que
 * esta sendo editado -- ninguem e superior de si mesmo, e a action recusa esse
 * caso de qualquer forma; tirar da lista evita oferecer a opcao so para
 * recusa-la depois.
 */
export async function getSuperiores(excluirId?: string): Promise<FilterOption[]> {
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("id, nome_completo")
    .eq("ativo", true)
    .order("nome_completo");

  if (excluirId) query = query.neq("id", excluirId);

  const { data } = await query;

  return (data ?? []).map((perfil) => ({
    value: perfil.id,
    label: perfil.nome_completo || "(sem nome)",
  }));
}

/**
 * Grupos de sites que podem ser atribuidos a um CLIENTE (migration 0014).
 *
 * Lida com o token de quem edita, nao com service_role: quem administra
 * usuarios e GESTOR, e a policy da 0014 devolve todos os grupos para quem nao
 * e CLIENTE -- entao a lista ja vem completa sem precisar contornar o RLS.
 */
export async function getGruposSitesParaEscopo(): Promise<FilterOption[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("grupos_sites")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  return (data ?? []).map((grupo) => ({ value: String(grupo.id), label: grupo.nome }));
}

/** Ids dos grupos que o perfil ja enxerga. Vazio para quem nao e CLIENTE --
 * o vinculo so tem efeito nesse nivel. */
export async function getEscopoDoCliente(profileId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("grupos_sites_clientes")
    .select("grupo_site_id")
    .eq("profile_id", profileId);

  return (data ?? []).map((vinculo) => String(vinculo.grupo_site_id));
}

export function toTableRow(usuario: UsuarioRow): string[] {
  return [
    usuario.nome_completo ?? "",
    usuario.login ?? "",
    usuario.email,
    usuario.funcao ?? "",
    rotuloNivel(usuario.cargo),
    usuario.superior?.nome_completo ?? "",
    usuario.ativo ? "Ativo" : "Inativo",
  ];
}
