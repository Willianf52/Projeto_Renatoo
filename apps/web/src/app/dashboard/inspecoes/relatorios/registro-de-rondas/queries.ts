import { periodoDoMes } from "@/lib/data-hora";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { filtrosParaRpc } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import { filtroDeId, filtroDeUuid } from "@/lib/id-na-url";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export type Filtros = {
  /**
   * "yyyy-mm", ou ausente enquanto ninguem escolheu. Nao cai mais no mes
   * atual: o campo abre vazio, mostrando "Mês/Ano", como na referencia (e
   * como o Mapa de Eventos) -- um mes preenchido sozinho parecia filtro que
   * alguem aplicou. Sem mes, a tela pede a escolha e nao consulta.
   */
  mes?: string;
  local?: string;
  coletorDados?: string;
  funcionario?: string;
  area?: string;
  evento?: string;
  qualificador?: string;
  checkpoint?: string;
  /** "Atividades" na tela de referencia -- mais proxima da tabela `acoes`
   * (mesmo campo exibido como "Ação" em Coletas Importadas). Nao existe uma
   * tabela de atividades separada no schema. */
  atividade?: string;
  grupoSite?: string;
  grupoUsuario?: string;
  motivo?: string;
};

function mesValido(valor: string | undefined): valor is string {
  if (!valor) return false;
  const encontrado = /^\d{4}-(\d{2})$/.exec(valor);
  if (!encontrado) return false;
  const mes = Number(encontrado[1]);
  return mes >= 1 && mes <= 12;
}

export function extrairFiltros(params: SearchParams): Filtros {
  const mes = primeiro(params.mes);
  return {
    mes: mesValido(mes) ? mes : undefined,
    local: filtroDeId(primeiro(params.local)),
    coletorDados: filtroDeId(primeiro(params.coletor_dados)),
    funcionario: filtroDeUuid(primeiro(params.funcionario)),
    area: filtroDeId(primeiro(params.area)),
    evento: filtroDeId(primeiro(params.evento)),
    qualificador: filtroDeId(primeiro(params.qualificador)),
    checkpoint: filtroDeId(primeiro(params.checkpoint)),
    atividade: filtroDeId(primeiro(params.atividade)),
    grupoSite: filtroDeId(primeiro(params.grupo_site)),
    grupoUsuario: filtroDeId(primeiro(params.grupo_usuario)),
    motivo: filtroDeId(primeiro(params.motivo)),
  };
}

export type Opcao = { value: string; label: string };

