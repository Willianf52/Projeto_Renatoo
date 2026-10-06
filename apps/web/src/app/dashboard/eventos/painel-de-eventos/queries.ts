import { dataValida, periodoEntreDatas } from "@/lib/data-hora";
import { niveisDoSite } from "@/lib/hierarquia-de-sites";
import { filtroDeId, filtroDeUuid, idNaUrl } from "@/lib/id-na-url";
import { termoParaOr } from "@/lib/postgrest-escape";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas, paginar } from "@/lib/supabase/query-helpers";

/**
 * Painel de Eventos -- a lista das ocorrencias (0063), como o
 * `vlab_rel_eventos.php` do sistema de referencia: Numero/Ano, Data, Hora,
 * Site, Evento, Setor e Usuario Responsavel, Usuario Abertura, Status com o
 * tempo em aberto, e as acoes. Fica fora do menu, como la: chega-se pela lupa
 * do Registro de Eventos.
 *
 * Tudo passa pelo RLS da 0063: cada um ve as ocorrencias das visitas que pode
 * ver.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export const PAGE_SIZE = 15;

/** Sem periodo escolhido, os ultimos 60 dias -- o que o sistema de referencia
 * abre preenchido. */
export const DIAS_PADRAO = 60;

export type Status = "AGUARDANDO" | "EM_ANALISE" | "ATENDIDO" | "CANCELADO" | "CRITICO";

/** Os status que o banco aceita (0063), na ordem do sistema de referencia. */
export const STATUS: { value: Status; label: string; cor: string; anel: string }[] = [
  { value: "AGUARDANDO", label: "Aguardando", cor: "bg-red-600", anel: "#dc2626" },
  { value: "EM_ANALISE", label: "Em Análise", cor: "bg-amber-500", anel: "#f59e0b" },
  { value: "ATENDIDO", label: "Atendido", cor: "bg-emerald-600", anel: "#059669" },
  { value: "CANCELADO", label: "Cancelado", cor: "bg-slate-500", anel: "#64748b" },
  { value: "CRITICO", label: "Crítico", cor: "bg-fuchsia-700", anel: "#a21caf" },
];

export function rotuloDoStatus(status: string): string {
  return STATUS.find((s) => s.value === status)?.label ?? status;
}

export function anelDoStatus(status: string): string {
  return STATUS.find((s) => s.value === status)?.anel ?? "#475569";
}

export function corDoStatus(status: string): string {
  return STATUS.find((s) => s.value === status)?.cor ?? "bg-slate-600";
}

export type Filtros = {
  dataInicial: string;
  dataFinal: string;
  busca?: string;
  sites?: string;
  status?: Status;
  numero?: string;
  ano?: string;
  evento?: string;
  grupoSite?: string;
  usuario?: string;
  pagina: number;
};

/** "yyyy-mm-dd" de hoje e de `dias` atras, no horario de Brasilia (UTC-3, sem
 * horario de verao desde 2019). `agora` injetavel para o teste. */
export function periodoPadrao(agora: Date, dias = DIAS_PADRAO): { dataInicial: string; dataFinal: string } {
  const hoje = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const inicio = new Date(hoje.getTime() - dias * 24 * 60 * 60 * 1000);
  return { dataInicial: inicio.toISOString().slice(0, 10), dataFinal: hoje.toISOString().slice(0, 10) };
}

export function extrairFiltros(params: SearchParams, agora: Date): Filtros {
  const padrao = periodoPadrao(agora);
  const status = primeiro(params.status);
  const numero = primeiro(params.numero);
  const ano = primeiro(params.ano);
  const pagina = Number(primeiro(params.pagina));

  return {
    dataInicial: dataValida(primeiro(params.data_inicial)) ?? padrao.dataInicial,
    dataFinal: dataValida(primeiro(params.data_final)) ?? padrao.dataFinal,
    busca: primeiro(params.busca)?.trim().slice(0, 100) || undefined,
    sites: filtroDeId(primeiro(params.sites)),
    status: STATUS.some((s) => s.value === status) ? (status as Status) : undefined,
    numero: numero && /^\d{1,7}$/.test(numero) ? numero : undefined,
    ano: ano && /^\d{4}$/.test(ano) ? ano : undefined,
    evento: filtroDeId(primeiro(params.evento)),
    grupoSite: filtroDeId(primeiro(params.grupo_site)),
    usuario: filtroDeUuid(primeiro(params.usuario)),
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
  };
}

