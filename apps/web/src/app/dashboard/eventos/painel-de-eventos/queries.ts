import { dataValida, periodoEntreDatas } from "@/lib/data-hora";
import { niveisDoSite } from "@/lib/hierarquia-de-sites";
import { filtroDeId, filtroDeUuid, idNaUrl } from "@/lib/id-na-url";
import { escaparLike, termoParaOr } from "@/lib/postgrest-escape";
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

export { STATUS, rotuloDoStatus, anelDoStatus, corDoStatus, TAREFAS_EM_ABERTO, type Status } from "./status";
import { rotuloDoStatus, STATUS, STATUS_EM_ABERTO, TAREFAS_EM_ABERTO, type Status } from "./status";

export type Filtros = {
  dataInicial: string;
  dataFinal: string;
  busca?: string;
  sites?: string;
  /** Um status, ou `TAREFAS_EM_ABERTO` (todo evento nao encerrado). */
  status?: Status | typeof TAREFAS_EM_ABERTO;
  numero?: string;
  ano?: string;
  evento?: string;
  grupoSite?: string;
  usuario?: string;
  /** Codigo (ou parte) do QR-Code lido na visita que abriu a ocorrencia. */
  qrcode?: string;
  /** Modelo de checklist que abriu a ocorrencia. */
  checklist?: string;
  /** Tipo de analise do andamento mais recente. */
  tipoAnalise?: string;
  /** Autor do andamento mais recente ("Usuario Remetente" do antigo). */
  remetente?: string;
  /** Responsavel atual: o do andamento mais recente que indicou um. */
  responsavel?: string;
  grupoAbertura?: string;
  grupoRemetente?: string;
  grupoResponsavel?: string;
  visao: Visao;
  pagina: number;
};

/** "Lista" (a tabela paginada) ou "Quadro" (colunas por status), como os dois
 * botoes de "Modo de visualizacao" do sistema de referencia. */
export type Visao = "lista" | "quadro";

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
    status:
      status === TAREFAS_EM_ABERTO
        ? TAREFAS_EM_ABERTO
        : STATUS.some((s) => s.value === status)
          ? (status as Status)
          : undefined,
    numero: numero && /^\d{1,7}$/.test(numero) ? numero : undefined,
    ano: ano && /^\d{4}$/.test(ano) ? ano : undefined,
    evento: filtroDeId(primeiro(params.evento)),
    grupoSite: filtroDeId(primeiro(params.grupo_site)),
    usuario: filtroDeUuid(primeiro(params.usuario)),
    qrcode: primeiro(params.qrcode)?.trim().slice(0, 60) || undefined,
    checklist: filtroDeId(primeiro(params.checklist)),
    tipoAnalise: filtroDeId(primeiro(params.tipo_analise)),
    remetente: filtroDeUuid(primeiro(params.remetente)),
    responsavel: filtroDeUuid(primeiro(params.responsavel)),
    grupoAbertura: filtroDeId(primeiro(params.grupo_abertura)),
    grupoRemetente: filtroDeId(primeiro(params.grupo_remetente)),
    grupoResponsavel: filtroDeId(primeiro(params.grupo_responsavel)),
    visao: primeiro(params.visao) === "quadro" ? "quadro" : "lista",
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
  checklistId: number | null;
  pergunta: string | null;
  resposta: string | null;
  observacao: string | null;
}): string[] {
  // Registrar Evento (0072): sem checklist, sem pergunta e sem resposta.
  if (o.checklistId === null || o.pergunta === null || o.resposta === null) {
    return ["Evento registrado manualmente no portal", ...(o.observacao ? [`Observações: ${o.observacao}`] : [])];
  }
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
  checklist_id: number | null;
  pergunta_texto: string | null;
  resposta: string | null;
  observacao: string | null;
  local_descricao: string | null;
  sites: SiteDoBanco | null;
  eventos: { nome: string } | null;
  subevento: { nome: string } | null;
  tipos_de_classificacao: { nome: string } | null;
  autor: { nome_completo: string | null } | null;
};

export type LinhaDoPainel = {
  id: number;
  subtipo: string;
  classificacao: string;
  /** "Local do evento" do Registrar Evento (0082). */
  local: string;
  numeroAno: string;
  criadoEm: string;
  status: string;
  siteNiveis: string[];
  evento: string;
  usuarioAbertura: string;
  descricao: string[];
};

