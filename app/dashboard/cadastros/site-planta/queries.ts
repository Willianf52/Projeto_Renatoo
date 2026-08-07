import { createClient } from "@/lib/supabase/server";
import { formatarDataHora } from "@/lib/data-hora";
import { termoParaOr } from "@/lib/postgrest-escape";

export const PAGE_SIZE = 25;

export type Situacao = "ativos" | "inativos" | "todos";

export type SiteFiltros = {
  busca?: string;
  grupoSite?: string;
  tipoServico?: string;
  responsavel?: string;
  situacao: Situacao;
  pagina: number;
};

export type SiteRow = {
  id: number;
  nome: string;
  sigla: string | null;
  regional: string | null;
  cidade: string | null;
  uf: string | null;
  observacao: string | null;
  ativo: boolean;
  criado_em: string;
  grupo_site_id: number;
  tipo_servico_id: number | null;
  responsavel_id: string | null;
  // Migration 0021.
  site_superior_id: number | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  complemento: string | null;
  pais: string;
  raio_metros: number | null;
  cod_cliente: string | null;
  cod_posto: string | null;
  filial: string | null;
  info_adicional_1: string | null;
  info_adicional_2: string | null;
  recebe_visita: boolean;
  gerar_qrcode_automatico: boolean;
  gerar_registro_coletas: boolean;
  grupos_sites: { nome: string } | null;
  tipos_servico: { nome: string } | null;
  responsavel: { nome_completo: string } | null;
  /** Quem cadastrou (`criado_por`, migration 0003). Nulo quando o perfil foi
   * apagado depois -- a FK e `on delete set null`. */
  criador: { nome_completo: string | null } | null;
};

/**
 * A FK do responsavel precisa ir nomeada (`!responsavel_id`): `sites` aponta
 * para `profiles` duas vezes -- por `responsavel_id` e por `criado_por`. Sem
 * dizer qual, o PostgREST recusa a consulta inteira com PGRST201 em vez de
 * escolher uma, e a tela cai no error boundary sem renderizar linha nenhuma.
 * Mesmo padrao de `superior:profiles!superior_id` em usuarios/queries.ts.
 *
 * Nada de comentario dentro desta string: ela vai crua na querystring do
 * PostgREST, que so tolera a remocao de espaco em branco feita pelo client.
 */
const COLUNAS = `
  id, nome, sigla, regional, cidade, uf, observacao, ativo, criado_em,
  site_superior_id, cep, endereco, numero, bairro, complemento, pais, raio_metros,
  cod_cliente, cod_posto, filial, info_adicional_1, info_adicional_2,
  recebe_visita, gerar_qrcode_automatico, gerar_registro_coletas,
  grupo_site_id, tipo_servico_id, responsavel_id,
  grupos_sites ( nome ),
  tipos_servico ( nome ),
  responsavel:profiles!responsavel_id ( nome_completo ),
  criador:profiles!criado_por ( nome_completo )
`;

/**
 * "Todos" e opcao explicita, e "Ativos" e o default -- como no sistema de
 * referencia. A tela abre escondendo site desativado, que e ruido no dia a dia.
 *
 * O preco: para quem nao repara no filtro, "desativado" e "nao existe" ficam
 * parecidos. Dai "Todos" estar na lista e nao so o par Ativos/Inativos.
 */
export const SITUACAO_PADRAO: Situacao = "ativos";

export const SITUACOES = [
  { value: "ativos", label: "Ativos" },
  { value: "todos", label: "Todos" },
  { value: "inativos", label: "Inativos" },
];

/** Formato bruto do `searchParams` do Next -- cada chave pode vir repetida na
 * URL, daí o valor poder ser array. */
export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

/**
 * Le os filtros da querystring. Exportada (nao so usada por `page.tsx`) para
 * as rotas de exportar em Excel/PDF lerem exatamente os mesmos filtros da
 * listagem, sem duplicar o mapeamento campo a campo -- mesmo arranjo de
 * `coletas-importadas/queries.ts`.
 */
