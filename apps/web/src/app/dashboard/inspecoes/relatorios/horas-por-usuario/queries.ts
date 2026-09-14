import { dataValida, periodoEntreDatas } from "@/lib/data-hora";
import { filtrosParaRpc } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export type Filtros = {
  dataInicial?: string;
  dataFinal?: string;
  coletorDados?: string;
  funcionario?: string;
  checkpoint?: string;
  grupoUsuario?: string;
  /** "Sites" e "Local" resolvem para `sites.id`, mesma leitura adotada em
   * mapa-de-locais-inspecionados/queries.ts -- ver o comentario la. */
  sites?: string;
  local?: string;
};

export function extrairFiltros(params: SearchParams): Filtros {
  return {
    dataInicial: dataValida(primeiro(params.data_inicial)),
    dataFinal: dataValida(primeiro(params.data_final)),
    coletorDados: primeiro(params.coletor_dados),
    funcionario: primeiro(params.funcionario),
    checkpoint: primeiro(params.checkpoint),
    grupoUsuario: primeiro(params.grupo_usuario),
    sites: primeiro(params.sites),
    local: primeiro(params.local),
  };
}

export type Opcao = { value: string; label: string };

export type OpcoesFiltros = {
  coletoresDados: Opcao[];
  funcionarios: Opcao[];
  checkpoints: Opcao[];
  gruposUsuarios: Opcao[];
  sitesAgrupados: Opcao[];
  locais: Opcao[];
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

/** Sem cache manual (mesmo motivo das demais telas): listas recortadas por
 * RLS conforme quem pede. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();

  const [coletoresDados, funcionarios, checkpoints, gruposUsuarios, sitesComGrupo, locais] = await Promise.all([
    supabase.from("coletores_dados").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
    supabase.from("qr_codes").select("id, codigo").eq("ativo", true).order("codigo"),
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
    supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
    supabase.from("sites").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  return {
    coletoresDados: toOptions(coletoresDados.data, "id", "nome"),
    funcionarios: toOptions(funcionarios.data, "id", "nome_completo"),
    checkpoints: toOptions(checkpoints.data, "id", "codigo"),
    gruposUsuarios: toOptions(gruposUsuarios.data, "id", "nome"),
    sitesAgrupados: ((sitesComGrupo.data ?? []) as unknown as SiteComGrupo[]).map((site) => ({
      value: String(site.id),
      label: site.grupos_sites?.nome ? `${site.grupos_sites.nome} - ${site.nome}` : site.nome,
    })),
    locais: toOptions(locais.data, "id", "nome"),
  };
}

export type LinhaHoras = {
  funcionarioId: string;
  nome: string;
  totalMs: number;
  visitas: number;
};

/** Uma linha de `relatorio_horas_por_usuario` (migration 0049). */
export type HorasDoBanco = { funcionario_id: string; total_ms: number; visitas: number };

/**
 * Perfis + somas do banco -> linhas da tela.
 *
 * `profilesBase` decide quais linhas existem: todo funcionario ativo aparece,
 * mesmo com zero visitas -- mesmo criterio de sitesBase no Mapa de Locais. As
 * somas vem prontas do banco desde a 0049 (par Inicio/Termino, duracao
 * positiva e filtro de checkpoint sao testados em
 * `relatorios_agregados_no_banco_test.sql`). Pura, para ser testada sem mockar
 * o Supabase.
 */
export function juntarHorasAosPerfis(
  profilesBase: { id: string; nome_completo: string }[],
  horas: HorasDoBanco[],
): LinhaHoras[] {
  const porFuncionario = new Map(horas.map((h) => [h.funcionario_id, h]));

  return profilesBase
    .map((profile) => ({
      funcionarioId: profile.id,
      nome: profile.nome_completo,
      totalMs: porFuncionario.get(profile.id)?.total_ms ?? 0,
      visitas: porFuncionario.get(profile.id)?.visitas ?? 0,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** null quando o periodo (Data Inicial/Final) nao foi informado -- mesmo
 * gate de mapa-de-locais-inspecionados. */
export async function getHorasPorUsuario(filtros: Filtros): Promise<LinhaHoras[] | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const supabase = await createClient();
  const { inicio, fim } = periodoEntreDatas(filtros.dataInicial, filtros.dataFinal);

  let perfisFiltrados = supabase.from("profiles").select("id, nome_completo").eq("ativo", true);
  if (filtros.funcionario) perfisFiltrados = perfisFiltrados.eq("id", filtros.funcionario);
  const perfis = perfisFiltrados.order("nome_completo");

  // "Local" e "Sites" sao dois selects da tela que resolvem para o mesmo
  // `sites.id` (ver Filtros). Os dois preenchidos com valores diferentes nunca
  // casaram visita nenhuma -- eram dois `.eq` na mesma coluna --, e mandar so
  // um deles esconderia isso. Aqui a regra continua: diferentes, nada casa.
  const conflitoDeSite = Boolean(filtros.local && filtros.sites && filtros.local !== filtros.sites);

  // Uma linha por funcionario: nunca chega perto do `max_rows`, entao sem
  // paginacao.
  const [perfisResultado, horasResultado] = await Promise.all([
    perfis,
    conflitoDeSite
      ? Promise.resolve({ data: [] as HorasDoBanco[], error: null })
      : supabase.rpc("relatorio_horas_por_usuario", {
          p_inicio: inicio,
          p_fim: fim,
          p_filtros: filtrosParaRpc({
            site: filtros.local ?? filtros.sites,
            funcionario: filtros.funcionario,
            coletor_dados: filtros.coletorDados,
            grupo_usuario: filtros.grupoUsuario,
            checkpoint: filtros.checkpoint,
          }),
        }),
  ]);

  if (perfisResultado.error) throw perfisResultado.error;
  if (horasResultado.error) throw horasResultado.error;

  return juntarHorasAosPerfis(
    (perfisResultado.data ?? []) as { id: string; nome_completo: string }[],
    (horasResultado.data ?? []) as HorasDoBanco[],
  );
}

/** "HH:MM:SS", sem teto em 24h -- mesmo formato de
 * registro-de-rondas/queries.ts (formatarDuracao). */
export function formatarDuracao(ms: number): string {
  const totalSegundos = Math.round(ms / 1000);
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(horas)}:${pad(minutos)}:${pad(segundos)}`;
}

/**
 * "HH:MM:SS.FFFF" -- "Média" na referencia tem 4 casas decimais nos segundos,
 * TRUNCADAS, nao arredondadas: 50162ms/18 = 2786.7777...s (setima recorrente)
 * vira "26.7777" na referencia, nao "26.7778" que um `toFixed` normal
 * devolveria. Sem visitas, "0" (visto na referencia nas linhas zeradas, nao
 * "NaN").
 */
export function formatarMedia(totalMs: number, visitas: number): string {
  if (visitas === 0) return "0";

  const totalSegundos = totalMs / 1000 / visitas;
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos - horas * 3600 - minutos * 60;
  const segundosTruncados = Math.floor(segundos * 10000) / 10000;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(horas)}:${pad(minutos)}:${segundosTruncados.toFixed(4).padStart(7, "0")}`;
}

export const TABLE_COLUMNS = ["Usuário", "Total de Horas", "Média", "Visitas"];

export function paraLinhaDeExportacao(linha: LinhaHoras): string[] {
  return [linha.nome, formatarDuracao(linha.totalMs), formatarMedia(linha.totalMs, linha.visitas), String(linha.visitas)];
}