/** Dias, horas e minutos desde a abertura -- o "cronometro" do Status. */
export function tempoEmAberto(criadoEm: string, agora: Date): { dias: number; horas: number; minutos: number } {
  const total = Math.max(0, Math.floor((agora.getTime() - new Date(criadoEm).getTime()) / 60_000));
  return { dias: Math.floor(total / 1440), horas: Math.floor((total % 1440) / 60), minutos: total % 60 };
}

/** "Nao conforme" e "Sim" sao as unicas respostas que abrem ocorrencia (0063). */
export function rotuloDaResposta(resposta: string): string {
  return resposta === "SIM" ? "Sim" : resposta === "NAO" ? "Não conforme" : resposta;
}

/**
 * O texto que o sistema de referencia poe na "Descricao do Evento" e na
 * "Observacao" do detalhe. Montado na leitura, e nao gravado: o banco ja guarda
 * as partes (pergunta, resposta, observacao), e assim o texto nao desencontra
 * delas.
 */
export function descricaoAutomatica(o: {
  checklistId: number;
  pergunta: string;
  resposta: string;
  observacao: string | null;
}): string[] {
  return [
    `Evento gerado automaticamente pelo Checklist nº ${o.checklistId}`,
    `Pergunta: ${o.pergunta}`,
    `Resposta: ${rotuloDaResposta(o.resposta)}`,
    ...(o.observacao ? [`Observações: ${o.observacao}`] : []),
  ];
}

export type Opcao = { value: string; label: string };

type SiteDoBanco = { nome: string; grupo_site_id: number | null; grupos_sites: { nome: string } | null };

type LinhaDoBanco = {
  id: number;
  numero: number;
  ano: number;
  criado_em: string;
  status: string;
  checklist_id: number;
  pergunta_texto: string;
  resposta: string;
  observacao: string | null;
  sites: SiteDoBanco | null;
  eventos: { nome: string } | null;
  autor: { nome_completo: string | null } | null;
};

export type LinhaDoPainel = {
  id: number;
  numeroAno: string;
  criadoEm: string;
  status: string;
  siteNiveis: string[];
  evento: string;
  usuarioAbertura: string;
  descricao: string[];
};

const SELECT_DA_LISTA = `id, numero, ano, criado_em, status, checklist_id, pergunta_texto, resposta, observacao,
  sites!inner ( nome, grupo_site_id, grupos_sites ( nome ) ),
  eventos ( nome ),
  autor:profiles!ocorrencias_aberta_por_fkey ( nome_completo )`;

export function paraLinha(o: LinhaDoBanco): LinhaDoPainel {
  return {
    id: o.id,
    numeroAno: `${o.numero} / ${o.ano}`,
    criadoEm: o.criado_em,
    status: o.status,
    siteNiveis: niveisDoSite(o.sites?.grupos_sites?.nome, o.sites?.nome ?? ""),
    evento: o.eventos?.nome ?? "",
    usuarioAbertura: o.autor?.nome_completo ?? "",
    descricao: descricaoAutomatica({
      checklistId: o.checklist_id,
      pergunta: o.pergunta_texto,
      resposta: o.resposta,
      observacao: o.observacao,
    }),
  };
}

// O construtor do PostgREST muda de tipo a cada `.eq`; os filtros sao os
// mesmos para a lista e para o resumo, entao recebem e devolvem o construtor
// sem amarrar o tipo de linha.
function aplicarFiltros(consulta: any, filtros: Filtros, comStatus: boolean) {
  const { inicio, fim } = periodoEntreDatas(filtros.dataInicial, filtros.dataFinal);
  let q = consulta.gte("criado_em", inicio).lt("criado_em", fim);
  if (filtros.sites) q = q.eq("site_id", filtros.sites);
  if (comStatus && filtros.status) q = q.eq("status", filtros.status);
  if (filtros.numero) q = q.eq("numero", filtros.numero);
  if (filtros.ano) q = q.eq("ano", filtros.ano);
  if (filtros.evento) q = q.eq("evento_id", filtros.evento);
  if (filtros.grupoSite) q = q.eq("sites.grupo_site_id", filtros.grupoSite);
  if (filtros.usuario) q = q.eq("aberta_por", filtros.usuario);
  if (filtros.busca) {
    const termo = termoParaOr(filtros.busca);
    q = q.or(`pergunta_texto.ilike."*${termo}*",observacao.ilike."*${termo}*"`);
  }
  return q;
}

