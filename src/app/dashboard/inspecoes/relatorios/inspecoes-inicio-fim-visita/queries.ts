import { createClient } from "@/lib/supabase/server";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export type Filtros = {
  dataInicial?: string;
  dataFinal?: string;
  evento?: string;
  /** "Atividades" na referencia -- mais proxima da tabela `acoes`, mesmo
   * criterio de registro-de-rondas/queries.ts. */
  atividade?: string;
  motivo?: string;
  funcionario?: string;
  grupoSite?: string;
  /** "Sites" resolve para `sites.id`, com as opcoes rotuladas "Grupo -
   * Site" -- mesmo padrao de mapa-de-locais-inspecionados/queries.ts. */
  sites?: string;
};

export function extrairFiltros(params: SearchParams): Filtros {
  return {
    dataInicial: primeiro(params.data_inicial),
    dataFinal: primeiro(params.data_final),
    evento: primeiro(params.evento),
    atividade: primeiro(params.atividade),
    motivo: primeiro(params.motivo),
    funcionario: primeiro(params.funcionario),
    grupoSite: primeiro(params.grupo_site),
    sites: primeiro(params.sites),
  };
}

export type Opcao = { value: string; label: string };

export type OpcoesFiltros = {
  eventos: Opcao[];
  atividades: Opcao[];
  motivos: Opcao[];
  funcionarios: Opcao[];
  gruposSites: Opcao[];
  sitesAgrupados: Opcao[];
};

function toOptions<T extends Record<string, unknown>>(
  rows: T[] | null,
  idKey: keyof T,
  labelKey: keyof T,
): Opcao[] {
  return (rows ?? []).map((row) => ({
    value: String(row[idKey]),
    label: String(row[labelKey]),
  }));
}

type SiteComGrupo = { id: number; nome: string; grupos_sites: { nome: string } | null };

/** Sem cache manual (mesmo motivo das demais telas): `funcionarios` e
 * recortado por RLS conforme quem pede. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();

  const [eventos, atividades, motivos, funcionarios, gruposSites, sitesComGrupo] = await Promise.all([
    supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("acoes").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("motivos_visita").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
    supabase.from("grupos_sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
  ]);

  return {
    eventos: toOptions(eventos.data, "id", "nome"),
    atividades: toOptions(atividades.data, "id", "nome"),
    motivos: toOptions(motivos.data, "id", "nome"),
    funcionarios: toOptions(funcionarios.data, "id", "nome_completo"),
    gruposSites: toOptions(gruposSites.data, "id", "nome"),
    sitesAgrupados: ((sitesComGrupo.data ?? []) as unknown as SiteComGrupo[]).map((site) => ({
      value: String(site.id),
      label: site.grupos_sites?.nome ? `${site.grupos_sites.nome} - ${site.nome}` : site.nome,
    })),
  };
}

export type LinhaInspecao = {
  visitaId: number;
  dataHoraInicio: string;
  dataHoraTermino: string;
  duracaoMs: number;
  usuario: string;
  regional: string;
  site: string;
  evento: string;
};

type LeituraBruta = {
  visita_id: number;
  data_hora: string;
  evento_id: number | null;
  acao_id: number | null;
  areas: { nome: string } | null;
  eventos: { nome: string } | null;
  visitas: {
    profiles: { nome_completo: string } | null;
    sites: { nome: string; regional: string | null } | null;
  } | null;
};

const NOME_AREA_INICIO = "Início";
const NOME_AREA_TERMINO = "Término";

/** Evento e Atividade sao os unicos filtros de detalhe desta tela (sem
 * Checkpoint/Qualificador aqui) -- mesma logica de "alguma leitura da visita
 * bate" das outras telas: filtrar a consulta diretamente excluiria a leitura
 * de Inicio OU a de Termino, quebrando o par usado no calculo de duracao. */
export function combinaFiltrosDeDetalhe(grupo: LeituraBruta[], filtros: Filtros): boolean {
  const semFiltroDeDetalhe = !filtros.evento && !filtros.atividade;
  if (semFiltroDeDetalhe) return true;

  return grupo.some((leitura) => {
    if (filtros.evento && String(leitura.evento_id) !== filtros.evento) return false;
    if (filtros.atividade && String(leitura.acao_id) !== filtros.atividade) return false;
    return true;
  });
}

/**
 * Uma linha por visita (nao por leitura): Data/Hora de Inicio e Termino, a
 * duracao entre eles, e os dados do funcionario/site. Exportada pura para
 * ser testada com leituras fabricadas, sem mockar o Supabase -- mesmo padrao
 * de agruparEmLinhas em registro-de-rondas/queries.ts.
 */
