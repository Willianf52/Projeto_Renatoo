import { dataValida, FUSO_DO_PROJETO, periodoEntreDatas } from "@/lib/data-hora";
import { filtrosParaRpc } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";

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
    dataInicial: dataValida(primeiro(params.data_inicial)),
    dataFinal: dataValida(primeiro(params.data_final)),
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

/** Uma linha de `relatorio_inspecoes_inicio_fim` (migration 0049). */
export type InspecaoDoBanco = {
  visita_id: number;
  inicio: string;
  termino: string;
  duracao_ms: number;
  usuario: string;
  regional: string;
  site: string;
  evento: string;
};

/** Linha do banco -> linha da tela. So renomeia: o par Inicio/Termino, a
 * duracao, o evento "de qualquer leitura da visita" e os filtros de detalhe
 * vem prontos desde a 0049. */
export function paraLinhaDeInspecao(linha: InspecaoDoBanco): LinhaInspecao {
  return {
    visitaId: linha.visita_id,
    dataHoraInicio: linha.inicio,
    dataHoraTermino: linha.termino,
    duracaoMs: linha.duracao_ms,
    usuario: linha.usuario,
    regional: linha.regional,
    site: linha.site,
    evento: linha.evento,
  };
}

export type InspecoesComInicioEFim = {
  linhas: LinhaInspecao[];
  /** A lista passou do teto de agregacao (`TETO_DE_AGREGACAO` visitas). Aqui,
   * diferente dos relatorios agregados, o aviso continua fazendo sentido: a
   * tela e uma lista por visita, e uma lista pode mesmo nao caber. */
  truncado: boolean;
};

/** null quando o periodo (Data Inicial/Final) nao foi informado -- mesmo
 * gate das demais telas de intervalo (Ranking, Mapa, Horas por Usuario). */
export async function getInspecoesComInicioEFim(filtros: Filtros): Promise<InspecoesComInicioEFim | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const supabase = await createClient();
  const { inicio, fim } = periodoEntreDatas(filtros.dataInicial, filtros.dataFinal);

  const p_filtros = filtrosParaRpc({
    site: filtros.sites,
    grupo_site: filtros.grupoSite,
    funcionario: filtros.funcionario,
    motivo: filtros.motivo,
    evento: filtros.evento,
    atividade: filtros.atividade,
  });

  // Uma linha por visita: paginado, com ordenacao estavel (inicio e, no
  // empate, a visita) -- a mesma ordem que a tela sempre mostrou.
  const { linhas, atingiuTeto } = await buscarEmPaginas<InspecaoDoBanco>((de, ate) =>
    supabase
      .rpc("relatorio_inspecoes_inicio_fim", { p_inicio: inicio, p_fim: fim, p_filtros })
      .order("inicio", { ascending: true })
      .order("visita_id", { ascending: true })
      .range(de, ate),
  );

  return { linhas: linhas.map(paraLinhaDeInspecao), truncado: atingiuTeto };
}

/** "yyyy-mm-ddThh:mm:ss+00:00" (o Postgres devolve com offset) -> "dd/mm/aaaa"
 * e "HH:MM:SS" separados, como as colunas Data/Hora da referencia. */
export function formatarData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: FUSO_DO_PROJETO }).format(new Date(iso));
}

export function formatarHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: FUSO_DO_PROJETO }).format(new Date(iso));
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