const SELECT_DA_LISTA = `id, numero, ano, criado_em, status, checklist_id, pergunta_texto, resposta, observacao, local_descricao,
  sites!inner ( nome, grupo_site_id, grupos_sites ( nome ) ),
  eventos!ocorrencias_evento_id_fkey ( nome ),
  subevento:eventos!ocorrencias_subevento_id_fkey ( nome ),
  tipos_de_classificacao ( nome ),
  autor:profiles!ocorrencias_aberta_por_fkey ( nome_completo )`;

export function paraLinha(o: LinhaDoBanco): LinhaDoPainel {
  return {
    id: o.id,
    numeroAno: `${o.numero} / ${o.ano}`,
    criadoEm: o.criado_em,
    status: o.status,
    siteNiveis: niveisDoSite(o.sites?.grupos_sites?.nome, o.sites?.nome ?? ""),
    evento: o.eventos?.nome ?? "",
    subtipo: o.subevento?.nome ?? "",
    classificacao: o.tipos_de_classificacao?.nome ?? "",
    local: o.local_descricao ?? "",
    usuarioAbertura: o.autor?.nome_completo ?? "",
    descricao: descricaoAutomatica({
      checklistId: o.checklist_id,
      pergunta: o.pergunta_texto,
      resposta: o.resposta,
      observacao: o.observacao,
    }),
  };
}

/**
 * O que os filtros de outras tabelas (QR-Code, Checklist, andamentos, grupos
 * de usuarios) deixam passar, ja resolvido em listas de ids. `undefined` e
 * "este filtro nao foi usado"; lista vazia e "nenhuma ocorrencia passa".
 *
 * Calculado uma vez por tela e aplicado igual na lista, no resumo, no quadro
 * e nas exportacoes: os numeros do topo nao podem discordar da tabela.
 */
export type Restricoes = {
  ids?: number[];
  visitas?: number[];
  checklists?: number[];
  abertaPor?: string[];
};

export type AndamentoResumido = {
  id: number;
  ocorrencia_id: number;
  criado_em: string;
  autor_id: string | null;
  responsavel_id: string | null;
  tipo_analise_id: number;
};

export type SituacaoDaOcorrencia = {
  remetente: string | null;
  responsavel: string | null;
  tipoAnalise: number | null;
};

/**
 * A situacao de cada ocorrencia segundo os andamentos: quem mandou o ultimo
 * ("Remetente"), o tipo de analise dele e o responsavel atual -- o do ultimo
 * andamento que indicou alguem, porque a finalizacao nao indica responsavel e
 * nao tira a responsabilidade de quem a tinha. Pura.
 */
export function situacaoPelosAndamentos(andamentos: AndamentoResumido[]): Map<number, SituacaoDaOcorrencia> {
  const ordenados = [...andamentos].sort((a, b) => a.criado_em.localeCompare(b.criado_em) || a.id - b.id);
  const situacao = new Map<number, SituacaoDaOcorrencia>();
  for (const a of ordenados) {
    const atual = situacao.get(a.ocorrencia_id);
    situacao.set(a.ocorrencia_id, {
      remetente: a.autor_id,
      responsavel: a.responsavel_id ?? atual?.responsavel ?? null,
      tipoAnalise: a.tipo_analise_id,
    });
  }
  return situacao;
}

/**
 * As ocorrencias cuja situacao atende aos filtros de andamento. `membros` traz
 * os usuarios de cada grupo escolhido. Ocorrencia sem andamento nao tem
 * remetente nem responsavel: sai sempre que um desses filtros esta em uso. Pura.
 */
export function idsPelaSituacao(
  situacao: Map<number, SituacaoDaOcorrencia>,
  filtros: Pick<Filtros, "tipoAnalise" | "remetente" | "responsavel">,
  membros: { remetente?: Set<string>; responsavel?: Set<string> },
): number[] {
  const ids: number[] = [];
  for (const [id, s] of situacao) {
    if (filtros.tipoAnalise && String(s.tipoAnalise) !== filtros.tipoAnalise) continue;
    if (filtros.remetente && s.remetente !== filtros.remetente) continue;
    if (filtros.responsavel && s.responsavel !== filtros.responsavel) continue;
    if (membros.remetente && !(s.remetente && membros.remetente.has(s.remetente))) continue;
    if (membros.responsavel && !(s.responsavel && membros.responsavel.has(s.responsavel))) continue;
    ids.push(id);
  }
  return ids.sort((a, b) => a - b);
}