export type Painel = {
  linhas: LinhaDoPainel[];
  total: number;
  /** Quantas de cada status no filtro inteiro (sem o filtro de status), para
   * os cartoes do topo. */
  resumo: { status: string; quantidade: number }[];
};

export async function getPainel(filtros: Filtros): Promise<Painel> {
  const supabase = await createClient();
  const { from, to } = paginar(filtros.pagina, PAGE_SIZE);

  const lista = aplicarFiltros(
    supabase.from("ocorrencias").select(SELECT_DA_LISTA, { count: "exact" }),
    filtros,
    true,
  )
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const [{ data, count, error }, { linhas: statusDoFiltro }] = await Promise.all([
    lista as Promise<{ data: LinhaDoBanco[] | null; count: number | null; error: unknown }>,
    buscarEmPaginas<{ status: string }>((de, ate) =>
      aplicarFiltros(supabase.from("ocorrencias").select("status, sites!inner ( grupo_site_id )"), filtros, false)
        .order("id", { ascending: true })
        .range(de, ate),
    ),
  ]);

  if (error) throw error;

  return {
    linhas: (data ?? []).map(paraLinha),
    total: count ?? 0,
    resumo: montarResumo(statusDoFiltro),
  };
}

/** Contagem por status, na ordem de `STATUS`, so dos que aparecem. Pura. */
export function montarResumo(linhas: { status: string }[]): { status: string; quantidade: number }[] {
  const contagem = new Map<string, number>();
  for (const { status } of linhas) contagem.set(status, (contagem.get(status) ?? 0) + 1);
  return STATUS.filter((s) => contagem.has(s.value)).map((s) => ({ status: s.value, quantidade: contagem.get(s.value)! }));
}

export type OpcoesFiltros = { sites: Opcao[]; eventos: Opcao[]; grupos: Opcao[]; usuarios: Opcao[] };

/** Sem cache: `sites` e `profiles` sao recortados por RLS conforme quem pede. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();
  const [sites, eventos, grupos, usuarios] = await Promise.all([
    supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
    supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_sites").select("id, nome").order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
  ]);

  return {
    sites: ((sites.data ?? []) as unknown as { id: number; nome: string; grupos_sites: { nome: string } | null }[]).map(
      (s) => ({ value: String(s.id), label: s.grupos_sites?.nome ? `${s.grupos_sites.nome} - ${s.nome}` : s.nome }),
    ),
    eventos: (eventos.data ?? []).map((e) => ({ value: String(e.id), label: e.nome })),
    grupos: (grupos.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
    usuarios: (usuarios.data ?? []).map((u) => ({ value: String(u.id), label: u.nome_completo ?? "" })),
  };
}

// --- Detalhe ("Registro de Evento On-Line") ------------------------------------

export function idValido(valor: string): number | null {
  return idNaUrl(valor);
}

export type AnexoDoAndamento = { id: number; nome: string };

export type AndamentoDaOcorrencia = {
  id: number;
  tipo: "ANALISE" | "FINALIZACAO";
  criadoEm: string;
  /** Vazio quando quem le nao enxerga o perfil (o INSPETOR so le o proprio). */
  autor: string;
  tipoDeAnalise: string;
  classificacao: string;
  texto: string;
  responsavel: string;
  grupo: string;
  apoio: string[];
  avisar: string[];
  emailsExternos: string[];
  anexos: AnexoDoAndamento[];
};

export type OcorrenciaDetalhe = LinhaDoPainel & {
  checklistId: number;
  site: string;
  fotos: number[];
  andamentos: AndamentoDaOcorrencia[];
};

type AndamentoDoBanco = {
  id: number;
  tipo: string;
  criado_em: string;
  texto: string;
  apoio: string[];
  avisar: string[];
  emails_externos: string[];
  responsavel_id: string | null;
  autor_id: string | null;
  tipos_de_analise: { nome: string } | null;
  tipos_de_classificacao: { nome: string } | null;
  grupos_usuarios: { nome: string } | null;
  ocorrencia_arquivos: { id: number; nome_original: string }[];
};

