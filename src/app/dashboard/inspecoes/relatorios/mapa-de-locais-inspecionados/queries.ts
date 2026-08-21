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
  /**
   * "Sites" e "Local" sao dois campos separados na tela de referencia, mas
   * ambos resolvem para `sites.id` -- "Sites" so exibe as opcoes agrupadas
   * por Grupo de Sites (rotulo "Grupo - Site"), "Local" exibe o nome puro.
   * Aplicados juntos funcionam como dois filtros independentes sobre a mesma
   * coluna (redundante se preenchidos com sites diferentes, inofensivo).
   */
  sites?: string;
  local?: string;
  evento?: string;
  atividade?: string;
  grupoSite?: string;
  grupoUsuario?: string;
  /** true inclui sites com ativo=false na lista de Locais. */
  locaisInativos?: boolean;
  motivo?: string;
};

export function extrairFiltros(params: SearchParams): Filtros {
  return {
    dataInicial: primeiro(params.data_inicial),
    dataFinal: primeiro(params.data_final),
    coletorDados: primeiro(params.coletor_dados),
    funcionario: primeiro(params.funcionario),
    checkpoint: primeiro(params.checkpoint),
    sites: primeiro(params.sites),
    local: primeiro(params.local),
    evento: primeiro(params.evento),
    atividade: primeiro(params.atividade),
    grupoSite: primeiro(params.grupo_site),
    grupoUsuario: primeiro(params.grupo_usuario),
    locaisInativos: primeiro(params.locais_inativos) === "sim",
    motivo: primeiro(params.motivo),
  };
}

export type Opcao = { value: string; label: string };