export type OpcoesFiltros = {
  coletoresDados: Opcao[];
  locais: Opcao[];
  funcionarios: Opcao[];
  areas: Opcao[];
  eventos: Opcao[];
  qualificadores: Opcao[];
  checkpoints: Opcao[];
  atividades: Opcao[];
  gruposSites: Opcao[];
  gruposUsuarios: Opcao[];
  motivos: Opcao[];
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

/**
 * Listas para os selects de filtro. Sem cache manual (diferente de
 * Coletas Importadas): `locais`, `funcionarios` e `gruposUsuarios` sao
 * recortados por RLS conforme quem pede (ver 0006/0014), e cachear
 * resultado recortado entre usuarios vazaria dado de um cliente para outro.
 */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();

  const [
    coletoresDados,
    locais,
    funcionarios,
    areas,
    eventos,
    qualificadores,
    checkpoints,
    atividades,
    gruposSites,
    gruposUsuarios,
    motivos,
  ] = await Promise.all([
    supabase.from("coletores_dados").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
    supabase.from("areas").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("qualificadores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("qr_codes").select("id, codigo").eq("ativo", true).order("codigo"),
    supabase.from("acoes").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
    supabase.from("motivos_visita").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  return {
    coletoresDados: toOptions(coletoresDados.data, "id", "nome"),
    locais: toOptions(locais.data, "id", "nome"),
    funcionarios: toOptions(funcionarios.data, "id", "nome_completo"),
    areas: toOptions(areas.data, "id", "nome"),
    eventos: toOptions(eventos.data, "id", "nome"),
    qualificadores: toOptions(qualificadores.data, "id", "nome"),
    checkpoints: toOptions(checkpoints.data, "id", "codigo"),
    atividades: toOptions(atividades.data, "id", "nome"),
    gruposSites: toOptions(gruposSites.data, "id", "nome"),
    gruposUsuarios: toOptions(gruposUsuarios.data, "id", "nome"),
    motivos: toOptions(motivos.data, "id", "nome"),
  };
}

export type RegistroDeRondasLinha = {
  siteId: number;
  siteNome: string;
  /** Indice 0 = dia 1, indice 30 = dia 31. Cada dia guarda a duracao (ms) de
   * cada ronda daquele Local naquele dia -- mais de uma quando o site recebeu
   * mais de uma visita no mesmo dia, ver formatarCelula. */
  duracoesPorDia: number[][];
  /** Soma de todas as duracoes do mes, nao so dos dias exibidos na pagina. */
  totalMs: number;
};

/** Uma linha de `relatorio_registro_de_rondas` (migration 0049): Local x dia,
 * com a duracao de cada ronda que comecou naquele dia. */
export type LinhaDoBanco = {
  site_id: number;
  site_nome: string;
  dia: number;
  duracoes_ms: number[];
};

/**
 * Linhas do banco -> a grade de 31 dias da tela.
 *
 * O agrupamento das leituras em rondas, o par Inicio/Termino, o dia no fuso da
 * operacao e os filtros de detalhe moram no banco desde a 0049 (e sao testados
 * la, em `relatorios_agregados_no_banco_test.sql`). O que sobra aqui e forma:
 * espalhar as duracoes nas colunas de dia e somar o Total. Pura, para ser
 * testada sem mockar o Supabase.
 */
export function montarLinhas(linhasDoBanco: LinhaDoBanco[]): RegistroDeRondasLinha[] {
  const porSite = new Map<number, RegistroDeRondasLinha>();

  for (const doBanco of linhasDoBanco) {
    let linha = porSite.get(doBanco.site_id);
    if (!linha) {
      linha = {
        siteId: doBanco.site_id,
        siteNome: doBanco.site_nome,
        duracoesPorDia: Array.from({ length: 31 }, () => []),
        totalMs: 0,
      };
      porSite.set(doBanco.site_id, linha);
    }

    linha.duracoesPorDia[doBanco.dia - 1].push(...doBanco.duracoes_ms);
    linha.totalMs += doBanco.duracoes_ms.reduce((soma, ms) => soma + ms, 0);
  }

  // Ordem de texto no Node, e nao `order by` no banco: a collation do Postgres
  // nao e garantidamente a mesma do `localeCompare("pt-BR")` que a tela sempre
  // usou -- ver o cabecalho da 0049.
  return Array.from(porSite.values()).sort((a, b) => a.siteNome.localeCompare(b.siteNome, "pt-BR"));
}

/** `null` enquanto nao ha Mês/Ano escolhido: nada a consultar ainda. */
export async function getRegistroDeRondas(filtros: Filtros): Promise<RegistroDeRondasLinha[] | null> {
  if (!filtros.mes) return null;

  const supabase = await createClient();
  const { inicio, fim } = periodoDoMes(filtros.mes);

  const p_filtros = filtrosParaRpc({
    site: filtros.local,
    grupo_site: filtros.grupoSite,
    funcionario: filtros.funcionario,
    motivo: filtros.motivo,
    coletor_dados: filtros.coletorDados,
    grupo_usuario: filtros.grupoUsuario,
    area: filtros.area,
    evento: filtros.evento,
    qualificador: filtros.qualificador,
    checkpoint: filtros.checkpoint,
    atividade: filtros.atividade,
  });

  // Paginado mesmo sendo agregado: sao ate sites x 31 linhas, e o PostgREST
  // corta em `max_rows` (1000) sem avisar -- 33 locais num mes ja passariam.
  // A ordenacao estavel e o que `buscarEmPaginas` exige.
  const { linhas, atingiuTeto } = await buscarEmPaginas<LinhaDoBanco>((de, ate) =>
    supabase
      .rpc("relatorio_registro_de_rondas", { p_inicio: inicio, p_fim: fim, p_filtros })
      .order("site_id", { ascending: true })
      .order("dia", { ascending: true })
      .range(de, ate),
  );

  if (atingiuTeto) {
    erro(gerarIdDeRequisicao(), "Registro de Rondas: teto de agregação atingido; o mês exibido está incompleto.");
  }

  return montarLinhas(linhas);
}

/** "HH:MM:SS". Horas nao tem teto: o Total do mes pode passar de 24h (ex.
 * "32:03:31"), entao e soma literal de segundos, nao um relogio de 24h. */
export function formatarDuracao(ms: number): string {
  const totalSegundos = Math.round(ms / 1000);
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(horas)}:${pad(minutos)}:${pad(segundos)}`;
}

/** Colunas de texto de uma linha, pra exportacao Excel/PDF -- mais de uma
 * ronda no mesmo dia vira mais de uma duracao na mesma celula, separadas por
 * quebra de linha (CSV/impressao aceitam celula com quebra de linha). */
export function paraLinhaDeExportacao(linha: RegistroDeRondasLinha): string[] {
  return [
    linha.siteNome,
    ...linha.duracoesPorDia.map((duracoes) => duracoes.map(formatarDuracao).join("\n")),
    formatarDuracao(linha.totalMs),
  ];
}

export const TABLE_COLUMNS = [
  "Local",
  ...Array.from({ length: 31 }, (_, i) => String(i + 1)),
  "Total",
];
