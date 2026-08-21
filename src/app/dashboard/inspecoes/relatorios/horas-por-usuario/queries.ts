import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas, TETO_DE_AGREGACAO } from "@/lib/supabase/query-helpers";

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
    dataInicial: primeiro(params.data_inicial),
    dataFinal: primeiro(params.data_final),
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

type LeituraBruta = {
  visita_id: number;
  data_hora: string;
  qr_code_id: number | null;
  areas: { nome: string } | null;
  visitas: { funcionario_id: string | null } | null;
};

const NOME_AREA_INICIO = "Início";
const NOME_AREA_TERMINO = "Término";

/** Checkpoint e o unico filtro de detalhe desta tela (sem Evento/Atividade
 * aqui) -- mesma logica de "alguma leitura da visita bate" das outras
 * telas: filtrar a consulta diretamente excluiria a leitura de Inicio OU a
 * de Termino, quebrando o calculo de duracao. */
export function combinaFiltroDeDetalhe(grupo: LeituraBruta[], filtros: Filtros): boolean {
  if (!filtros.checkpoint) return true;
  return grupo.some((leitura) => String(leitura.qr_code_id) === filtros.checkpoint);
}

/**
 * Soma a duracao (Termino - Inicio) de cada visita por funcionario, e conta
 * quantas visitas entraram na soma -- "Visitas" na referencia e exatamente
 * o denominador da "Média" (Total / Visitas), nao a contagem de toda visita
 * do funcionario: uma visita sem par Inicio/Termino completo nao tem duracao
 * para somar, e por isso tambem nao conta. `profilesBase` decide quais
 * linhas existem (todo funcionario ativo aparece, mesmo com zero visitas --
 * mesmo criterio de sitesBase em mapa-de-locais-inspecionados/queries.ts).
 * Exportada pura para ser testada com dados fabricados.
 */
export function somarHorasPorFuncionario(
  profilesBase: { id: string; nome_completo: string }[],
  leituras: LeituraBruta[],
  filtros: Filtros,
): LinhaHoras[] {
  const porVisita = new Map<number, LeituraBruta[]>();
  for (const leitura of leituras) {
    if (!leitura.visitas?.funcionario_id) continue;
    const grupo = porVisita.get(leitura.visita_id) ?? [];
    grupo.push(leitura);
    porVisita.set(leitura.visita_id, grupo);
  }

  const totalMsPorFuncionario = new Map<string, number>();
  const visitasPorFuncionario = new Map<string, number>();

  for (const grupo of porVisita.values()) {
    if (!combinaFiltroDeDetalhe(grupo, filtros)) continue;

    const inicios = grupo.filter((l) => l.areas?.nome === NOME_AREA_INICIO).map((l) => l.data_hora).sort();
    const terminos = grupo.filter((l) => l.areas?.nome === NOME_AREA_TERMINO).map((l) => l.data_hora).sort();
    const dataInicio = inicios[0];
    const dataTermino = terminos[terminos.length - 1];
    if (!dataInicio || !dataTermino) continue;

    const duracaoMs = new Date(dataTermino).getTime() - new Date(dataInicio).getTime();
    if (duracaoMs <= 0) continue;

    const funcionarioId = grupo[0].visitas!.funcionario_id!;
    totalMsPorFuncionario.set(funcionarioId, (totalMsPorFuncionario.get(funcionarioId) ?? 0) + duracaoMs);
    visitasPorFuncionario.set(funcionarioId, (visitasPorFuncionario.get(funcionarioId) ?? 0) + 1);
  }

  return profilesBase
    .map((profile) => ({
      funcionarioId: profile.id,
      nome: profile.nome_completo,
      totalMs: totalMsPorFuncionario.get(profile.id) ?? 0,
      visitas: visitasPorFuncionario.get(profile.id) ?? 0,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const FUSO_OPERACIONAL = "-03:00";

function montarSelectLeituras(precisaGrupoUsuario: boolean): string {
  return `
    visita_id, data_hora, qr_code_id,
    areas ( nome ),
    visitas!inner (
      funcionario_id, site_id, coletor_dados_id
      ${precisaGrupoUsuario ? ", profiles!inner ( grupos_usuarios_membros!inner ( grupo_id ) )" : ""}
    )
  `;
}

/** `query: any` pelo mesmo motivo das demais telas: o cliente aqui nao
 * carrega o generic `Database`. */
function aplicarFiltrosDeProfile(query: any, filtros: Filtros) {
  let q = query;
  if (filtros.funcionario) q = q.eq("id", filtros.funcionario);
  return q;
}

function aplicarFiltrosDeLeitura(query: any, filtros: Filtros) {
  let q = query;
  if (filtros.funcionario) q = q.eq("visitas.funcionario_id", filtros.funcionario);
  if (filtros.coletorDados) q = q.eq("visitas.coletor_dados_id", filtros.coletorDados);
  if (filtros.local) q = q.eq("visitas.site_id", filtros.local);
  if (filtros.sites) q = q.eq("visitas.site_id", filtros.sites);
  if (filtros.grupoUsuario) {
    q = q.eq("visitas.profiles.grupos_usuarios_membros.grupo_id", filtros.grupoUsuario);
  }

  q = q.gte("data_hora", `${filtros.dataInicial}T00:00:00${FUSO_OPERACIONAL}`);
  q = q.lte("data_hora", `${filtros.dataFinal}T23:59:59${FUSO_OPERACIONAL}`);
  return q;
}

/** O que a tela recebe: as linhas mais o aviso de que a soma saiu incompleta.
 * `truncado` fica fora de `LinhaHoras[]` porque `somarHorasPorFuncionario` so
 * soma o que recebeu -- nao tem como saber se a busca parou antes do fim. */
export type ResultadoHoras = { linhas: LinhaHoras[]; truncado: boolean };

/** null quando o periodo (Data Inicial/Final) nao foi informado -- mesmo
 * gate de mapa-de-locais-inspecionados. */
export async function getHorasPorUsuario(filtros: Filtros): Promise<ResultadoHoras | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const supabase = await createClient();
  const precisaGrupoUsuario = Boolean(filtros.grupoUsuario);

  const [profilesResultado, leituras] = await Promise.all([
    aplicarFiltrosDeProfile(
      supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
      filtros,
    ),
    // Paginado: sem isto a consulta parava no `max_rows` do PostgREST e a soma
    // saia por baixo, sem erro nenhum -- subnotificando justamente quem tem
    // mais leituras. Ver `buscarEmPaginas`. A ordenacao nao e cosmetica: sem
    // ela `.range()` pode repetir ou pular linha entre paginas.
    buscarEmPaginas<LeituraBruta>((de, ate) =>
      aplicarFiltrosDeLeitura(
        supabase
          .from("leituras")
          .select(montarSelectLeituras(precisaGrupoUsuario))
          .order("data_hora", { ascending: true })
          .order("id", { ascending: true })
          .range(de, ate),
        filtros,
      ),
    ),
  ]);

  if (profilesResultado.error) throw profilesResultado.error;

  if (leituras.atingiuTeto) {
    erro(
      gerarIdDeRequisicao(),
      `Horas por Usuário: teto de ${TETO_DE_AGREGACAO} leituras atingido; o total exibido está incompleto.`,
    );
  }

  return {
    linhas: somarHorasPorFuncionario(
      (profilesResultado.data ?? []) as { id: string; nome_completo: string }[],
      leituras.linhas,
      filtros,
    ),
    truncado: leituras.atingiuTeto,
  };
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
