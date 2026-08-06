import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZE = 25;

export type ColetaFiltros = {
  dataInicial?: string;
  dataFinal?: string;
  horaInicial?: string;
  horaFinal?: string;
  localizacao?: "com" | "sem";
  coletorDados?: string;
  qualificador?: string;
  motivoVisita?: string;
  funcionario?: string;
  local?: string;
  grupoSite?: string;
  evento?: string;
  tipo?: string;
  area?: string;
  checkpoint?: string;
  pagina: number;
};

/** Formato bruto do `searchParams` do Next -- cada chave pode vir repetida na
 * URL, daí o valor poder ser array. */
export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

/**
 * Le os filtros da querystring. Exportada (nao so usada por `page.tsx`) para
 * as rotas de exportar em Excel/PDF lerem exatamente os mesmos filtros da
 * listagem, sem duplicar o mapeamento campo a campo.
 */
export function extrairFiltros(params: SearchParams): ColetaFiltros {
  return {
    dataInicial: primeiro(params.data_inicial),
    dataFinal: primeiro(params.data_final),
    horaInicial: primeiro(params.hora_inicial),
    horaFinal: primeiro(params.hora_final),
    localizacao: primeiro(params.localizacao) as "com" | "sem" | undefined,
    coletorDados: primeiro(params.coletor_dados),
    qualificador: primeiro(params.qualificador),
    motivoVisita: primeiro(params.motivo_visita),
    funcionario: primeiro(params.funcionario),
    local: primeiro(params.local),
    grupoSite: primeiro(params.grupo_site),
    evento: primeiro(params.evento),
    tipo: primeiro(params.tipo),
    area: primeiro(params.area),
    checkpoint: primeiro(params.checkpoint),
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

export type FilterOption = { value: string; label: string };

export type FilterOptions = {
  locais: FilterOption[];
  gruposSites: FilterOption[];
  tipos: FilterOption[];
  coletoresDados: FilterOption[];
  qualificadores: FilterOption[];
  motivosVisita: FilterOption[];
  funcionarios: FilterOption[];
  eventos: FilterOption[];
  areas: FilterOption[];
  checkpoints: FilterOption[];
};

export type ColetaRow = {
  id: number;
  data_hora: string;
  observacao: string | null;
  latitude: number | null;
  data_integracao: string | null;
  areas: { nome: string } | null;
  eventos: { nome: string } | null;
  acoes: { nome: string } | null;
  qualificadores: { nome: string } | null;
  qr_codes: { codigo: string } | null;
  visitas: {
    numero_coleta: number;
    profiles: { nome_completo: string } | null;
    coletores_dados: { nome: string } | null;
    sites: { nome: string } | null;
  } | null;
};

function toOptions<T extends Record<string, unknown>>(
  rows: T[] | null,
  idKey: keyof T,
  labelKey: keyof T,
): FilterOption[] {
  return (rows ?? []).map((row) => ({
    value: String(row[idKey]),
    label: String(row[labelKey]),
  }));
}

/** Tudo menos `funcionarios` -- ver o comentario do cache logo abaixo. */
type ReferenciasCompartilhadas = Omit<FilterOptions, "funcionarios">;

/**
 * Cache de processo para as tabelas de referencia: mudam raramente e a policy
 * de RLS de todas elas e `usuario_ativo()` (migrations 0003/0004/0006), sem
 * recorte por usuario -- qualquer um que chegue aqui ja passou pelo middleware
 * e enxerga exatamente a mesma lista.
 *
 * `funcionarios` fica deliberadamente de fora. Vem de `profiles`, cuja policy e
 * `auth.uid() = id or pode_ver_toda_operacao()` (migration 0006): um gestor le
 * a operacao inteira, um operador le so a propria linha. Cacheado junto com o
 * resto, o primeiro gestor a abrir a tela deixaria o quadro de funcionarios
 * inteiro no cache e os operadores seguintes receberiam essa lista pronta --
 * o RLS seria contornado pelo cache, sem erro nenhum aparecendo.
 *
 * unstable_cache do Next nao serve aqui: createClient() chama cookies()
 * internamente, e ler dynamic APIs dentro de uma funcao cacheada por ele nao
 * e suportado. Por isso o cache manual com TTL abaixo.
 */
const FILTER_OPTIONS_TTL_MS = 60_000;
let referenciasCache: { data: ReferenciasCompartilhadas; expiresAt: number } | null = null;

async function getReferenciasCompartilhadas(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ReferenciasCompartilhadas> {
  if (referenciasCache && referenciasCache.expiresAt > Date.now()) {
    return referenciasCache.data;
  }

  const respostas = await Promise.all([
    supabase.from("sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("tipos_servico").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("coletores_dados").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("qualificadores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("motivos_visita").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("areas").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("qr_codes").select("id, codigo").eq("ativo", true).order("codigo"),
  ]);

  const [
    locais,
    gruposSites,
    tipos,
    coletoresDados,
    qualificadores,
    motivosVisita,
    eventos,
    areas,
    checkpoints,
  ] = respostas;

  const referencias: ReferenciasCompartilhadas = {
    locais: toOptions(locais.data, "id", "nome"),
    gruposSites: toOptions(gruposSites.data, "id", "nome"),
    tipos: toOptions(tipos.data, "id", "nome"),
    coletoresDados: toOptions(coletoresDados.data, "id", "nome"),
    qualificadores: toOptions(qualificadores.data, "id", "nome"),
    motivosVisita: toOptions(motivosVisita.data, "id", "nome"),
    eventos: toOptions(eventos.data, "id", "nome"),
    areas: toOptions(areas.data, "id", "nome"),
    checkpoints: toOptions(checkpoints.data, "id", "codigo"),
  };

  /**
   * Falha nao entra no cache.
   *
   * Cada consulta e lida so por `.data`, e um erro faz `data` vir null -- que
   * `toOptions` transforma no mesmo `[]` de uma tabela legitimamente vazia.
   * Guardado, esse vazio vira 60 segundos de select sem opcao para todo mundo
   * que abrir a tela, sem erro nenhum aparecendo e sem recarregar resolver.
   * Sem guardar, a proxima requisicao tenta de novo.
   */
  if (respostas.some((resposta) => resposta.error)) {
    return referencias;
  }

  referenciasCache = { data: referencias, expiresAt: Date.now() + FILTER_OPTIONS_TTL_MS };
  return referencias;
}

/** Listas para popular os selects de filtro. */
export async function getFilterOptions(): Promise<FilterOptions> {
  const supabase = await createClient();

  // A lista de funcionarios e resolvida a cada requisicao, com o token de quem
  // pediu, para que o recorte do RLS sobre `profiles` continue valendo.
  const [referencias, funcionarios] = await Promise.all([
    getReferenciasCompartilhadas(supabase),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
  ]);

  return { ...referencias, funcionarios: toOptions(funcionarios.data, "id", "nome_completo") };
}

/** Apenas para teste: zera o cache entre casos. */
export function __limparCacheDeReferencias() {
  referenciasCache = null;
}

/**
 * Fuso da operacao (Brasilia). Fixo em -03:00: o Brasil nao observa mais
 * horario de verao desde 2019, entao o deslocamento nao varia ao longo do
 * ano -- nao ha caso em que -02:00 se aplicaria.
 */
const FUSO_OPERACIONAL = "-03:00";

/**
 * Combina data (yyyy-mm-dd) e hora (HH:MM) num timestamp para o filtro de
 * periodo. Sem data, nao ha limite para aplicar.
 *
 * O deslocamento vai explicito no timestamp -- sem ele, o Postgres
 * interpretaria o horario conforme o fuso da conexao, nao o fuso em que a
 * visita realmente aconteceu. Funciona por coincidencia quando os dois
 * fusos combinam; diverge em silencio quando nao combinam.
 */
export function combinarDataHora(
  data: string | undefined,
  hora: string | undefined,
  horaPadrao: string,
) {
  if (!data) return null;
  return `${data}T${hora ? `${hora}:00` : horaPadrao}${FUSO_OPERACIONAL}`;
}

/**
 * O `!inner` entra so quando ha filtro naquele nivel. Ligado sempre, ele
 * excluiria leituras validas cuja visita nao tem funcionario, motivo ou
 * coletor preenchido -- FKs opcionais -- por causa de um join que ninguem
 * pediu. Ligado sob demanda, a exclusao e exatamente o que o filtro quer
 * dizer: quem filtra por um funcionario nao espera ver leitura sem
 * funcionario.
 */
export function montarSelectDeColetas(precisaVisita: boolean, precisaSite: boolean): string {
  return `
      id,
      data_hora,
      observacao,
      latitude,
      data_integracao,
      areas ( nome ),
      eventos ( nome ),
      acoes ( nome ),
      qualificadores ( nome ),
      qr_codes ( codigo ),
      ${precisaVisita ? "visitas!inner" : "visitas"} (
        numero_coleta,
        profiles ( nome_completo ),
        coletores_dados ( nome ),
        ${precisaSite ? "sites!inner" : "sites"} ( nome )
      )
      `;
}

type ColetaFiltrosSemPagina = Omit<ColetaFiltros, "pagina">;

function precisaJoins(filtros: ColetaFiltrosSemPagina) {
  const precisaSite = Boolean(filtros.local || filtros.grupoSite || filtros.tipo);
  const precisaVisita =
    precisaSite || Boolean(filtros.funcionario || filtros.motivoVisita || filtros.coletorDados);
  return { precisaSite, precisaVisita };
}

/**
 * Aplica os filtros de `ColetaFiltros` (exceto paginacao) num builder ja
 * criado por `.from("leituras").select(...)`. Extraida para ser reaproveitada
 * por `getColetasParaExportar`, que precisa dos mesmos filtros sem a
 * paginacao.
 *
 * `query: any`: o cliente do Supabase aqui nao carrega o generic `Database`
 * (nenhum arquivo em `lib/supabase/` declara um), entao o builder do
 * PostgREST nao tem um tipo proprio para expor "o mesmo builder de volta" a
 * cada `.eq()`/`.not()`/`.is()`/`.gte()`/`.lte()` encadeado -- reencadear
 * tipado exigiria repetir cada metodo na assinatura da funcao so para isto.
 */
function aplicarFiltrosDeColeta(query: any, filtros: ColetaFiltrosSemPagina) {
  let q = query;

  if (filtros.local) q = q.eq("visitas.sites.id", filtros.local);
  if (filtros.grupoSite) q = q.eq("visitas.sites.grupo_site_id", filtros.grupoSite);
  if (filtros.tipo) q = q.eq("visitas.sites.tipo_servico_id", filtros.tipo);
  if (filtros.funcionario) q = q.eq("visitas.funcionario_id", filtros.funcionario);
  if (filtros.motivoVisita) q = q.eq("visitas.motivo_visita_id", filtros.motivoVisita);
  if (filtros.coletorDados) q = q.eq("visitas.coletor_dados_id", filtros.coletorDados);
  if (filtros.area) q = q.eq("area_id", filtros.area);
  if (filtros.evento) q = q.eq("evento_id", filtros.evento);
  if (filtros.qualificador) q = q.eq("qualificador_id", filtros.qualificador);
  if (filtros.checkpoint) q = q.eq("qr_code_id", filtros.checkpoint);
  if (filtros.localizacao === "com") q = q.not("latitude", "is", null);
  if (filtros.localizacao === "sem") q = q.is("latitude", null);

  const inicio = combinarDataHora(filtros.dataInicial, filtros.horaInicial, "00:00:00");
  const fim = combinarDataHora(filtros.dataFinal, filtros.horaFinal, "23:59:59");
  if (inicio) q = q.gte("data_hora", inicio);
  if (fim) q = q.lte("data_hora", fim);

  return q;
}

export async function getColetas(filtros: ColetaFiltros): Promise<{
  rows: ColetaRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  const pagina = Math.max(1, filtros.pagina);
  const from = (pagina - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { precisaSite, precisaVisita } = precisaJoins(filtros);

  // Site e visita sao filtrados dentro da propria consulta. Resolver antes
  // para uma lista de ids e passa-la num `.in(...)` -- como era feito aqui --
  // esbarra no teto de linhas por resposta do PostgREST: acima dele a lista de
  // ids volta truncada e a pagina de coletas fica incompleta sem erro nenhum.
  const query = aplicarFiltrosDeColeta(
    supabase
      .from("leituras")
      /**
       * `estimated` e nao `exact`: o total exato custa uma varredura da
       * tabela inteira com os filtros aplicados, a cada troca de pagina, e
       * `leituras` e a tabela que mais cresce aqui. O PostgREST devolve a
       * contagem exata enquanto ela e pequena e passa a usar a estimativa do
       * planejador quando fica grande -- ou seja, o numero so vira
       * aproximacao justamente onde a precisao deixa de importar. Ver
       * `totalAproximado` na DataTable: a tela marca o valor com "~" para
       * nao apresentar palpite como contagem.
       */
      .select(montarSelectDeColetas(precisaVisita, precisaSite), { count: "estimated" })
      .order("data_hora", { ascending: false })
      // Desempate obrigatorio: varias leituras da mesma visita compartilham o
      // mesmo data_hora. Sem um segundo criterio o Postgres nao garante ordem
      // entre elas, e cada pagina e uma consulta nova -- a mesma linha pode
      // aparecer na pagina 2 e na 3, enquanto outra nao aparece em nenhuma.
      .order("id", { ascending: false })
      .range(from, to),
    filtros,
  );

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as unknown as ColetaRow[], totalItems: count ?? 0 };
}

/** Teto de linhas nas exportacoes: evita devolver uma tabela sem fim, e
 * particularmente importante aqui -- `leituras` e a tabela que mais cresce. */
export const LIMITE_EXPORTACAO = 2000;

/**
 * Mesma consulta de `getColetas`, sem paginacao -- para os botoes de
 * exportar, que precisam do resultado inteiro dentro do filtro, nao so a
 * pagina atual. Pede um a mais que o limite para saber, sem uma segunda
 * consulta de `count`, se o resultado foi cortado.
 */
export async function getColetasParaExportar(
  filtros: ColetaFiltrosSemPagina,
): Promise<{ rows: ColetaRow[]; truncado: boolean }> {
  const supabase = await createClient();

  const { precisaSite, precisaVisita } = precisaJoins(filtros);

  const query = aplicarFiltrosDeColeta(
    supabase
      .from("leituras")
      .select(montarSelectDeColetas(precisaVisita, precisaSite))
      .order("data_hora", { ascending: false })
      .order("id", { ascending: false })
      .range(0, LIMITE_EXPORTACAO),
    filtros,
  );

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as ColetaRow[];
  return { rows: rows.slice(0, LIMITE_EXPORTACAO), truncado: rows.length > LIMITE_EXPORTACAO };
}

export function formatarDataHora(valor: string | null): string {
  if (!valor) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(valor),
  );
}

/**
 * Colunas de texto da linha, na mesma ordem de `TABLE_COLUMNS` em
 * `page.tsx` (menos "Ações", que so existe na tela -- a pagina acrescenta a
 * coluna vazia por conta propria). Reaproveitada pelas exportacoes de
 * Excel/PDF para nao duplicar o mapeamento campo a campo.
 */
export function toTableRow(leitura: ColetaRow): string[] {
  return [
    leitura.visitas ? String(leitura.visitas.numero_coleta) : "",
    formatarDataHora(leitura.data_hora),
    leitura.visitas?.coletores_dados?.nome ?? "",
    leitura.visitas?.profiles?.nome_completo ?? "",
    leitura.visitas?.sites?.nome ?? "",
    leitura.areas?.nome ?? "",
    leitura.eventos?.nome ?? "",
    leitura.observacao ?? "",
    leitura.acoes?.nome ?? "",
    leitura.qualificadores?.nome ?? "",
    formatarDataHora(leitura.data_integracao),
  ];
}