type Cliente = Awaited<ReturnType<typeof createClient>>;

async function membrosDoGrupo(supabase: Cliente, grupo: string | undefined): Promise<Set<string> | undefined> {
  if (!grupo) return undefined;
  const { data, error } = await supabase
    .from("grupos_usuarios_membros")
    .select("profile_id")
    .eq("grupo_id", Number(grupo));
  if (error) throw error;
  return new Set((data ?? []).map((m) => m.profile_id));
}

/** Resolve os filtros que dependem de outras tabelas (ver `Restricoes`). */
export async function resolverRestricoes(supabase: Cliente, filtros: Filtros): Promise<Restricoes> {
  const restricoes: Restricoes = {};

  const [abertura, remetente, responsavel] = await Promise.all([
    membrosDoGrupo(supabase, filtros.grupoAbertura),
    membrosDoGrupo(supabase, filtros.grupoRemetente),
    membrosDoGrupo(supabase, filtros.grupoResponsavel),
  ]);
  if (abertura) restricoes.abertaPor = [...abertura];

  if (filtros.checklist) {
    const { linhas } = await buscarEmPaginas<{ id: number }>((de, ate) =>
      supabase
        .from("checklists_visita")
        .select("id")
        .eq("modelo_id", Number(filtros.checklist))
        .order("id")
        .range(de, ate),
    );
    restricoes.checklists = linhas.map((c) => c.id);
  }

  if (filtros.qrcode) {
    const { data: qrs, error } = await supabase
      .from("qr_codes")
      .select("id")
      .ilike("codigo", `%${escaparLike(filtros.qrcode)}%`)
      .limit(500);
    if (error) throw error;
    const idsDosQr = (qrs ?? []).map((q) => q.id);
    if (idsDosQr.length === 0) {
      restricoes.visitas = [];
    } else {
      const { linhas } = await buscarEmPaginas<{ visita_id: number }>((de, ate) =>
        supabase.from("leituras").select("visita_id").in("qr_code_id", idsDosQr).order("id").range(de, ate),
      );
      restricoes.visitas = [...new Set(linhas.map((l) => l.visita_id))];
    }
  }

  if (filtros.tipoAnalise || filtros.remetente || filtros.responsavel || remetente || responsavel) {
    const { linhas } = await buscarEmPaginas<AndamentoResumido>((de, ate) =>
      supabase
        .from("ocorrencia_andamentos")
        .select("id, ocorrencia_id, criado_em, autor_id, responsavel_id, tipo_analise_id")
        .order("id")
        .range(de, ate),
    );
    restricoes.ids = idsPelaSituacao(situacaoPelosAndamentos(linhas), filtros, { remetente, responsavel });
  }

  return restricoes;
}

/** `in.()` vazio: troca por um valor que nao existe, para a consulta voltar
 * vazia sem depender de como o PostgREST trata a lista vazia. */
const NENHUM_ID = [-1];
const NENHUM_UUID = ["00000000-0000-0000-0000-000000000000"];

