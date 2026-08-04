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

type ColetaRow = {
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

/**
 * Cache de processo para getFilterOptions: as 10 tabelas de referencia abaixo
 * mudam raramente e o mesmo resultado vale para qualquer usuario ativo (RLS
 * ja garante isso -- ver migrations 0003/0004/0006), entao nao ha risco de
 * vazar dado de um usuario para outro guardando isso fora do request.
 *
 * unstable_cache do Next nao serve aqui: createClient() chama cookies()
 * internamente, e ler dynamic APIs dentro de uma funcao cacheada por ele nao
 * e suportado. Por isso o cache manual com TTL abaixo.
 */
const FILTER_OPTIONS_TTL_MS = 60_000;
let filterOptionsCache: { data: FilterOptions; expiresAt: number } | null = null;

/** Listas para popular os selects de filtro. Tabelas de referencia, leitura
 * liberada para qualquer usuario ativo (ver migrations 0003/0004/0006). */
export async function getFilterOptions(): Promise<FilterOptions> {
  if (filterOptionsCache && filterOptionsCache.expiresAt > Date.now()) {
    return filterOptionsCache.data;
  }

  const supabase = await createClient();

  const [
    locais,
    gruposSites,
    tipos,
    coletoresDados,
    qualificadores,
    motivosVisita,
    funcionarios,
    eventos,
    areas,
    checkpoints,
  ] = await Promise.all([
    supabase.from("sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("tipos_servico").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("coletores_dados").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("qualificadores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("motivos_visita").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
    supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("areas").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("qr_codes").select("id, codigo").eq("ativo", true).order("codigo"),
  ]);

  const options: FilterOptions = {
    locais: toOptions(locais.data, "id", "nome"),
    gruposSites: toOptions(gruposSites.data, "id", "nome"),
    tipos: toOptions(tipos.data, "id", "nome"),
    coletoresDados: toOptions(coletoresDados.data, "id", "nome"),
    qualificadores: toOptions(qualificadores.data, "id", "nome"),
    motivosVisita: toOptions(motivosVisita.data, "id", "nome"),
    funcionarios: toOptions(funcionarios.data, "id", "nome_completo"),
    eventos: toOptions(eventos.data, "id", "nome"),
    areas: toOptions(areas.data, "id", "nome"),
    checkpoints: toOptions(checkpoints.data, "id", "codigo"),
  };

  filterOptionsCache = { data: options, expiresAt: Date.now() + FILTER_OPTIONS_TTL_MS };
  return options;
}

/** Combina data (yyyy-mm-dd) e hora (HH:MM) num timestamp para o filtro de
 * periodo. Sem data, nao ha limite para aplicar. */
function combinarDataHora(data: string | undefined, hora: string | undefined, horaPadrao: string) {
  if (!data) return null;
  return `${data}T${hora ? `${hora}:00` : horaPadrao}`;
}

/** site_id -> visita_id -> leitura e a cadeia de filtragem. Resolver em
 * etapas (em vez de um unico embed com !inner) evita que uma FK opcional
 * (funcionario_id, motivo_visita_id, coletor_dados_id podem ser nulos)
 * exclua leituras validas por causa de um inner join que ninguem pediu. */
async function resolveSiteIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filtros: ColetaFiltros,
): Promise<number[] | null> {
  if (!filtros.local && !filtros.grupoSite && !filtros.tipo) {
    return null;
  }

  let query = supabase.from("sites").select("id");
  if (filtros.local) query = query.eq("id", filtros.local);
  if (filtros.grupoSite) query = query.eq("grupo_site_id", filtros.grupoSite);
  if (filtros.tipo) query = query.eq("tipo_servico_id", filtros.tipo);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((site) => site.id);
}

async function resolveVisitaIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filtros: ColetaFiltros,
  siteIds: number[] | null,
): Promise<number[] | null> {
  if (!filtros.funcionario && !filtros.motivoVisita && !filtros.coletorDados && siteIds === null) {
    return null;
  }

  let query = supabase.from("visitas").select("id");
  if (siteIds !== null) query = query.in("site_id", siteIds);
  if (filtros.funcionario) query = query.eq("funcionario_id", filtros.funcionario);
  if (filtros.motivoVisita) query = query.eq("motivo_visita_id", filtros.motivoVisita);
  if (filtros.coletorDados) query = query.eq("coletor_dados_id", filtros.coletorDados);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((visita) => visita.id);
}

export async function getColetas(filtros: ColetaFiltros): Promise<{
  rows: ColetaRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  const siteIds = await resolveSiteIds(supabase, filtros);
  if (siteIds !== null && siteIds.length === 0) {
    return { rows: [], totalItems: 0 };
  }

  const visitaIds = await resolveVisitaIds(supabase, filtros, siteIds);
  if (visitaIds !== null && visitaIds.length === 0) {
    return { rows: [], totalItems: 0 };
  }

  const pagina = Math.max(1, filtros.pagina);
  const from = (pagina - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("leituras")
    .select(
      `
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
      visitas (
        numero_coleta,
        profiles ( nome_completo ),
        coletores_dados ( nome ),
        sites ( nome )
      )
      `,
      { count: "exact" },
    )
    .order("data_hora", { ascending: false })
    .range(from, to);

  if (visitaIds !== null) query = query.in("visita_id", visitaIds);
  if (filtros.area) query = query.eq("area_id", filtros.area);
  if (filtros.evento) query = query.eq("evento_id", filtros.evento);
  if (filtros.qualificador) query = query.eq("qualificador_id", filtros.qualificador);
  if (filtros.checkpoint) query = query.eq("qr_code_id", filtros.checkpoint);
  if (filtros.localizacao === "com") query = query.not("latitude", "is", null);
  if (filtros.localizacao === "sem") query = query.is("latitude", null);

  const inicio = combinarDataHora(filtros.dataInicial, filtros.horaInicial, "00:00:00");
  const fim = combinarDataHora(filtros.dataFinal, filtros.horaFinal, "23:59:59");
  if (inicio) query = query.gte("data_hora", inicio);
  if (fim) query = query.lte("data_hora", fim);

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as unknown as ColetaRow[], totalItems: count ?? 0 };
}

export function formatarDataHora(valor: string | null): string {
  if (!valor) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(valor),
  );
}
