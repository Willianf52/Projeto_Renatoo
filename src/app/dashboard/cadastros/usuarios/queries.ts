import { createClient } from "@/lib/supabase/server";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { escaparLike, termoParaOr } from "@/lib/postgrest-escape";
import { paginar } from "@/lib/supabase/query-helpers";
import { FUNCOES_CONHECIDAS, NIVEIS_ACESSO, type FilterOption } from "./constantes";

export const PAGE_SIZE = 25;

// Reexportadas para as telas que ja consumiam daqui nao terem que saber da
// divisao. A fonte e `constantes.ts`, que nao importa nada -- ver o cabecalho
// de la para o motivo.
export { SITUACOES, TIPOS_USUARIO } from "./constantes";
export { NIVEIS_ACESSO, type FilterOption };

export type UsuarioFiltros = {
  busca?: string;
  funcao?: string;
  tipo?: string;
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
  /** Migration 0019. `not null default 'PADRAO'`, entao nunca vem nulo. */
  tipo: string;
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
    erro(gerarIdDeRequisicao(), "Falha ao verificar escopo de leitura de usuários:", error.message);
    return false;
  }

  return Boolean(data);
}

/** Grupos de usuarios para o select de filtro. A policy so libera a leitura
 * para gestao; para os demais a lista volta vazia e o select fica sem opcoes,
 * o que e coerente com nao poderem filtrar por grupo. */
