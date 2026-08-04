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

export async function getUsuarios(filtros: UsuarioFiltros): Promise<{
  rows: UsuarioRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  // O vinculo com grupo e N:N, entao resolve-se antes para uma lista de ids.
  let idsDoGrupo: string[] | null = null;
  if (filtros.grupoUsuarios) {
    const { data, error } = await supabase
      .from("grupos_usuarios_membros")
      .select("profile_id")
      .eq("grupo_id", filtros.grupoUsuarios);

    if (error) throw error;

    idsDoGrupo = (data ?? []).map((membro) => membro.profile_id);
    if (idsDoGrupo.length === 0) {
      return { rows: [], totalItems: 0 };
    }
  }

  const pagina = Math.max(1, filtros.pagina);
  const from = (pagina - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("profiles")
    .select(
      `
      id,
      nome_completo,
      login,
      email,
      funcao,
      cargo,
      ativo,
      superior:profiles!superior_id ( nome_completo )
      `,
      { count: "exact" },
    )
    .order("nome_completo", { ascending: true, nullsFirst: false })
    .range(from, to);

  if (idsDoGrupo !== null) query = query.in("id", idsDoGrupo);
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
