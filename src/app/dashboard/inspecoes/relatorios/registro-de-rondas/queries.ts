import { createClient } from "@/lib/supabase/server";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export type Filtros = {
  /** "yyyy-mm". Sem valor -> mes atual (ver extrairFiltros). */
  mes: string;
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

const MES_ATUAL = () => {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
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
    mes: mesValido(mes) ? mes : MES_ATUAL(),
    local: primeiro(params.local),
    coletorDados: primeiro(params.coletor_dados),
    funcionario: primeiro(params.funcionario),
    area: primeiro(params.area),
    evento: primeiro(params.evento),
    qualificador: primeiro(params.qualificador),
    checkpoint: primeiro(params.checkpoint),
    atividade: primeiro(params.atividade),
    grupoSite: primeiro(params.grupo_site),
    grupoUsuario: primeiro(params.grupo_usuario),
    motivo: primeiro(params.motivo),
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

export type RegistroDeRondas = {
  linhas: RegistroDeRondasLinha[];
  /** true quando LIMITE_LEITURAS foi atingido -- o mes tem mais leituras do
   * que o buscado, e os totais abaixo podem estar incompletos. */
  truncado: boolean;
};

type LeituraBruta = {
  id: number;
  visita_id: number;
  data_hora: string;
  area_id: number | null;
  evento_id: number | null;
  qualificador_id: number | null;
  qr_code_id: number | null;
  acao_id: number | null;
  areas: { nome: string } | null;
  visitas: {
    site_id: number;
    sites: { id: number; nome: string; grupo_site_id: number } | null;
  } | null;
};

/**
 * Fuso da operacao (Brasilia), mesmo criterio das demais telas: fixo em
 * -03:00 porque o Brasil nao observa mais horario de verao desde 2019.
 */
const FUSO_OPERACIONAL = "-03:00";

/** Teto de leituras buscadas no mes -- este relatorio nao pagina a consulta
 * (a paginacao em page.tsx e sobre as LINHAS ja agregadas, nao sobre as
 * leituras), entao precisa de um limite defensivo como o das exportacoes.
 * Exportado para a tela de impressao (`TabelaImpressao` mostra "limitado aos
 * primeiros N" quando truncado). */
export const LIMITE_LEITURAS = 5000;

const NOME_AREA_INICIO = "Início";
const NOME_AREA_TERMINO = "Término";

function montarSelect(precisaGrupoUsuario: boolean): string {
  return `
    id, visita_id, data_hora, area_id, evento_id, qualificador_id, qr_code_id, acao_id,
    areas ( nome ),
    visitas!inner (
      site_id,
      sites!inner ( id, nome, grupo_site_id )
      ${precisaGrupoUsuario ? ", profiles!inner ( grupos_usuarios_membros!inner ( grupo_id ) )" : ""}
    )
  `;
}

/**
 * `query: any` pelo mesmo motivo de `aplicarFiltrosDeColeta` em
 * coletas-importadas/queries.ts: o cliente aqui nao carrega o generic
 * `Database`, entao o builder do PostgREST nao devolve um tipo proprio para
 * reencadear `.eq()` tipado.
 */
function aplicarFiltrosDeVisita(query: any, filtros: Filtros) {
  let q = query;

  if (filtros.local) q = q.eq("visitas.sites.id", filtros.local);
  if (filtros.grupoSite) q = q.eq("visitas.sites.grupo_site_id", filtros.grupoSite);
  if (filtros.funcionario) q = q.eq("visitas.funcionario_id", filtros.funcionario);
  if (filtros.motivo) q = q.eq("visitas.motivo_visita_id", filtros.motivo);
  if (filtros.coletorDados) q = q.eq("visitas.coletor_dados_id", filtros.coletorDados);
  if (filtros.grupoUsuario) {
    q = q.eq("visitas.profiles.grupos_usuarios_membros.grupo_id", filtros.grupoUsuario);
  }

  const [ano, mes] = filtros.mes.split("-").map(Number);
  const anoFim = mes === 12 ? ano + 1 : ano;
  const mesFim = mes === 12 ? 1 : mes + 1;
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01T00:00:00${FUSO_OPERACIONAL}`;
  const fim = `${anoFim}-${String(mesFim).padStart(2, "0")}-01T00:00:00${FUSO_OPERACIONAL}`;
  q = q.gte("data_hora", inicio).lt("data_hora", fim);

  return q;
}

/**
 * Area/Evento/Qualificador/Checkpoint/Atividade nao entram em
 * `aplicarFiltrosDeVisita`: filtrar a consulta por eles excluiria a leitura
 * de Inicio OU a de Termino de uma ronda (cada leitura carrega um so valor
 * de cada campo), quebrando o calculo de duracao. Em vez disso, cada um
 * funciona como "esta ronda teve alguma leitura com este valor" -- avaliado
 * aqui, depois de agrupar as leituras por visita.
 */
export function combinaFiltrosDeDetalhe(grupo: LeituraBruta[], filtros: Filtros): boolean {
  const semFiltroDeDetalhe =
    !filtros.area && !filtros.evento && !filtros.qualificador && !filtros.checkpoint && !filtros.atividade;
  if (semFiltroDeDetalhe) return true;

  return grupo.some((leitura) => {
    if (filtros.area && String(leitura.area_id) !== filtros.area) return false;
    if (filtros.evento && String(leitura.evento_id) !== filtros.evento) return false;
    if (filtros.qualificador && String(leitura.qualificador_id) !== filtros.qualificador) return false;
    if (filtros.checkpoint && String(leitura.qr_code_id) !== filtros.checkpoint) return false;
    if (filtros.atividade && String(leitura.acao_id) !== filtros.atividade) return false;
    return true;
  });
}

/** Dia do mes (1-31) de um timestamp, no fuso da operacao. getUTCDate() em
 * vez de getDate(): independe do fuso de quem roda o processo. */
function diaNoFusoOperacional(iso: string): number {
  return new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000).getUTCDate();
}

/**
 * Agrupa leituras em linhas por Local, com a duracao (Termino - Inicio) de
 * cada ronda no dia em que ela comecou. Exportada pura (sem Supabase) para
 * ser testada direto com leituras fabricadas -- ver queries.test.ts.
 */
export function agruparEmLinhas(leituras: LeituraBruta[], filtros: Filtros): RegistroDeRondasLinha[] {
  const porVisita = new Map<number, LeituraBruta[]>();
  for (const leitura of leituras) {
    if (!leitura.visitas?.sites) continue;
    const grupo = porVisita.get(leitura.visita_id) ?? [];
    grupo.push(leitura);
    porVisita.set(leitura.visita_id, grupo);
  }

  const porSite = new Map<number, RegistroDeRondasLinha>();

  for (const grupo of porVisita.values()) {
    if (!combinaFiltrosDeDetalhe(grupo, filtros)) continue;

    const inicios = grupo
      .filter((l) => l.areas?.nome === NOME_AREA_INICIO)
      .map((l) => l.data_hora)
      .sort();
    const terminos = grupo
      .filter((l) => l.areas?.nome === NOME_AREA_TERMINO)
      .map((l) => l.data_hora)
      .sort();
    const dataInicio = inicios[0];
    const dataTermino = terminos[terminos.length - 1];
    if (!dataInicio || !dataTermino) continue;

    const duracaoMs = new Date(dataTermino).getTime() - new Date(dataInicio).getTime();
    if (duracaoMs <= 0) continue;

    const site = grupo[0].visitas!.sites!;
    const dia = diaNoFusoOperacional(dataInicio);

    let linha = porSite.get(site.id);
    if (!linha) {
      linha = {
        siteId: site.id,
        siteNome: site.nome,
        duracoesPorDia: Array.from({ length: 31 }, () => []),
        totalMs: 0,
      };
      porSite.set(site.id, linha);
    }
    linha.duracoesPorDia[dia - 1].push(duracaoMs);
    linha.totalMs += duracaoMs;
  }

  return Array.from(porSite.values()).sort((a, b) => a.siteNome.localeCompare(b.siteNome, "pt-BR"));
}

export async function getRegistroDeRondas(filtros: Filtros): Promise<RegistroDeRondas> {
  const supabase = await createClient();

  const precisaGrupoUsuario = Boolean(filtros.grupoUsuario);

  const query = aplicarFiltrosDeVisita(
    supabase
      .from("leituras")
      .select(montarSelect(precisaGrupoUsuario))
      .order("data_hora", { ascending: true })
      .range(0, LIMITE_LEITURAS),
    filtros,
  );

  const { data, error } = await query;
  if (error) throw error;

  const leituras = (data ?? []) as unknown as LeituraBruta[];
  const truncado = leituras.length > LIMITE_LEITURAS;

  return { linhas: agruparEmLinhas(leituras.slice(0, LIMITE_LEITURAS), filtros), truncado };
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
