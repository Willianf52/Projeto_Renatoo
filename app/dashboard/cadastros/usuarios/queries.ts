import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZE = 25;

/** Espelha o check constraint profiles_cargo_check (migration 0003). Um valor
 * fora desta lista nao existe no banco e filtraria para lista vazia. */
export const NIVEIS_ACESSO = [
  { value: "GESTOR", label: "Gestor" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "OPERACIONAL", label: "Operacional" },
  { value: "OPERADOR", label: "Operador" },
  { value: "CLIENTE", label: "Cliente" },
];

export const SITUACOES = [
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
];

export type UsuarioFiltros = {
  nome?: string;
  email?: string;
  nivelAcesso?: string;
  grupoUsuarios?: string;
  situacao?: "ativos" | "inativos";
  pagina: number;
};

export type FilterOption = { value: string; label: string };

export type UsuarioRow = {
  id: string;
  nome_completo: string | null;
  login: string | null;
  email: string;
  funcao: string | null;
  cargo: string;
  ativo: boolean;
  superior: { nome_completo: string | null } | null;
};

const rotuloNivel = (cargo: string) =>
  NIVEIS_ACESSO.find((nivel) => nivel.value === cargo)?.label ?? cargo;

/**
 * Neutraliza os curingas do LIKE. Sem isto, um "%" digitado na busca casaria
 * com qualquer coisa e um "_" com qualquer caractere -- a pessoa procura por
 * um nome e recebe a lista inteira, sem entender por que.
 */
const escaparLike = (valor: string) => valor.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Nivel do usuario da sessao: define se a lista mostra todos os perfis ou
 * apenas o proprio (policy "Leitura do proprio perfil ou de gestao"). */
export async function getNivelAcessoAtual(): Promise<string | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("cargo")
    .eq("id", user.id)
    .maybeSingle();

  return data?.cargo ?? null;
}

export const podeVerTodosOsUsuarios = (cargo: string | null) =>
  cargo === "GESTOR" || cargo === "SUPERVISOR";

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