export function montarLinhasDeInspecao(leituras: LeituraBruta[], filtros: Filtros): LinhaInspecao[] {
  const porVisita = new Map<number, LeituraBruta[]>();
  for (const leitura of leituras) {
    if (!leitura.visitas?.sites) continue;
    const grupo = porVisita.get(leitura.visita_id) ?? [];
    grupo.push(leitura);
    porVisita.set(leitura.visita_id, grupo);
  }

  const linhas: LinhaInspecao[] = [];

  for (const [visitaId, grupo] of porVisita) {
    if (!combinaFiltrosDeDetalhe(grupo, filtros)) continue;

    const inicios = grupo.filter((l) => l.areas?.nome === NOME_AREA_INICIO).map((l) => l.data_hora).sort();
    const terminos = grupo.filter((l) => l.areas?.nome === NOME_AREA_TERMINO).map((l) => l.data_hora).sort();
    const dataHoraInicio = inicios[0];
    const dataHoraTermino = terminos[terminos.length - 1];
    if (!dataHoraInicio || !dataHoraTermino) continue;

    const duracaoMs = new Date(dataHoraTermino).getTime() - new Date(dataHoraInicio).getTime();
    if (duracaoMs <= 0) continue;

    const visita = grupo[0].visitas!;
    // Evento e campo de excecao: pode estar em qualquer leitura da visita,
    // nao so na de Inicio -- mesmo criterio de observacao/localizacao em
    // visitas-de-supervisao/queries.ts.
    const eventoNome = grupo.find((l) => l.eventos?.nome)?.eventos?.nome ?? "";

    linhas.push({
      visitaId,
      dataHoraInicio,
      dataHoraTermino,
      duracaoMs,
      usuario: visita.profiles?.nome_completo ?? "",
      regional: visita.sites!.regional ?? "",
      site: visita.sites!.nome,
      evento: eventoNome,
    });
  }

  return linhas.sort((a, b) => a.dataHoraInicio.localeCompare(b.dataHoraInicio));
}

const FUSO_OPERACIONAL = "-03:00";

/** Teto de leituras buscadas no periodo -- mesmo motivo de LIMITE_LEITURAS em
 * registro-de-rondas/queries.ts: a consulta nao pagina no banco (uma visita
 * vira uma linha so depois de agrupada em memoria). */
export const LIMITE_LEITURAS = 5000;

function montarSelect(): string {
  return `
    visita_id, data_hora, evento_id, acao_id,
    areas ( nome ),
    eventos ( nome ),
    visitas!inner (
      funcionario_id, motivo_visita_id,
      profiles ( nome_completo ),
      sites!inner ( nome, regional, grupo_site_id )
    )
  `;
}

/** `query: any` pelo mesmo motivo das demais telas: o cliente aqui nao
 * carrega o generic `Database`. */
function aplicarFiltrosDeVisita(query: any, filtros: Filtros) {
  let q = query;

  if (filtros.funcionario) q = q.eq("visitas.funcionario_id", filtros.funcionario);
  if (filtros.motivo) q = q.eq("visitas.motivo_visita_id", filtros.motivo);
  if (filtros.grupoSite) q = q.eq("visitas.sites.grupo_site_id", filtros.grupoSite);
  if (filtros.sites) q = q.eq("visitas.sites.id", filtros.sites);

  q = q.gte("data_hora", `${filtros.dataInicial}T00:00:00${FUSO_OPERACIONAL}`);
  q = q.lte("data_hora", `${filtros.dataFinal}T23:59:59${FUSO_OPERACIONAL}`);
  return q;
}

export type InspecoesComInicioEFim = {
  linhas: LinhaInspecao[];
  truncado: boolean;
};

/** null quando o periodo (Data Inicial/Final) nao foi informado -- mesmo
 * gate das demais telas de intervalo (Ranking, Mapa, Horas por Usuario). */
export async function getInspecoesComInicioEFim(filtros: Filtros): Promise<InspecoesComInicioEFim | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const supabase = await createClient();

  const query = aplicarFiltrosDeVisita(
    supabase.from("leituras").select(montarSelect()).order("data_hora", { ascending: true }).range(0, LIMITE_LEITURAS),
    filtros,
  );

  const { data, error } = await query;
  if (error) throw error;

  const leituras = (data ?? []) as unknown as LeituraBruta[];
  const truncado = leituras.length > LIMITE_LEITURAS;

  return { linhas: montarLinhasDeInspecao(leituras.slice(0, LIMITE_LEITURAS), filtros), truncado };
}

/** "yyyy-mm-ddThh:mm:ss+00:00" (o Postgres devolve com offset) -> "dd/mm/aaaa"
 * e "HH:MM:SS" separados, como as colunas Data/Hora da referencia. */
export function formatarData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export function formatarHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

/** "HH:MM:SS", sem teto em 24h -- mesmo formato das demais telas. */
export function formatarDuracao(ms: number): string {
  const totalSegundos = Math.round(ms / 1000);
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(horas)}:${pad(minutos)}:${pad(segundos)}`;
}

export const TABLE_COLUMNS = [
  "Data Início",
  "Hora Início",
  "Data Término",
  "Hora Término",
  "Tempo de Permanência",
  "Usuário",
  "Regional",
  "Site",
  "Evento",
];

export function paraLinhaDeExportacao(linha: LinhaInspecao): string[] {
  return [
    formatarData(linha.dataHoraInicio),
    formatarHora(linha.dataHoraInicio),
    formatarData(linha.dataHoraTermino),
    formatarHora(linha.dataHoraTermino),
    formatarDuracao(linha.duracaoMs),
    linha.usuario,
    linha.regional,
    linha.site,
    linha.evento,
  ];
}