export async function getGruposUsuarios(): Promise<FilterOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("grupos_usuarios").select("id, nome").order("nome");
  if (error) {
    erro(gerarIdDeRequisicao(), "Falha ao carregar grupos de usuários para o filtro:", error.message);
  }

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
      tipo,
      ativo,
      superior:profiles!superior_id ( nome_completo )
      ${filtrandoPorGrupo ? ", grupos_usuarios_membros!inner ( grupo_id )" : ""}
      `;
}

/**
 * Busca livre em nome, login e e-mail -- os tres campos pelos quais se procura
 * uma pessoa nesta listagem. Substituiu os filtros separados de Nome e
 * E-mail: com dois campos, quem colava um endereco no de nome recebia lista
 * vazia sem entender por que, e procurar por login nao era possivel de jeito
 * nenhum.
 *
 * `nome_completo` e `email` tem indice trigram desde a 0011; `login` ganhou o
 * dele na 0018, pelo mesmo motivo -- e basta um ramo do OR sem indice para o
 * planner varrer a tabela inteira.
 *
 * Mesma ressalva de tipo do `comBusca` de `grupo-de-sites/queries.ts`: o
 * cliente do Supabase aqui nao carrega o generic `Database`, entao o builder
 * nao expoe um tipo proprio para "o mesmo builder de volta" depois do `.or()`.
 */
function comBusca<Q extends { or(filtro: string): unknown }>(query: Q, busca: string | undefined): Q {
  if (!busca) return query;
  const termo = termoParaOr(busca);
  return query.or(
    `nome_completo.ilike."%${termo}%",login.ilike."%${termo}%",email.ilike."%${termo}%"`,
  ) as Q;
}

/** Teto de linhas lidas para montar o select de Função. */
const LIMITE_FUNCOES = 1000;

/**
 * Opcoes do filtro de Função: as conhecidas (`constantes.ts`) mais o que
 * estiver gravado. Nao e uma lista fechada porque a coluna nao e -- e um
 * select que so oferecesse as conhecidas esconderia justamente a funcao que
 * alguem acabou de inventar ao cadastrar.
 *
 * A uniao e case-insensitive: "Gestor" e "GESTOR" sao a mesma funcao escrita
 * de dois jeitos, e mostrar as duas seria oferecer duas opcoes que devolvem
 * metade das linhas cada. Prevalece a grafia que esta no banco, para o filtro
 * exibir o que os dados realmente guardam.
 *
 * O teto existe porque isto le a coluna para deduplicar em memoria: a
 * listagem pagina de 25 em 25, este select nao. Passado o teto, uma funcao que
 * so aparece depois da ultima linha lida some do select -- a busca livre
 * continua alcancando quem a tem.
 *
 * Recortado pelo RLS de `profiles` (migration 0006) como todo o resto da tela:
 * quem so enxerga o proprio perfil recebe no maximo a propria funcao, que e
 * coerente com nao ter lista para filtrar.
 */
export async function getFuncoes(): Promise<FilterOption[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("funcao")
    .not("funcao", "is", null)
    .order("funcao")
    .limit(LIMITE_FUNCOES);

  const porChave = new Map<string, string>();

  for (const perfil of data ?? []) {
    const funcao = (perfil.funcao ?? "").trim();
    if (funcao) porChave.set(funcao.toLocaleLowerCase("pt-BR"), funcao);
  }
  for (const funcao of FUNCOES_CONHECIDAS) {
    const chave = funcao.toLocaleLowerCase("pt-BR");
    if (!porChave.has(chave)) porChave.set(chave, funcao);
  }

  return [...porChave.values()]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((funcao) => ({ value: funcao, label: funcao }));
}

export async function getUsuarios(filtros: UsuarioFiltros): Promise<{
  rows: UsuarioRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  const { from, to } = paginar(filtros.pagina, PAGE_SIZE);

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
  if (filtros.tipo) query = query.eq("tipo", filtros.tipo);
  // `ilike` sem curinga, e nao `eq`: casamento exato porem indiferente a
  // caixa. A opcao escolhida pode ter vindo de `FUNCOES_CONHECIDAS`, cuja
  // grafia nao e necessariamente a que esta gravada -- com `eq`, filtrar por
  // "Gestor" nao acharia quem tem "GESTOR". Curingas digitados nao chegam
  // aqui (o valor vem do select), mas o escape fica de qualquer forma: e o
  // mesmo cuidado do resto do arquivo, e a URL e editavel a mao.
  if (filtros.funcao) query = query.ilike("funcao", escaparLike(filtros.funcao));
  if (filtros.situacao) query = query.eq("ativo", filtros.situacao === "ativos");

  query = comBusca(query, filtros.busca);

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

  const { data, error } = await query;
  if (error) {
    erro(gerarIdDeRequisicao(), "Falha ao carregar candidatos a superior:", error.message);
  }

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

  const { data, error } = await supabase
    .from("grupos_sites")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");
  if (error) {
    erro(gerarIdDeRequisicao(), "Falha ao carregar grupos de sites para escopo:", error.message);
  }

  return (data ?? []).map((grupo) => ({ value: String(grupo.id), label: grupo.nome }));
}

/** Ids dos grupos que o perfil ja enxerga. Vazio para quem nao e CLIENTE --
 * o vinculo so tem efeito nesse nivel. */
export async function getEscopoDoCliente(profileId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grupos_sites_clientes")
    .select("grupo_site_id")
    .eq("profile_id", profileId);
  if (error) {
    erro(gerarIdDeRequisicao(), "Falha ao carregar escopo do cliente:", error.message);
  }

  return (data ?? []).map((vinculo) => String(vinculo.grupo_site_id));
}

/**
 * Colunas de texto da linha; a coluna "Ações" e montada na pagina.
 *
 * A ordem espelha a tela de Usuarios do sistema de referencia -- identificacao
 * primeiro (nome, login, a quem responde), depois contato e classificacao. A
 * ordem daqui e a de `TABLE_COLUMNS` em `page.tsx` sao o mesmo contrato: mexer
 * em uma sem a outra desalinha cabecalho e celula sem erro nenhum.
 */
export function toTableRow(usuario: UsuarioRow): string[] {
  return [
    usuario.nome_completo ?? "",
    usuario.login ?? "",
    usuario.superior?.nome_completo ?? "",
    usuario.email,
    usuario.funcao ?? "",
    rotuloNivel(usuario.cargo),
    usuario.ativo ? "Ativo" : "Inativo",
  ];
}