export function extrairFiltros(params: SearchParams): SiteFiltros {
  const situacao = primeiro(params.situacao);

  return {
    busca: primeiro(params.busca),
    grupoSite: primeiro(params.grupo_site),
    tipoServico: primeiro(params.tipo_servico),
    responsavel: primeiro(params.responsavel),
    // Valor fora da lista cai no padrao em vez de virar filtro vazio: a URL e
    // editavel a mao, e `?situacao=xyz` mostrando tudo seria mentira silenciosa.
    situacao: SITUACOES.some((s) => s.value === situacao)
      ? (situacao as Situacao)
      : SITUACAO_PADRAO,
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

/** Cabecalhos da tabela, sem a coluna "Ações" -- que so existe na tela.
 * Compartilhados com as duas rotas de exportacao. */
export const COLUNAS_EXPORTACAO = [
  "ID",
  "Regional",
  "Nome",
  "Sigla",
  "Hierarquia",
  "Observação",
  "Cidade",
  "UF",
  "Usuário",
  "Data Criação",
  "Status",
];

/**
 * Posicao da celula de Hierarquia dentro da linha.
 *
 * A tela renderiza a cadeia com separadores e destaque no ultimo nivel; a
 * exportacao leva o texto simples. Constante exportada, e nao numero solto em
 * `page.tsx`, porque ela so faz sentido junto da lista acima -- mexer na ordem
 * sem mexer aqui poria a cadeia na coluna errada.
 */
export const INDICE_HIERARQUIA = COLUNAS_EXPORTACAO.indexOf("Hierarquia");

/**
 * Organizacao no topo da hierarquia. Fixa, como na barra superior
 * (`DashboardLayout`) -- quando existir tabela de organizacoes, as duas passam
 * a ler de la.
 */
export const ORGANIZACAO = "UP Serviços";

/**
 * Busca livre em nome, sigla e cidade -- os tres campos por onde se procura
 * uma unidade na pratica. Coberta pelos indices trigram da migration 0012;
 * `ilike '%termo%'` nao usa btree comum.
 *
 * Mesmo padrao (e mesma ressalva de tipo) de `comBusca` em
 * `grupo-de-sites/queries.ts`: o cliente do Supabase aqui nao carrega o
 * generic `Database`, entao o builder do PostgREST nao expoe um tipo proprio
 * para "o mesmo builder de volta" depois do `.or()`.
 */
function comBusca<Q extends { or(filtro: string): unknown }>(query: Q, busca: string | undefined): Q {
  if (!busca) return query;

  const termo = termoParaOr(busca);
  const ramos = [
    `nome.ilike."%${termo}%"`,
    `sigla.ilike."%${termo}%"`,
    `cidade.ilike."%${termo}%"`,
    `regional.ilike."%${termo}%"`,
  ];

  // `id` e bigint: `ilike` nele nao existe, e mandar `id.eq.abc` faz o
  // PostgREST recusar a consulta inteira (22P02). Por isso o ramo do id so
  // entra quando o termo e so digito -- procurar por "439341" acha o site,
  // procurar por "Rafard" nem tenta.
  if (/^\d+$/.test(busca)) ramos.push(`id.eq.${busca}`);

  return query.or(ramos.join(",")) as Q;
}

/** `query: any` pelo mesmo motivo descrito em `coletas-importadas/queries.ts`:
 * reencadear tipado exigiria repetir cada metodo do builder na assinatura. */
function aplicarFiltros(query: any, filtros: Omit<SiteFiltros, "pagina">) {
  let q = comBusca(query, filtros.busca);

  if (filtros.grupoSite) q = q.eq("grupo_site_id", filtros.grupoSite);
  if (filtros.tipoServico) q = q.eq("tipo_servico_id", filtros.tipoServico);
  if (filtros.responsavel) q = q.eq("responsavel_id", filtros.responsavel);

  // "todos" nao filtra -- e a unica das tres opcoes que nao vira clausula.
  if (filtros.situacao === "ativos") q = q.eq("ativo", true);
  if (filtros.situacao === "inativos") q = q.eq("ativo", false);

  return q;
}

export async function getSites(filtros: SiteFiltros): Promise<{
  rows: SiteRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  const pagina = Math.max(1, filtros.pagina);
  const from = (pagina - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const query = aplicarFiltros(
    supabase
      .from("sites")
      .select(COLUNAS, { count: "exact" })
      .order("nome", { ascending: true })
      // Desempate obrigatorio, ao contrario de `grupos_sites`: a unicidade de
      // `sites.nome` e do par com o grupo (migration 0012), nao da coluna --
      // dois grupos podem ter uma "Agencia Centro" cada. Sem o desempate, a
      // ordem entre elas nao e garantida e a paginacao pode repetir uma e
      // pular outra.
      .order("id", { ascending: true })
      .range(from, to),
    filtros,
  );

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as unknown as SiteRow[], totalItems: count ?? 0 };
}

/** Teto de linhas nas exportacoes: evita devolver uma tabela sem fim. */
export const LIMITE_EXPORTACAO = 2000;

/**
 * Mesma consulta de `getSites`, sem paginacao -- para os botoes de exportar,
 * que precisam do resultado inteiro dentro do filtro, nao so a pagina atual.
 * Pede um a mais que o limite para saber, sem uma segunda consulta de `count`,
 * se o resultado foi cortado.
 */
export async function getSitesParaExportar(
  filtros: Omit<SiteFiltros, "pagina">,
): Promise<{ rows: SiteRow[]; truncado: boolean }> {
  const supabase = await createClient();

  const query = aplicarFiltros(
    supabase
      .from("sites")
      .select(COLUNAS)
      .order("nome", { ascending: true })
      .order("id", { ascending: true })
      .range(0, LIMITE_EXPORTACAO),
    filtros,
  );

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as SiteRow[];
  return { rows: rows.slice(0, LIMITE_EXPORTACAO), truncado: rows.length > LIMITE_EXPORTACAO };
}

export async function getSite(id: number): Promise<SiteRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("sites").select(COLUNAS).eq("id", id).maybeSingle();

  if (error) throw error;
  return data as unknown as SiteRow | null;
}

export type Opcao = { value: string; label: string };

type PerfilBruto = { id: string; nome_completo: string | null; superior_id: string | null };

/**
 * Monta a lista de responsaveis achatada porem indentada por hierarquia, como
 * no sistema de referencia: `->Gesiel` no primeiro nivel, `--->Gilmar` abaixo
 * dele. A relacao vem de `profiles.superior_id` (migration 0003).
 *
 * Achatada e nao aninhada porque o destino e um `<option>`, que nao aceita
 * estrutura -- o prefixo e o unico jeito de mostrar profundidade ali.
 *
 * Raiz e quem nao tem superior OU cujo superior nao veio na consulta: o RLS de
 * `profiles` (migration 0006) recorta a lista, e sem esta segunda condicao uma
 * pessoa cujo chefe ficou de fora sumiria da lista inteira, em vez de aparecer
 * no topo.
 */
export function montarHierarquiaDeResponsaveis(perfis: PerfilBruto[]): Opcao[] {
  const filhos = new Map<string | null, PerfilBruto[]>();
  const ids = new Set(perfis.map((p) => p.id));

  for (const perfil of perfis) {
    const pai = perfil.superior_id && ids.has(perfil.superior_id) ? perfil.superior_id : null;
    filhos.set(pai, [...(filhos.get(pai) ?? []), perfil]);
  }

  const opcoes: Opcao[] = [];
  // `superior_id` nao tem trava contra ciclo no banco (A chefia B, B chefia A).
  // Sem este conjunto a recursao nao terminaria e a tela travaria no servidor.
  const visitados = new Set<string>();

  const incluir = (perfil: PerfilBruto, profundidade: number) => {
    visitados.add(perfil.id);
    opcoes.push({
      value: perfil.id,
      label: `${"-".repeat(2 * profundidade + 1)}>${perfil.nome_completo || "(sem nome)"}`,
    });
  };

  const descer = (pai: string | null, profundidade: number) => {
    for (const perfil of filhos.get(pai) ?? []) {
      if (visitados.has(perfil.id)) continue;
      incluir(perfil, profundidade);
      descer(perfil.id, profundidade + 1);
    }
  };

  descer(null, 0);

  // Num ciclo fechado ninguem e raiz, entao a descida acima nao alcanca
  // ninguem do ciclo e as pessoas sumiriam da lista em silencio -- pior que o
  // loop que o conjunto de visitados evita. Quem sobrou entra no primeiro
  // nivel: melhor aparecer sem a hierarquia certa do que nao aparecer.
  for (const perfil of perfis) {
    if (!visitados.has(perfil.id)) incluir(perfil, 0);
  }

  return opcoes;
}

/**
 * Listas para os selects, tanto do filtro quanto do formulario.
 *
 * Sem o recorte de `ativo` que `coletas-importadas/queries.ts` aplica: la as
 * opcoes filtram dado historico e um grupo desativado nao interessa mais;
 * aqui elas preenchem um cadastro que pode estar justamente sendo corrigido
 * para sair de um grupo desativado. Esconder a opcao impediria a correcao.
 */
export async function getOpcoes(): Promise<{
  gruposSites: Opcao[];
  tiposServico: Opcao[];
  responsaveis: Opcao[];
}> {
  const supabase = await createClient();

  const [grupos, tipos, perfis] = await Promise.all([
    supabase.from("grupos_sites").select("id, nome").order("nome"),
    supabase.from("tipos_servico").select("id, nome").order("nome"),
    // `profiles` e recortado pelo RLS (migration 0006): um operador so enxerga
    // a propria linha. A lista fica curta para quem nao e gestao, o que e o
    // comportamento correto -- e quem nao e gestao tambem nao edita cadastro.
    //
    // Ordenado por nome ja aqui: `montarHierarquiaDeResponsaveis` preserva a
    // ordem de entrada dentro de cada nivel, entao a arvore sai alfabetica
    // irmao a irmao sem precisar reordenar depois.
    supabase
      .from("profiles")
      .select("id, nome_completo, superior_id")
      .eq("ativo", true)
      .order("nome_completo"),
  ]);

  return {
    gruposSites: (grupos.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
    tiposServico: (tipos.data ?? []).map((t) => ({ value: String(t.id), label: t.nome })),
    responsaveis: montarHierarquiaDeResponsaveis(perfis.data ?? []),
  };
}

/**
 * Candidatos a "Site Superior" (migration 0021). Exclui o proprio site em
 * edicao -- nenhum site e pai de si mesmo, e a action recusa esse caso de
 * qualquer forma; tirar da lista evita oferecer a opcao so para recusa-la.
 *
 * Nao exclui os descendentes: barrar A > B > A exigiria descer a arvore aqui,
 * e o ganho nao paga o custo enquanto a hierarquia for rasa. O ciclo, se
 * acontecer, aparece na coluna Hierarquia da listagem, que corta em tres
 * niveis e nao entra em loop.
 */
export async function getSitesParaSuperior(excluirId?: number): Promise<Opcao[]> {
  const supabase = await createClient();

  let query = supabase.from("sites").select("id, nome").order("nome");
  if (excluirId !== undefined) query = query.neq("id", excluirId);

  const { data } = await query;

  return (data ?? []).map((site) => ({ value: String(site.id), label: site.nome }));
}

/**
 * Cadeia organizacao > grupo de sites > site, como na coluna "Hierarquia" do
 * sistema de referencia.
 *
 * Sao tres niveis e nao mais: `grupos_sites` nao tem pai (migration 0003) --
 * ela ja E o cliente, conforme o comentario da propria tabela. A referencia
 * mostra a mesma profundidade.
 */
export function montarHierarquia(site: SiteRow): string[] {
  return [ORGANIZACAO, site.grupos_sites?.nome, site.nome].filter(
    (nivel): nivel is string => Boolean(nivel),
  );
}

/** Colunas de texto da linha; a coluna "Ações" e montada na pagina. */
export function toTableRow(site: SiteRow): string[] {
  return [
    String(site.id),
    site.regional ?? "",
    site.nome,
    site.sigla ?? "",
    montarHierarquia(site).join(" > "),
    site.observacao ?? "",
    site.cidade ?? "",
    site.uf ?? "",
    site.criador?.nome_completo ?? "",
    formatarDataHora(site.criado_em),
    site.ativo ? "Ativo" : "Inativo",
  ];
}