// O construtor do PostgREST muda de tipo a cada `.eq`; os filtros sao os
// mesmos para a lista e para o resumo, entao recebem e devolvem o construtor
// sem amarrar o tipo de linha.
function aplicarFiltros(consulta: any, filtros: Filtros, comStatus: boolean, restricoes: Restricoes = {}) {
  const { inicio, fim } = periodoEntreDatas(filtros.dataInicial, filtros.dataFinal);
  let q = consulta.gte("criado_em", inicio).lt("criado_em", fim);
  if (filtros.sites) q = q.eq("site_id", filtros.sites);
  if (comStatus && filtros.status === TAREFAS_EM_ABERTO) q = q.in("status", STATUS_EM_ABERTO);
  else if (comStatus && filtros.status) q = q.eq("status", filtros.status);
  if (filtros.numero) q = q.eq("numero", filtros.numero);
  if (filtros.ano) q = q.eq("ano", filtros.ano);
  if (filtros.evento) q = q.eq("evento_id", filtros.evento);
  if (filtros.grupoSite) q = q.eq("sites.grupo_site_id", filtros.grupoSite);
  if (filtros.usuario) q = q.eq("aberta_por", filtros.usuario);
  if (restricoes.ids) q = q.in("id", restricoes.ids.length ? restricoes.ids : NENHUM_ID);
  if (restricoes.visitas) q = q.in("visita_id", restricoes.visitas.length ? restricoes.visitas : NENHUM_ID);
  if (restricoes.checklists) q = q.in("checklist_id", restricoes.checklists.length ? restricoes.checklists : NENHUM_ID);
  if (restricoes.abertaPor) q = q.in("aberta_por", restricoes.abertaPor.length ? restricoes.abertaPor : NENHUM_UUID);
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
  const restricoes = await resolverRestricoes(supabase, filtros);

  const lista = aplicarFiltros(
    supabase.from("ocorrencias").select(SELECT_DA_LISTA, { count: "exact" }),
    filtros,
    true,
    restricoes,
  )
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const [{ data, count, error }, { linhas: statusDoFiltro }] = await Promise.all([
    lista as Promise<{ data: LinhaDoBanco[] | null; count: number | null; error: unknown }>,
    buscarEmPaginas<{ status: string }>((de, ate) =>
      aplicarFiltros(
        supabase.from("ocorrencias").select("status, sites!inner ( grupo_site_id )"),
        filtros,
        false,
        restricoes,
      )
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

/**
 * Teto do Quadro e das exportacoes. O Painel do sistema de referencia abre
 * com algumas centenas; passar disto e sinal para estreitar o periodo, e a
 * tela diz que cortou em vez de fingir que mostrou tudo.
 */
export const TETO_SEM_PAGINACAO = 1000;

export type TodasAsLinhas = {
  linhas: LinhaDoPainel[];
  cortado: boolean;
};

/** Todas as linhas do filtro, sem paginar: Quadro e exportacoes. */
export async function getTodasAsLinhas(filtros: Filtros, teto: number = TETO_SEM_PAGINACAO): Promise<TodasAsLinhas> {
  const supabase = await createClient();
  const restricoes = await resolverRestricoes(supabase, filtros);
  const { linhas, atingiuTeto } = await buscarEmPaginas<LinhaDoBanco>(
    (de, ate) =>
      aplicarFiltros(supabase.from("ocorrencias").select(SELECT_DA_LISTA), filtros, true, restricoes)
        .order("criado_em", { ascending: false })
        .order("id", { ascending: false })
        .range(de, ate),
    teto,
  );
  return { linhas: linhas.map(paraLinha), cortado: atingiuTeto };
}

/** Uma linha de "Exportar Analises": o andamento com a ocorrencia dele. */
export type AnaliseExportada = {
  numeroAno: string;
  site: string;
  evento: string;
  status: string;
  criadoEm: string;
  tipo: string;
  tipoDeAnalise: string;
  classificacao: string;
  autor: string;
  responsavel: string;
  grupo: string;
  texto: string;
};

type AndamentoParaExportar = {
  id: number;
  ocorrencia_id: number;
  tipo: string;
  criado_em: string;
  texto: string;
  autor_id: string | null;
  responsavel_id: string | null;
  tipos_de_analise: { nome: string } | null;
  tipos_de_classificacao: { nome: string } | null;
  grupos_usuarios: { nome: string } | null;
};

/** Os andamentos (analises e finalizacoes) das ocorrencias do filtro. */
export async function getAnalisesDoFiltro(filtros: Filtros): Promise<{ analises: AnaliseExportada[]; cortado: boolean }> {
  const { linhas, cortado } = await getTodasAsLinhas(filtros);
  if (linhas.length === 0) return { analises: [], cortado };

  const supabase = await createClient();
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const { linhas: andamentos } = await buscarEmPaginas<AndamentoParaExportar>((de, ate) =>
    supabase
      .from("ocorrencia_andamentos")
      .select(
        `id, ocorrencia_id, tipo, criado_em, texto, autor_id, responsavel_id,
         tipos_de_analise ( nome ), tipos_de_classificacao ( nome ), grupos_usuarios ( nome )`,
      )
      .in("ocorrencia_id", [...porId.keys()])
      .order("id")
      .range(de, ate),
  );

  const pessoas = [
    ...new Set(andamentos.flatMap((a) => [a.autor_id, a.responsavel_id]).filter((v): v is string => Boolean(v))),
  ];
  const nomes = new Map<string, string>();
  if (pessoas.length > 0) {
    const { data } = await supabase.from("profiles").select("id, nome_completo").in("id", pessoas);
    for (const p of data ?? []) nomes.set(p.id, p.nome_completo ?? "");
  }
  const nomeDe = (uuid: string | null) => (uuid ? (nomes.get(uuid) ?? "") : "");

  return { cortado, analises: ordenarAnalises(linhas, andamentos).map((a) => {
    const o = porId.get(a.ocorrencia_id)!;
    return {
      numeroAno: o.numeroAno,
      site: o.siteNiveis.join(" > "),
      evento: o.evento,
      status: rotuloDoStatus(o.status),
      criadoEm: a.criado_em,
      tipo: a.tipo === "FINALIZACAO" ? "Finalização" : "Análise",
      tipoDeAnalise: a.tipos_de_analise?.nome ?? "",
      classificacao: a.tipos_de_classificacao?.nome ?? "",
      autor: nomeDe(a.autor_id),
      responsavel: nomeDe(a.responsavel_id),
      grupo: a.grupos_usuarios?.nome ?? "",
      texto: a.texto,
    };
  }) };
}

/**
 * Na ordem da lista (ocorrencia mais recente primeiro) e, dentro de cada
 * ocorrencia, na ordem em que os andamentos aconteceram. Pura.
 */
export function ordenarAnalises<A extends { id: number; ocorrencia_id: number; criado_em: string }>(
  linhas: { id: number }[],
  andamentos: A[],
): A[] {
  const posicao = new Map(linhas.map((l, i) => [l.id, i]));
  return [...andamentos]
    .filter((a) => posicao.has(a.ocorrencia_id))
    .sort(
      (a, b) =>
        posicao.get(a.ocorrencia_id)! - posicao.get(b.ocorrencia_id)! ||
        a.criado_em.localeCompare(b.criado_em) ||
        a.id - b.id,
    );
}

/** Contagem por status, na ordem de `STATUS`, so dos que aparecem. Pura. */
export function montarResumo(linhas: { status: string }[]): { status: string; quantidade: number }[] {
  const contagem = new Map<string, number>();
  for (const { status } of linhas) contagem.set(status, (contagem.get(status) ?? 0) + 1);
  return STATUS.filter((s) => contagem.has(s.value)).map((s) => ({ status: s.value, quantidade: contagem.get(s.value)! }));
}

export type OpcoesFiltros = {
  sites: Opcao[];
  eventos: Opcao[];
  grupos: Opcao[];
  usuarios: Opcao[];
  checklists: Opcao[];
  tiposDeAnalise: Opcao[];
  gruposDeUsuarios: Opcao[];
};

/** Sem cache: `sites` e `profiles` sao recortados por RLS conforme quem pede.
 * Tipos de analise so a gestao le (0064): para os demais a lista vem vazia. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();
  const [sites, eventos, grupos, usuarios, checklists, tiposDeAnalise, gruposDeUsuarios] = await Promise.all([
    supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
    supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_sites").select("id, nome").order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
    supabase.from("modelos_checklist").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("tipos_de_analise").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
  ]);

  return {
    sites: ((sites.data ?? []) as unknown as { id: number; nome: string; grupos_sites: { nome: string } | null }[]).map(
      (s) => ({ value: String(s.id), label: s.grupos_sites?.nome ? `${s.grupos_sites.nome} - ${s.nome}` : s.nome }),
    ),
    eventos: (eventos.data ?? []).map((e) => ({ value: String(e.id), label: e.nome })),
    grupos: (grupos.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
    usuarios: (usuarios.data ?? []).map((u) => ({ value: String(u.id), label: u.nome_completo ?? "" })),
    checklists: (checklists.data ?? []).map((c) => ({ value: String(c.id), label: c.nome })),
    tiposDeAnalise: (tiposDeAnalise.data ?? []).map((t) => ({ value: String(t.id), label: t.nome })),
    gruposDeUsuarios: (gruposDeUsuarios.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
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

/** Uma linha de "E-mails Enviados" (fila da 0065). */
export type EmailDaOcorrencia = {
  id: number;
  destinatario: string;
  motivo: string;
  status: string;
  criadoEm: string;
  enviadoEm: string | null;
  /** Quem mandou pelo "Enviar Evento" (0081); vazio nas automaticas. */
  remetente: string;
};

export type OcorrenciaDetalhe = LinhaDoPainel & {
  /** Nulo na ocorrencia registrada a mao (0072). */
  checklistId: number | null;
  site: string;
  subtipo: string;
  /** A do registro manual; senao, a da analise mais recente que classificou. */
  classificacao: string;
  fotos: number[];
  /** Arquivos enviados no Registrar Evento, fora de qualquer andamento. */
  arquivosDaAbertura: AnexoDoAndamento[];
  andamentos: AndamentoDaOcorrencia[];
  emails: EmailDaOcorrencia[];
};

const MOTIVO_DO_EMAIL: Record<string, string> = {
  ABERTURA: "Abertura",
  ANALISE: "Análise",
  FINALIZACAO: "Finalização",
  ENVIO: "Envio manual",
};

export function rotuloDoMotivoDoEmail(motivo: string): string {
  return MOTIVO_DO_EMAIL[motivo] ?? motivo;
}

/**
 * Situacao do e-mail para quem le o detalhe. "Na fila" cobre o PENDENTE e o
 * ENVIANDO: a diferenca e de segundos e nao muda o que a pessoa faz.
 */
export function rotuloDaSituacaoDoEmail(status: string): string {
  if (status === "ENVIADO") return "Enviado";
  if (status === "FALHOU") return "Falhou";
  if (status === "DESCARTADO") return "Não enviado";
  return "Na fila";
}

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

  const [{ data: fotos }, { data: andamentos }, { data: emails }, { data: daAbertura }] = await Promise.all([
    bruto.checklist_id === null
      ? Promise.resolve({ data: [] as { id: number }[] })
      : supabase.from("checklist_fotos").select("id").eq("checklist_id", bruto.checklist_id).order("id"),
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
    supabase
      .from("ocorrencia_emails")
      .select("id, destinatario, motivo, status, criado_em, enviado_em, enviado_por")
      .eq("ocorrencia_id", id)
      .order("id", { ascending: true }),
    supabase
      .from("ocorrencia_arquivos")
      .select("id, nome_original")
      .eq("ocorrencia_id", id)
      .is("andamento_id", null)
      .order("id", { ascending: true }),
  ]);

  const doBanco = (andamentos ?? []) as unknown as AndamentoDoBanco[];

  // Nomes das pessoas citadas. O RLS de `profiles` decide quem aparece: a
  // gestao ve todo mundo, o INSPETOR so a si mesmo -- o resto vira vazio.
  const ids = Array.from(
    new Set(
      [
        ...doBanco.flatMap((a) => [a.autor_id, a.responsavel_id, ...a.apoio, ...a.avisar]),
        ...(emails ?? []).map((e) => e.enviado_por),
      ].filter((v): v is string => Boolean(v)),
    ),
  );
  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const { data: perfis } = await supabase.from("profiles").select("id, nome_completo").in("id", ids);
    for (const perfil of perfis ?? []) nomes.set(perfil.id, perfil.nome_completo ?? "");
  }
  const nomeDe = (uuid: string | null) => (uuid ? (nomes.get(uuid) ?? "") : "");

  const classificadas = doBanco.filter((a) => a.tipos_de_classificacao !== null);

  return {
    ...linha,
    checklistId: bruto.checklist_id,
    site: bruto.sites?.nome ?? "",
    subtipo: bruto.subevento?.nome ?? "",
    classificacao:
      classificadas.at(-1)?.tipos_de_classificacao?.nome ?? bruto.tipos_de_classificacao?.nome ?? "",
    fotos: (fotos ?? []).map((f) => f.id),
    arquivosDaAbertura: (daAbertura ?? []).map((a) => ({ id: a.id, nome: a.nome_original })),
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
    emails: (emails ?? []).map((e) => ({
      id: e.id,
      destinatario: e.destinatario,
      motivo: e.motivo,
      status: e.status,
      criadoEm: e.criado_em,
      enviadoEm: e.enviado_em,
      remetente: nomeDe(e.enviado_por),
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