export async function getOcorrencia(id: number): Promise<OcorrenciaDetalhe | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ocorrencias").select(SELECT_DA_LISTA).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const linha = paraLinha(data as unknown as LinhaDoBanco);
  const bruto = data as unknown as LinhaDoBanco;

  const [{ data: fotos }, { data: andamentos }] = await Promise.all([
    supabase.from("checklist_fotos").select("id").eq("checklist_id", bruto.checklist_id).order("id"),
    supabase
      .from("ocorrencia_andamentos")
      .select(
        `id, tipo, criado_em, texto, apoio, avisar, emails_externos, responsavel_id, autor_id,
         tipos_de_analise ( nome ), tipos_de_classificacao ( nome ), grupos_usuarios ( nome ),
         ocorrencia_arquivos ( id, nome_original )`,
      )
      .eq("ocorrencia_id", id)
      .order("criado_em", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  const doBanco = (andamentos ?? []) as unknown as AndamentoDoBanco[];

  // Nomes das pessoas citadas. O RLS de `profiles` decide quem aparece: a
  // gestao ve todo mundo, o INSPETOR so a si mesmo -- o resto vira vazio.
  const ids = Array.from(
    new Set(doBanco.flatMap((a) => [a.autor_id, a.responsavel_id, ...a.apoio, ...a.avisar]).filter((v): v is string => Boolean(v))),
  );
  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const { data: perfis } = await supabase.from("profiles").select("id, nome_completo").in("id", ids);
    for (const perfil of perfis ?? []) nomes.set(perfil.id, perfil.nome_completo ?? "");
  }
  const nomeDe = (uuid: string | null) => (uuid ? (nomes.get(uuid) ?? "") : "");

  return {
    ...linha,
    checklistId: bruto.checklist_id,
    site: bruto.sites?.nome ?? "",
    fotos: (fotos ?? []).map((f) => f.id),
    andamentos: doBanco.map((a) => ({
      id: a.id,
      tipo: a.tipo === "FINALIZACAO" ? "FINALIZACAO" : "ANALISE",
      criadoEm: a.criado_em,
      autor: nomeDe(a.autor_id),
      tipoDeAnalise: a.tipos_de_analise?.nome ?? "",
      classificacao: a.tipos_de_classificacao?.nome ?? "",
      texto: a.texto,
      responsavel: nomeDe(a.responsavel_id),
      grupo: a.grupos_usuarios?.nome ?? "",
      apoio: a.apoio.map(nomeDe).filter(Boolean),
      avisar: a.avisar.map(nomeDe).filter(Boolean),
      emailsExternos: a.emails_externos,
      anexos: [...a.ocorrencia_arquivos]
        .sort((x, y) => x.id - y.id)
        .map((arquivo) => ({ id: arquivo.id, nome: arquivo.nome_original })),
    })),
  };
}

export type OpcoesDoAndamento = {
  tiposDeAnalise: Opcao[];
  classificacoes: Opcao[];
  usuarios: Opcao[];
  grupos: Opcao[];
  /** Os usuarios de cada grupo: escolher o grupo preenche o Apoio. */
  membrosPorGrupo: Record<string, string[]>;
};

/** So para quem pode analisar: os cadastros sao legiveis so pela gestao (0064). */
export async function getOpcoesDoAndamento(): Promise<OpcoesDoAndamento> {
  const supabase = await createClient();
  const [tipos, classificacoes, usuarios, grupos, membros] = await Promise.all([
    supabase.from("tipos_de_analise").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("tipos_de_classificacao").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
    supabase.from("grupos_usuarios_membros").select("grupo_id, profile_id"),
  ]);

  const membrosPorGrupo: Record<string, string[]> = {};
  for (const m of membros.data ?? []) {
    (membrosPorGrupo[String(m.grupo_id)] ??= []).push(m.profile_id);
  }

  return {
    tiposDeAnalise: (tipos.data ?? []).map((t) => ({ value: String(t.id), label: t.nome })),
    classificacoes: (classificacoes.data ?? []).map((c) => ({ value: String(c.id), label: c.nome })),
    usuarios: (usuarios.data ?? []).map((u) => ({ value: u.id, label: u.nome_completo ?? "" })),
    grupos: (grupos.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
    membrosPorGrupo,
  };
}

/** Anexo de um andamento: o caminho e o nome, para a rota que o entrega. */
export async function getAnexo(id: number): Promise<{ caminho: string; nome: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ocorrencia_arquivos")
    .select("storage_path, nome_original")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return { caminho: data.storage_path, nome: data.nome_original };
}