export type OpcoesFiltros = {
  coletoresDados: Opcao[];
  funcionarios: Opcao[];
  checkpoints: Opcao[];
  sitesAgrupados: Opcao[];
  locais: Opcao[];
  eventos: Opcao[];
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

type SiteComGrupo = { id: number; nome: string; grupos_sites: { nome: string } | null };

/** Sem cache manual (mesmo motivo de registro-de-rondas/queries.ts): listas
 * recortadas por RLS conforme quem pede. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();

  const [coletoresDados, funcionarios, checkpoints, sitesComGrupo, locais, eventos, atividades, gruposSites, gruposUsuarios, motivos] =
    await Promise.all([
      supabase.from("coletores_dados").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
      supabase.from("qr_codes").select("id, codigo").eq("ativo", true).order("codigo"),
      supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
      supabase.from("sites").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("acoes").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("grupos_sites").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("grupos_usuarios").select("id, nome").order("nome"),
      supabase.from("motivos_visita").select("id, nome").eq("ativo", true).order("nome"),
    ]);

  return {
    coletoresDados: toOptions(coletoresDados.data, "id", "nome"),
    funcionarios: toOptions(funcionarios.data, "id", "nome_completo"),
    checkpoints: toOptions(checkpoints.data, "id", "codigo"),
    sitesAgrupados: ((sitesComGrupo.data ?? []) as unknown as SiteComGrupo[]).map((site) => ({
      value: String(site.id),
      label: site.grupos_sites?.nome ? `${site.grupos_sites.nome} - ${site.nome}` : site.nome,
    })),
    locais: toOptions(locais.data, "id", "nome"),
    eventos: toOptions(eventos.data, "id", "nome"),
    atividades: toOptions(atividades.data, "id", "nome"),
    gruposSites: toOptions(gruposSites.data, "id", "nome"),
    gruposUsuarios: toOptions(gruposUsuarios.data, "id", "nome"),
    motivos: toOptions(motivos.data, "id", "nome"),
  };
}

/** Teto de dias no periodo -- sem isto um intervalo de anos gerava colunas
 * sem fim. ~2 meses cobre o uso real deste relatorio (mapa de cobertura
 * recente), como as exportacoes com LIMITE_EXPORTACAO em outras telas. */
export const LIMITE_DIAS = 62;

function paraDate(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

function paraISO(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/** Lista de dias (yyyy-mm-dd) entre inicio e fim, inclusive. Construida a
 * partir dos componentes (ano/mes/dia), nao de `new Date(iso)`: o mesmo
 * cuidado do FilterDatePicker -- string ISO pura vira meia-noite UTC, que em
 * fuso negativo volta um dia na leitura local. */
export function listarDias(inicioIso: string, fimIso: string): string[] {
  const dias: string[] = [];
  let atual = paraDate(inicioIso);
  const fim = paraDate(fimIso);
  while (atual.getTime() <= fim.getTime()) {
    dias.push(paraISO(atual));
    atual = new Date(atual.getFullYear(), atual.getMonth(), atual.getDate() + 1);
  }
  return dias;
}

/** "yyyy-mm-dd" -> "dd/mm", como na referencia. */
export function formatarDiaCurto(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

export type LinhaMapa = {
  siteId: number;
  siteNome: string;
  /** "yyyy-mm-dd" -> quantidade de inspecoes (visitas distintas) no dia. Dia
   * sem entrada aqui vale 0. */
  porDia: Record<string, number>;
  /** Visitas distintas no periodo inteiro -- nao e a soma de porDia quando
   * uma visita tem leituras em dois dias (ver combinaFiltrosDeDetalhe). */
  total: number;
};

type LeituraBruta = {
  visita_id: number;
  data_hora: string;
  evento_id: number | null;
  qr_code_id: number | null;
  acao_id: number | null;
  visitas: { site_id: number } | null;
};

/**
 * Evento/Checkpoint/Atividade nao entram na consulta de leituras: cada um so
 * exclui a leitura que nao carrega aquele valor, e uma visita normalmente tem
 * mais de uma leitura (Inicio/Termino) -- mesmo motivo de
 * combinaFiltrosDeDetalhe em registro-de-rondas/queries.ts. Aqui funciona
 * como "esta visita teve alguma leitura com este valor".
 */
export function combinaFiltrosDeDetalhe(grupo: LeituraBruta[], filtros: Filtros): boolean {
  const semFiltroDeDetalhe = !filtros.evento && !filtros.checkpoint && !filtros.atividade;
  if (semFiltroDeDetalhe) return true;

  return grupo.some((leitura) => {
    if (filtros.evento && String(leitura.evento_id) !== filtros.evento) return false;
    if (filtros.checkpoint && String(leitura.qr_code_id) !== filtros.checkpoint) return false;
    if (filtros.atividade && String(leitura.acao_id) !== filtros.atividade) return false;
    return true;
  });
}

/** Dia (yyyy-mm-dd) de um timestamp, no fuso da operacao (-03:00). */
function diaNoFusoOperacional(iso: string): string {
  const local = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Conta visitas distintas por Local e por dia -- o dia de uma visita e o da
 * sua leitura mais antiga dentro do periodo buscado. `sitesBase` decide quais
 * linhas existem (todo Local ativo aparece, mesmo com zero visitas -- e o
 * ponto do relatorio, mapear cobertura); `leituras` decide as contagens.
 * Exportada pura para ser testada com dados fabricados, sem mockar o
 * Supabase.
 */
export function contarInspecoesPorSiteEDia(
  sitesBase: { id: number; nome: string }[],
  leituras: LeituraBruta[],
  filtros: Filtros,
): LinhaMapa[] {
  const porVisita = new Map<number, LeituraBruta[]>();
  for (const leitura of leituras) {
    if (!leitura.visitas) continue;
    const grupo = porVisita.get(leitura.visita_id) ?? [];
    grupo.push(leitura);
    porVisita.set(leitura.visita_id, grupo);
  }

  const porSiteEDia = new Map<number, Map<string, Set<number>>>();
  const totalPorSite = new Map<number, Set<number>>();

  for (const [visitaId, grupo] of porVisita) {
    if (!combinaFiltrosDeDetalhe(grupo, filtros)) continue;

    const siteId = grupo[0].visitas!.site_id;
    const dataMaisAntiga = grupo.map((l) => l.data_hora).sort()[0];
    const dia = diaNoFusoOperacional(dataMaisAntiga);

    if (!porSiteEDia.has(siteId)) porSiteEDia.set(siteId, new Map());
    const diasDoSite = porSiteEDia.get(siteId)!;
    if (!diasDoSite.has(dia)) diasDoSite.set(dia, new Set());
    diasDoSite.get(dia)!.add(visitaId);

    if (!totalPorSite.has(siteId)) totalPorSite.set(siteId, new Set());
    totalPorSite.get(siteId)!.add(visitaId);
  }

  return sitesBase
    .map((site) => {
      const diasDoSite = porSiteEDia.get(site.id);
      const porDia: Record<string, number> = {};
      if (diasDoSite) {
        for (const [dia, visitas] of diasDoSite) porDia[dia] = visitas.size;
      }
      return {
        siteId: site.id,
        siteNome: site.nome,
        porDia,
        total: totalPorSite.get(site.id)?.size ?? 0,
      };
    })
    .sort((a, b) => a.siteNome.localeCompare(b.siteNome, "pt-BR"));
}

const FUSO_OPERACIONAL = "-03:00";

function montarSelectLeituras(precisaGrupoUsuario: boolean): string {
  return `
    visita_id, data_hora, evento_id, qr_code_id, acao_id,
    visitas!inner (
      site_id, funcionario_id, motivo_visita_id, coletor_dados_id
      ${precisaGrupoUsuario ? ", profiles!inner ( grupos_usuarios_membros!inner ( grupo_id ) )" : ""}
    )
  `;
}

/** `query: any` pelo mesmo motivo das demais telas: o cliente aqui nao
 * carrega o generic `Database`. */
function aplicarFiltrosDeSite(query: any, filtros: Filtros) {
  let q = query;
  if (!filtros.locaisInativos) q = q.eq("ativo", true);
  if (filtros.local) q = q.eq("id", filtros.local);
  if (filtros.sites) q = q.eq("id", filtros.sites);
  if (filtros.grupoSite) q = q.eq("grupo_site_id", filtros.grupoSite);
  return q;
}

function aplicarFiltrosDeLeitura(query: any, filtros: Filtros, diaInicial: string, diaFinal: string) {
  let q = query;
  if (filtros.funcionario) q = q.eq("visitas.funcionario_id", filtros.funcionario);
  if (filtros.motivo) q = q.eq("visitas.motivo_visita_id", filtros.motivo);
  if (filtros.coletorDados) q = q.eq("visitas.coletor_dados_id", filtros.coletorDados);
  if (filtros.grupoUsuario) {
    q = q.eq("visitas.profiles.grupos_usuarios_membros.grupo_id", filtros.grupoUsuario);
  }

  q = q.gte("data_hora", `${diaInicial}T00:00:00${FUSO_OPERACIONAL}`);
  q = q.lte("data_hora", `${diaFinal}T23:59:59${FUSO_OPERACIONAL}`);
  return q;
}

export type MapaDeLocaisInspecionados = {
  dias: string[];
  linhas: LinhaMapa[];
  diasExcedidos: boolean;
  /** A busca parou no teto de agregacao: as contagens saem por baixo. Nao
   * confundir com `diasExcedidos`, que corta colunas (dias) e nao linhas. */
  truncado: boolean;
};

/** null quando o periodo (Data Inicial/Final) nao foi informado -- a tela
 * pede os dois antes de rodar, mesmo criterio do "Selecione um local" em
 * visitas-de-supervisao. */
export async function getMapaDeLocaisInspecionados(filtros: Filtros): Promise<MapaDeLocaisInspecionados | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const dias = listarDias(filtros.dataInicial, filtros.dataFinal);
  const diasExcedidos = dias.length > LIMITE_DIAS;
  const diasConsultados = diasExcedidos ? dias.slice(0, LIMITE_DIAS) : dias;

  const supabase = await createClient();
  const precisaGrupoUsuario = Boolean(filtros.grupoUsuario);

  const [sitesResultado, leituras] = await Promise.all([
    aplicarFiltrosDeSite(supabase.from("sites").select("id, nome").order("nome"), filtros),
    // Paginado pelo mesmo motivo de horas-por-usuario: a consulta parava no
    // `max_rows` do PostgREST e a contagem por Local x dia saia por baixo, sem
    // erro. Ordenacao obrigatoria para `.range()` nao repetir nem pular linha.
    buscarEmPaginas<LeituraBruta>((de, ate) =>
      aplicarFiltrosDeLeitura(
        supabase
          .from("leituras")
          .select(montarSelectLeituras(precisaGrupoUsuario))
          .order("data_hora", { ascending: true })
          .order("id", { ascending: true })
          .range(de, ate),
        filtros,
        diasConsultados[0],
        diasConsultados[diasConsultados.length - 1],
      ),
    ),
  ]);

  if (sitesResultado.error) throw sitesResultado.error;

  if (leituras.atingiuTeto) {
    erro(
      gerarIdDeRequisicao(),
      `Mapa de Locais Inspecionados: teto de ${TETO_DE_AGREGACAO} leituras atingido; as contagens exibidas estão incompletas.`,
    );
  }

  const linhas = contarInspecoesPorSiteEDia(
    (sitesResultado.data ?? []) as { id: number; nome: string }[],
    leituras.linhas,
    filtros,
  );

  return { dias: diasConsultados, linhas, diasExcedidos, truncado: leituras.atingiuTeto };
}

export function paraLinhaDeExportacao(linha: LinhaMapa, dias: string[]): string[] {
  return [linha.siteNome, ...dias.map((dia) => String(linha.porDia[dia] ?? 0)), String(linha.total)];
}

export function colunasDeExportacao(dias: string[]): string[] {
  return ["Local", ...dias.map(formatarDiaCurto), "Total"];
}
