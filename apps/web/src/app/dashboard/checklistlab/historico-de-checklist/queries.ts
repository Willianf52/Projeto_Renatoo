import {
  notaDoChecklist,
  rotuloDaResposta as rotuloDaRespostaPorTipo,
  tipoDeResposta,
  type RespostaDoChecklist as ValorDaResposta,
  type TipoDeResposta,
} from "@projeto-renatoo/shared";
import { dataValida, fimExclusivoDoFiltro, formatarDataHora, FUSO_DO_PROJETO, inicioDoFiltro } from "@/lib/data-hora";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas, TETO_DE_AGREGACAO } from "@/lib/supabase/query-helpers";
import { filtroDeId, filtroDeUuid, idNaUrl } from "@/lib/id-na-url";

export const PAGE_SIZE = 25;

/**
 * Teto de checklists buscados numa consulta. Menor que o `TETO_DE_AGREGACAO`
 * padrao (100 mil) de proposito: `checklists_visita` tem no maximo uma linha
 * por visita (constraint `checklists_visita_visita_unica`, 0042), entao um
 * filtro que passe de 10 mil ja e "o historico inteiro", nao um recorte que
 * alguem va ler.
 */
export const TETO_DO_HISTORICO = 10_000;

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

/**
 * Le um segmento `[id]` da rota como inteiro positivo.
 *
 * `/historico-de-checklist/abc` casa com a rota igual: sem esta guarda viraria
 * uma consulta com NaN e um erro do Postgres em vez de um 404 -- mesma
 * checagem que `perguntas/[id]/editar/page.tsx` faz inline. Aqui e funcao
 * porque quatro pontos precisam dela (a tela e as duas rotas de midia, esta
 * ultima com dois segmentos).
 */
export function idValido(valor: string): number | null {
  // `idNaUrl`, e nao mais `Number.isInteger`: este aceitava
  // `99999999999999999999`, que estoura o bigint e virava pagina de erro
  // em vez de 404. Ver `lib/id-na-url.ts`.
  return idNaUrl(valor);
}

/** Todos os valores de um parametro repetido (`site=1&site=2`), sem vazios. */
export function todos(valor: string | string[] | undefined): string[] {
  return (Array.isArray(valor) ? valor : valor ? [valor] : []).filter((v) => v.length > 0);
}

/**
 * Querystring com todos os valores de cada parametro, menos os de `sem`. Os
 * filtros de selecao multipla repetem o nome (`site=1&site=2`), e `primeiro`
 * jogaria fora tudo depois do primeiro -- nos links de pagina, de exportacao e
 * do detalhe, isso mudaria o filtro sem ninguem perceber.
 */
export function querystringDe(params: SearchParams, sem: readonly string[] = []): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (sem.includes(chave)) continue;
    for (const v of todos(valor)) query.append(chave, v);
  }
  return query.toString();
}

/** Os parametros de uma URL no formato de `searchParams` do App Router, com
 * os repetidos em lista. As rotas de exportar leem por aqui: o
 * `Object.fromEntries` guardaria so o ultimo valor de cada filtro multiplo. */
export function paramsDaUrl(url: URLSearchParams): SearchParams {
  const params: SearchParams = {};
  for (const chave of new Set(url.keys())) {
    const valores = url.getAll(chave);
    params[chave] = valores.length > 1 ? valores : valores[0];
  }
  return params;
}

/** Hoje no fuso do projeto, em AAAA-MM-DD. */
export function hojeNoFuso(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_DO_PROJETO }).format(agora);
}

/**
 * Como o sistema de referencia, a tela abre com o periodo de hoje a hoje ja
 * preenchido. So na primeira abertura (nenhum filtro na URL): quem limpou as
 * datas e filtrou de proposito continua vendo o periodo inteiro. `pagina` e
 * `salvo` nao contam como filtro.
 */
export function comPadroesDaTela(params: SearchParams, hoje: string = hojeNoFuso()): SearchParams {
  const temFiltro = Object.keys(params).some((chave) => chave !== "pagina" && chave !== "salvo");
  return temFiltro ? params : { ...params, data_inicial: hoje, data_final: hoje };
}

/**
 * Que data o periodo recorta -- as quatro do sistema de referencia. O sistema
 * novo nao tem agenda: a "Planejada" e o "Inicio" sao a abertura da visita, e o
 * "Termino" e a "Finalizacao" sao o envio do checklist, do mesmo jeito que a
 * coluna Datas mostra.
 */
export type CampoDeData = "planejada" | "inicio" | "termino" | "finalizacao";

export type Filtros = {
  campoData: CampoDeData;
  dataInicial?: string;
  dataFinal?: string;
  numeroAno?: string;
  /** Ids dos modelos marcados no filtro "Checklists" (0061). */
  modelos: string[];
  /** "agenda" | "avulso". */
  origem?: string;
  ordem: "recentes" | "antigos";
  sites: string[];
  gruposSites: string[];
  gruposUsuarios: string[];
  responsaveis: string[];
  /** "no_prazo" | "atrasado" | "antecipado" -- ver `filtrosSemResultado`. */
  situacao?: string;
  /** Um dos valores de `CONCLUSAO_OPCOES`. */
  conclusao?: string;
  atividade?: string;
  notaMinima?: number;
  notaMaxima?: number;
  /** "ativos" | "inativos". */
  status?: string;
  busca?: string;
  buscaRespostas?: string;
};

export const CAMPO_DE_DATA_OPCOES = [
  { value: "planejada", label: "Data Planejada" },
  { value: "inicio", label: "Data Início" },
  { value: "termino", label: "Data Término" },
  { value: "finalizacao", label: "Data Finalização" },
];

/**
 * Os dois valores do check `checklists_visita_tipo_check` (0042).
 *
 * Exportados porque a tela de detalhe tambem decide por eles. Antes as
 * comparacoes eram contra o ROTULO ("Corretiva"), e isso era uma armadilha:
 * renomear o texto que aparece na coluna Checklist faria os filtros de
 * Situacao e Conclusao pararem de reconhecer a corretiva -- sem erro de
 * compilacao, sem teste vermelho, so resultado errado.
 */
export const TIPO_CORRETIVA = "CORRETIVA";
export const TIPO_CONSULTORIA = "CONSULTORIA";

export const ORIGEM_OPCOES = [
  { value: "agenda", label: "Agenda" },
  { value: "avulso", label: "Avulso" },
];

/** Prazo em relacao a agenda, como no sistema de referencia. Sem agenda no
 * sistema novo, todo checklist e "No prazo" -- e o que a referencia mostra no
 * checklist avulso. */
export const SITUACAO_OPCOES = [
  { value: "no_prazo", label: "No prazo" },
  { value: "atrasado", label: "Atrasado" },
  { value: "antecipado", label: "Antecipado" },
];

export const SITUACAO_DA_LISTA = "No prazo";

/** As oito do sistema de referencia. So "Incompleto" e "Finalizado" existem no
 * sistema novo (nao ha agenda, autorizacao nem aprovacao); as demais ficam na
 * lista para a tela ser a mesma, e nao acham nada. */
export const CONCLUSAO_OPCOES = [
  { value: "agendado", label: "Agendado" },
  { value: "incompleto", label: "Incompleto" },
  { value: "aguardando_autorizacao", label: "Aguardando Autorização" },
  { value: "finalizado", label: "Finalizado" },
  { value: "aprovado", label: "Aprovado" },
  { value: "reprovado", label: "Reprovado" },
  { value: "nao_realizado", label: "Não Realizado" },
  { value: "cancelado", label: "Cancelado" },
];

export const STATUS_OPCOES = [
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
];

/** O select "Atividade" da referencia nao tem opcao nenhuma para esta empresa:
 * ele aparece, vazio, do mesmo jeito. */
export const ATIVIDADE_OPCOES: { value: string; label: string }[] = [];

function campoDeData(valor: string | undefined): CampoDeData {
  // "envio" e "visita" sao os valores de antes de 18/10/2026: link salvo
  // continua abrindo no mesmo recorte.
  if (valor === "inicio" || valor === "termino" || valor === "finalizacao" || valor === "planejada") return valor;
  if (valor === "envio") return "finalizacao";
  if (valor === "visita") return "inicio";
  return "planejada";
}

function nota(valor: string | undefined): number | undefined {
  if (valor === undefined || valor.trim() === "") return undefined;
  const numero = Number(valor.replace(",", "."));
  return Number.isFinite(numero) ? numero : undefined;
}

/**
 * Le os filtros da querystring. Exportada (e nao so usada por `page.tsx`)
 * para as rotas de exportar lerem exatamente os mesmos filtros da listagem,
 * sem duplicar o mapeamento campo a campo -- mesmo arranjo de
 * `coletas-importadas/queries.ts`.
 *
 * Os de selecao multipla sao peneirados valor a valor: vao para um `.in()` em
 * coluna bigint ou uuid, e um valor fora do tipo (link editado, colado com
 * erro) faria o Postgres recusar a consulta e a tela inteira cair.
 */
export function extrairFiltros(params: SearchParams): Filtros {
  const ordem = primeiro(params.ordem);
  const ids = (chave: string) => todos(params[chave]).flatMap((v) => filtroDeId(v) ?? []);

  return {
    campoData: campoDeData(primeiro(params.campo_data)),
    dataInicial: dataValida(primeiro(params.data_inicial)),
    dataFinal: dataValida(primeiro(params.data_final)),
    numeroAno: primeiro(params.numero_ano),
    modelos: ids("modelo"),
    origem: primeiro(params.origem),
    ordem: ordem === "antigos" ? "antigos" : "recentes",
    sites: ids("site"),
    gruposSites: ids("grupo_site"),
    gruposUsuarios: ids("grupo_usuario"),
    responsaveis: todos(params.responsavel).flatMap((v) => filtroDeUuid(v) ?? []),
    situacao: primeiro(params.situacao),
    conclusao: primeiro(params.conclusao),
    atividade: primeiro(params.atividade),
    notaMinima: nota(primeiro(params.nota_minima)),
    notaMaxima: nota(primeiro(params.nota_maxima)),
    status: primeiro(params.status),
    busca: primeiro(params.busca),
    buscaRespostas: primeiro(params.busca_respostas),
  };
}

export type Opcao = { value: string; label: string };

export type OpcoesFiltros = {
  modelos: Opcao[];
  sites: Opcao[];
  gruposSites: Opcao[];
  gruposUsuarios: Opcao[];
  responsaveis: Opcao[];
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
 * Listas para os selects de filtro. Sem cache de processo (diferente de
 * Coletas Importadas): as quatro sao recortadas por RLS conforme quem pede
 * (`sites`/`grupos_sites` por `pode_ver_grupo_site` na 0014, `profiles` por
 * `pode_ver_toda_operacao` na 0006), e guardar resultado recortado entre
 * usuarios vazaria a lista de um cliente para outro.
 */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();

  const [modelos, sites, gruposSites, gruposUsuarios, responsaveis] = await Promise.all([
    // Inativos tambem: o historico tem checklist respondido em modelo que foi
    // desligado depois, e ele precisa continuar filtravel.
    supabase.from("modelos_checklist").select("id, nome").order("nome"),
    supabase.from("sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
  ]);

  return {
    modelos: toOptions(modelos.data, "id", "nome"),
    sites: toOptions(sites.data, "id", "nome"),
    gruposSites: toOptions(gruposSites.data, "id", "nome"),
    gruposUsuarios: toOptions(gruposUsuarios.data, "id", "nome"),
    responsaveis: toOptions(responsaveis.data, "id", "nome_completo"),
  };
}

/** Linha crua do PostgREST, antes de derivar situacao/conclusao/nota. */
export type ChecklistBruto = {
  id: number;
  /** Numero/Ano do checklist (0074): dado pelo banco, recomeca a cada ano. */
  numero: number;
  ano: number;
  tipo: string;
  motivo: string | null;
  criado_em: string;
  /** Nulo na CORRETIVA (check `checklists_visita_modelo_por_tipo`, 0061). */
  modelo_id: number | null;
  modelos_checklist: { nome: string } | null;
  visitas: {
    criado_em: string;
    /** So na listagem: o link "Visualizar Inspecao" filtra as coletas dele. */
    funcionario_id?: string | null;
    motivos_visita: { nome: string } | null;
    profiles: { nome_completo: string | null } | null;
    /** `id` e `site_superior_id` so na listagem, para o caminho do site. */
    sites: { nome: string; id?: number; site_superior_id?: number | null } | null;
  } | null;
  checklist_respostas: {
    resposta: string;
    observacao: string | null;
    /** O tipo decide se o "NAO" e nao conformidade (0061). */
    perguntas_checklist: { tipo_resposta: string } | null;
  }[];
};

export type HistoricoLinha = {
  id: number;
  /** Valor cru da coluna `tipo` -- e por ele que se DECIDE. O `checklist`
   * abaixo e o mesmo dado em texto de tela, e serve so para EXIBIR. */
  tipo: string;
  numeroAno: string;
  /** "Consultoria" | "Corretiva" -- o `tipo` em capitalizacao de tela. */
  checklist: string;
  /** Nome do modelo respondido; vazio na corretiva. */
  modelo: string;
  /** Id do modelo respondido; nulo na corretiva. Separa as planilhas de
   * respostas, uma por modelo, como no antigo. */
  modeloId: number | null;
  enviadoEm: string;
  /** `visitas.criado_em`: a abertura da visita (Planejada e Inicio na coluna Datas). */
  inicioEm: string;
  responsavel: string;
  responsavelId: string | null;
  site: string;
  siteId: number | null;
  /** "UP Serviços → Site", pelos sites superiores (`site_superior_id`). Sem
   * superior, so o nome. Preenchido em `getHistorico`. */
  caminhoDoSite: string;
  /** Na CORRETIVA e o motivo digitado pelo inspetor; na CONSULTORIA nao ha
   * motivo (constraint `checklists_visita_motivo_por_tipo`, 0042) e cai no
   * motivo da visita, quando a visita tem um. */
  motivo: string;
  respondidas: number;
  totalPerguntas: number;
  naoConformidades: number;
  /** `notaDoChecklist` do shared: percentual de Conforme entre as perguntas
   * de conformidade, sem "Nao se aplica" nem Sim/Nao. `null` sem o que medir. */
  nota: number | null;
};


/**
 * Deriva as tres colunas que a tela mostra e que nao existem como coluna no
 * banco.
 *
 * `totalPerguntas` e a contagem de perguntas ATIVAS hoje DO MODELO respondido,
 * nao a de quando o checklist foi enviado -- o banco nao guarda a segunda (a
 * 0042 grava resposta por `pergunta_id`, sem versionar o questionario).
 * Cadastrar uma pergunta nova num modelo, portanto, faz checklists antigos
 * dele passarem a aparecer como "Incompleto". E o comportamento correto para
 * quem quer saber o que falta responder hoje, e o unico calculavel.
 *
 * Nao conformidade e so o "Nao conforme": o "Nao" de uma pergunta Sim/Nao
 * ("Duvidas com o RH?") nao reprova o posto (0061). A nota segue a mesma regra,
 * em `notaDoChecklist`, a funcao que o app tambem usa.
 */
/** "00018/2026": cinco digitos com zeros a esquerda, como no sistema de referencia. */
export function formatarNumeroAno(numero: number, ano: number): string {
  return `${String(numero).padStart(5, "0")}/${ano}`;
}

export function montarLinha(bruto: ChecklistBruto, totalPerguntas: number): HistoricoLinha {
  const respostas = bruto.checklist_respostas ?? [];
  const comTipo = respostas
    .filter((r): r is typeof r & { resposta: ValorDaResposta } => ["SIM", "NAO", "NA"].includes(r.resposta))
    .map((r) => ({ tipo: tipoDeResposta(r.perguntas_checklist?.tipo_resposta), resposta: r.resposta }));
  const nao = comTipo.filter((r) => r.tipo !== "SN" && r.resposta === "NAO").length;

  const motivoDaVisita = bruto.visitas?.motivos_visita?.nome ?? "";

  return {
    id: bruto.id,
    tipo: bruto.tipo,
    numeroAno: formatarNumeroAno(bruto.numero, bruto.ano),
    checklist: bruto.tipo === TIPO_CORRETIVA ? "Corretiva" : "Consultoria",
    modelo: bruto.modelos_checklist?.nome ?? "",
    modeloId: bruto.modelo_id,
    enviadoEm: bruto.criado_em,
    inicioEm: bruto.visitas?.criado_em ?? bruto.criado_em,
    responsavel: bruto.visitas?.profiles?.nome_completo ?? "",
    responsavelId: bruto.visitas?.funcionario_id ?? null,
    site: bruto.visitas?.sites?.nome ?? "",
    siteId: bruto.visitas?.sites?.id ?? null,
    caminhoDoSite: bruto.visitas?.sites?.nome ?? "",
    motivo: bruto.motivo ?? motivoDaVisita,
    respondidas: respostas.length,
    totalPerguntas,
    naoConformidades: nao,
    nota: notaDoChecklist(comTipo),
  };
}

/**
 * A CORRETIVA nao responde questionario nenhum (0042: `motivo` obrigatorio,
 * respostas ausentes), entao "faltam N perguntas" nao se aplica a ela -- e
 * ela conta como concluida, e nao como incompleta, para nao poluir o filtro
 * de pendencia com linhas que nunca terao resposta.
 */
export function estaConcluido(linha: HistoricoLinha): boolean {
  return linha.tipo === TIPO_CORRETIVA || linha.respondidas >= linha.totalPerguntas;
}

export function textoDaConclusao(linha: HistoricoLinha): string {
  if (linha.tipo === TIPO_CORRETIVA) return "Concluído";
  return estaConcluido(linha)
    ? `Concluído (${linha.respondidas}/${linha.totalPerguntas})`
    : `Incompleto (${linha.respondidas}/${linha.totalPerguntas})`;
}

/**
 * Situacao pela leitura das respostas. A CORRETIVA fica de fora das duas
 * classificacoes de proposito: ela nao tem questionario para estar conforme
 * ou nao conforme, e enquadra-la em qualquer uma das duas seria inventar um
 * julgamento que o inspetor nao deu.
 */
export function textoDaSituacao(linha: HistoricoLinha): string {
  if (linha.tipo === TIPO_CORRETIVA) return "Corretiva";
  if (linha.naoConformidades > 0) {
    return `${linha.naoConformidades} não ${linha.naoConformidades === 1 ? "conformidade" : "conformidades"}`;
  }
  return linha.respondidas > 0 ? "Conforme" : "Sem respostas";
}

/**
 * Os filtros da referencia que nao acham nada no sistema novo, decididos aqui,
 * sem ir ao banco:
 *   - Situacao: "No prazo" e o unico valor (nao ha agenda para estar atrasado
 *     ou antecipado) -- igual a referencia filtrando checklists avulsos;
 *   - Conclusao: so "Finalizado" e "Incompleto" existem aqui; as outras seis da
 *     referencia dependem de agenda ou aprovacao;
 *   - Origem Agenda, Atividade e Status Inativos: nao ha agenda, atividade nem
 *     checklist inativado;
 *   - Numero/Ano que nao e numero.
 * A lista volta vazia de proposito: ignorar o filtro mostraria tudo como se
 * tivesse achado.
 */
export function filtrosSemResultado(filtros: Filtros): boolean {
  if (filtros.situacao && filtros.situacao !== "no_prazo") return true;
  if (filtros.conclusao && filtros.conclusao !== "finalizado" && filtros.conclusao !== "incompleto") return true;
  if (filtros.origem === "agenda" || filtros.atividade || filtros.status === "inativos") return true;
  if (filtros.numeroAno && !interpretarNumeroAno(filtros.numeroAno)) return true;
  return false;
}

/**
 * O filtro "Numero/Ano" aceita "35/2026" (aquele checklist) ou so "35" (o 35
 * de qualquer ano). Espacos em volta da barra sao tolerados; qualquer outra
 * coisa devolve `null`.
 */
export function interpretarNumeroAno(texto: string): { numero: number; ano: number | null } | null {
  const achado = /^(\d{1,9})\s*(?:\/\s*(\d{4}))?$/.exec(texto.trim());
  if (!achado) return null;
  return { numero: Number(achado[1]), ano: achado[2] ? Number(achado[2]) : null };
}

/**
 * O `p_filtros` de `historico_de_checklist` (0079). As regras de cada filtro
 * (Conclusao, Nota, as duas buscas, o caminho do site) moram na funcao do
 * banco; aqui so os nomes e as datas, que viram instantes no fuso do projeto
 * como nas outras telas -- o fim e exclusivo, ver `fimExclusivoDoFiltro`.
 *
 * O periodo recorta a abertura da visita ("Planejada" e "Inicio") ou o envio
 * do checklist ("Termino" e "Finalizacao"), como a coluna Datas mostra.
 */
export function filtrosParaOBanco(filtros: Filtros): Record<string, string | number | string[] | null> {
  const procurado = filtros.numeroAno ? interpretarNumeroAno(filtros.numeroAno) : null;
  return {
    campo_data: filtros.campoData === "planejada" || filtros.campoData === "inicio" ? "visita" : "checklist",
    inicio: filtros.dataInicial ? inicioDoFiltro(filtros.dataInicial) : null,
    fim: filtros.dataFinal ? fimExclusivoDoFiltro(filtros.dataFinal) : null,
    numero: procurado?.numero ?? null,
    ano: procurado?.ano ?? null,
    modelos: filtros.modelos,
    sites: filtros.sites,
    grupos_sites: filtros.gruposSites,
    grupos_usuarios: filtros.gruposUsuarios,
    responsaveis: filtros.responsaveis,
    conclusao: filtros.conclusao ?? null,
    nota_minima: filtros.notaMinima ?? null,
    nota_maxima: filtros.notaMaxima ?? null,
    busca: filtros.busca ?? null,
    busca_respostas: filtros.buscaRespostas ?? null,
    ordem: filtros.ordem,
  };
}

export type Historico = {
  /** So a pagina pedida, ou tudo ate o teto quando nao se pede pagina. */
  linhas: HistoricoLinha[];
  /** Quantos checklists o filtro acha, inteiro, mesmo quando so uma pagina veio. */
  total: number;
  /** A pagina devolvida: a pedida, ou a ultima quando a pedida passou do fim. */
  pagina: number;
  /** true quando, sem pagina, o filtro passou do teto: a lista esta incompleta. */
  truncado: boolean;
};

/**
 * Quantas perguntas ativas cada modelo tem hoje, por id do modelo.
 *
 * Era um `count` so, do cadastro inteiro -- certo enquanto havia uma lista
 * global, errado desde a 0061: um checklist de 12 perguntas apareceria
 * "Incompleto (12/900)". Traz so a coluna `modelo_id` das ativas e conta aqui;
 * `buscarEmPaginas` porque o cadastro importado passa das mil linhas do
 * `max_rows` do PostgREST, e o corte seria calado.
 */
async function contarPerguntasAtivasPorModelo(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<number, number>> {
  const { linhas } = await buscarEmPaginas<{ modelo_id: number }>(
    (de, ate) =>
      supabase
        .from("perguntas_checklist")
        .select("modelo_id")
        .eq("ativo", true)
        .order("id")
        .range(de, ate),
    TETO_DO_HISTORICO,
  );

  const porModelo = new Map<number, number>();
  for (const { modelo_id } of linhas) porModelo.set(modelo_id, (porModelo.get(modelo_id) ?? 0) + 1);
  return porModelo;
}

export type SiteDoCaminho = { nome: string; superior: number | null };

/** Todos os sites que quem pede enxerga (RLS), para montar os caminhos. */
async function carregarSites(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<number, SiteDoCaminho>> {
  const { linhas } = await buscarEmPaginas<{ id: number; nome: string; site_superior_id: number | null }>(
    (de, ate) => supabase.from("sites").select("id, nome, site_superior_id").order("id").range(de, ate),
    TETO_DO_HISTORICO,
  );
  return new Map(linhas.map((site) => [site.id, { nome: site.nome, superior: site.site_superior_id }]));
}

/** A arvore do "Visualizar": raizes (sem superior, ou com superior fora do que a pessoa enxerga) e seus
 * filhos, em ordem alfabetica. O `visitados` protege de ciclo no cadastro. */
export type NoDaArvore = { id: number; nome: string; filhos: NoDaArvore[] };

export function montarArvore(sites: ReadonlyMap<number, SiteDoCaminho>): NoDaArvore[] {
  const filhosDe = new Map<number | null, number[]>();
  for (const [id, site] of sites) {
    const pai = site.superior !== null && sites.has(site.superior) ? site.superior : null;
    filhosDe.set(pai, [...(filhosDe.get(pai) ?? []), id]);
  }

  const visitados = new Set<number>();
  const montar = (ids: number[]): NoDaArvore[] =>
    ids
      .filter((id) => !visitados.has(id))
      .map((id) => {
        visitados.add(id);
        return { id, nome: sites.get(id)!.nome, filhos: montar(filhosDe.get(id) ?? []) };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return montar(filhosDe.get(null) ?? []);
}

/** Os mesmos sites, para a arvore do "Visualizar" (cartao Site da referencia). */
export async function getSitesDaArvore(): Promise<Map<number, SiteDoCaminho>> {
  return carregarSites(await createClient());
}


/** O total que `montarLinha` recebe: o do modelo respondido, zero na corretiva. */
export function totalDoModelo(porModelo: Map<number, number>, modeloId: number | null): number {
  return modeloId === null ? 0 : (porModelo.get(modeloId) ?? 0);
}

/** Uma linha como `historico_de_checklist` (0079) devolve. */
export type LinhaDoBanco = {
  id: number;
  numero: number;
  ano: number;
  tipo: string;
  motivo: string | null;
  criado_em: string;
  modelo_id: number | null;
  modelo_nome: string | null;
  inicio_em: string | null;
  funcionario_id: string | null;
  responsavel: string | null;
  site_id: number | null;
  site_nome: string | null;
  /** "UP Serviços → Site", pelos sites superiores que quem pede enxerga. */
  caminho: string | null;
  motivo_da_visita: string | null;
  total_perguntas: number;
  respondidas: number;
  nao_conformidades: number;
  nota: number | null;
};

/** A linha da tela, a partir da do banco -- as mesmas colunas de `montarLinha`. */
export function paraLinhaDoHistorico(linha: LinhaDoBanco): HistoricoLinha {
  return {
    id: linha.id,
    tipo: linha.tipo,
    numeroAno: formatarNumeroAno(linha.numero, linha.ano),
    checklist: linha.tipo === TIPO_CORRETIVA ? "Corretiva" : "Consultoria",
    modelo: linha.modelo_nome ?? "",
    modeloId: linha.modelo_id,
    enviadoEm: linha.criado_em,
    inicioEm: linha.inicio_em ?? linha.criado_em,
    responsavel: linha.responsavel ?? "",
    responsavelId: linha.funcionario_id,
    site: linha.site_nome ?? "",
    siteId: linha.site_id,
    caminhoDoSite: linha.caminho || linha.site_nome || "",
    // Na corretiva, o motivo digitado; na consultoria, o da visita.
    motivo: linha.motivo ?? linha.motivo_da_visita ?? "",
    respondidas: linha.respondidas,
    totalPerguntas: linha.total_perguntas,
    naoConformidades: linha.nao_conformidades,
    nota: linha.nota,
  };
}

/**
 * O historico dentro do filtro, pela `historico_de_checklist` (0079), que
 * filtra, calcula Nota/Conclusao/caminho e pagina no banco.
 *
 * Com `pagina`: so aquela pagina de `PAGE_SIZE` e o total -- e o que a tela
 * pede. Uma pagina alem do fim (link antigo, filtro que encolheu) devolve a
 * ultima, com o numero dela em `pagina`.
 *
 * Sem `pagina`: tudo ate `TETO_DO_HISTORICO`, para as exportacoes; `truncado`
 * diz se o filtro achou mais do que isso.
 */
export async function getHistorico(filtros: Filtros, pagina?: number): Promise<Historico> {
  if (filtrosSemResultado(filtros)) return { linhas: [], total: 0, pagina: 1, truncado: false };

  const supabase = await createClient();
  const p_filtros = filtrosParaOBanco(filtros);

  const consultar = async (limite: number, deslocamento: number) => {
    const { data, error } = await supabase.rpc("historico_de_checklist", {
      p_filtros,
      p_limite: limite,
      p_deslocamento: deslocamento,
    });
    if (error) throw error;
    const resultado = data as unknown as { total: number; linhas: LinhaDoBanco[] };
    return { total: Number(resultado.total), linhas: resultado.linhas.map(paraLinhaDoHistorico) };
  };

  if (pagina === undefined) {
    const { total, linhas } = await consultar(TETO_DO_HISTORICO, 0);
    const truncado = total > TETO_DO_HISTORICO;
    if (truncado) {
      erro(
        gerarIdDeRequisicao(),
        `Histórico de Checklist: teto de ${TETO_DO_HISTORICO} checklists atingido; a exportação está incompleta.`,
      );
    }
    return { linhas, total, pagina: 1, truncado };
  }

  const pedida = Math.max(1, Math.floor(pagina));
  const primeira = await consultar(PAGE_SIZE, (pedida - 1) * PAGE_SIZE);
  const ultima = Math.max(1, Math.ceil(primeira.total / PAGE_SIZE));
  if (pedida <= ultima) return { ...primeira, pagina: pedida, truncado: false };
  // Filtro vazio: nao ha ultima pagina a buscar.
  if (primeira.total === 0) return { ...primeira, pagina: 1, truncado: false };

  const daUltima = await consultar(PAGE_SIZE, (ultima - 1) * PAGE_SIZE);
  return { ...daUltima, pagina: ultima, truncado: false };
}

export const TABLE_COLUMNS = [
  "ID",
  "Número/Ano",
  "Checklist",
  "Datas",
  "Responsável",
  "Site",
  "Agenda",
  "Situação",
  "Conclusão",
  "Nota",
  "Status",
];

/** O nome do modelo, como a coluna Checklist da referencia; a corretiva nao
 * tem modelo (0061) e fica com o tipo. */
export function nomeDoChecklist(linha: HistoricoLinha): string {
  return linha.modelo || linha.checklist;
}

/**
 * As cinco datas da coluna Datas, na ordem da referencia. Sem agenda, a
 * Planejada e a abertura da visita (como a referencia mostra no avulso); sem
 * hora separada de termino e de integracao, as tres ultimas sao o envio do
 * checklist.
 */
export function datasDaLinha(linha: HistoricoLinha): { rotulo: string; valor: string }[] {
  const inicio = formatarDataHoraComSegundos(linha.inicioEm);
  const envio = formatarDataHoraComSegundos(linha.enviadoEm);
  return [
    { rotulo: "Planejada", valor: inicio },
    { rotulo: "Início", valor: inicio },
    { rotulo: "Término", valor: envio },
    { rotulo: "Finalização", valor: envio },
    { rotulo: "Integração", valor: envio },
  ];
}

const FORMATO_COM_SEGUNDOS = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_DO_PROJETO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** "17/10/2026 07:53:38" -- a referencia mostra os segundos na coluna Datas. */
export function formatarDataHoraComSegundos(valor: string): string {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "" : FORMATO_COM_SEGUNDOS.format(data).replace(",", "");
}

/** "Finalizado" ou "Incompleto", o selo da coluna Conclusao. */
export function conclusaoDaLista(linha: HistoricoLinha): string {
  return estaConcluido(linha) ? "Finalizado" : "Incompleto";
}

/**
 * Colunas de texto de uma linha, na mesma ordem de `TABLE_COLUMNS`.
 * Reaproveitada pelas exportacoes de Excel/PDF para nao duplicar o mapeamento
 * campo a campo -- mesmo arranjo das demais telas.
 */
export function toTableRow(linha: HistoricoLinha): string[] {
  return [
    String(linha.id),
    linha.numeroAno,
    nomeDoChecklist(linha),
    datasDaLinha(linha)
      .map((data) => `${data.rotulo}: ${data.valor}`)
      .join("\n"),
    linha.responsavel,
    linha.caminhoDoSite,
    "-",
    SITUACAO_DA_LISTA,
    conclusaoDaLista(linha),
    linha.nota === null ? "" : String(linha.nota),
    "Ativo",
  ];
}

// ---------------------------------------------------------------------------
// Tela de detalhe
// ---------------------------------------------------------------------------

/**
 * Rotulo de tela de uma resposta, pelo tipo da pergunta -- `rotuloDaResposta`
 * do shared, o mesmo texto que o inspetor tocou no app (SIM e "Conforme" numa
 * pergunta de conformidade, "Sim" numa Sim/Nao). Valor fora do dominio cai
 * nele mesmo em vez de virar celula vazia, que esconderia um valor novo
 * entrando no banco sem a tela saber.
 */
export function rotuloDaResposta(tipo: TipoDeResposta, resposta: string): string {
  return ["SIM", "NAO", "NA"].includes(resposta)
    ? rotuloDaRespostaPorTipo(tipo, resposta as ValorDaResposta)
    : resposta;
}

export type RespostaDoChecklist = {
  perguntaId: number;
  /** `null` quando a pergunta foi apagada do cadastro -- impossivel hoje
   * (`on delete restrict`, 0042), mas a coluna vem de um join e o tipo
   * honesto e o que evita um `!` no meio da tela. */
  ordem: number | null;
  pergunta: string;
  /** Valor gravado (SIM/NAO/NA): e por ele que a tela decide a cor. */
  valor: string;
  tipo: TipoDeResposta;
  /** Ja traduzida por `rotuloDaResposta`. */
  resposta: string;
  observacao: string | null;
  /** As fotos desta pergunta (0061). */
  fotos: FotoDoChecklist[];
};

export type FotoDoChecklist = { id: number; criadoEm: string };

export type ChecklistDetalhe = {
  linha: HistoricoLinha;
  visitaId: number;
  /** `visitas.criado_em` -- quando a visita entrou no sistema, contra
   * `linha.enviadoEm`, que e quando o inspetor fechou o checklist. */
  registradoEm: string;
  /** Preenchido so na CORRETIVA (check `checklists_visita_motivo_por_tipo`). */
  motivoDaCorretiva: string | null;
  motivoDaVisita: string;
  respostas: RespostaDoChecklist[];
  /** So as gerais: as de pergunta vao em `respostas[].fotos`. */
  fotos: FotoDoChecklist[];
  temAssinatura: boolean;
  /** Quem de fato enviou (0059): o inspetor dono da visita ou um GESTOR que a
   * fechou por ele. `null` quando a conta foi apagada depois do envio. */
  enviadoPor: string | null;
};

/**
 * `Omit` do `checklist_respostas` antes de redeclara-lo: uma intersecao de
 * dois tipos de array (`A[] & B[]`) atrapalha a resolucao de `.map` mais
 * adiante -- aqui a lista e a mesma da listagem com colunas A MAIS, nao uma
 * segunda lista.
 */
type ChecklistDetalheBruto = Omit<ChecklistBruto, "checklist_respostas"> & {
  visita_id: number;
  assinatura_path: string | null;
  checklist_respostas: {
    resposta: string;
    observacao: string | null;
    pergunta_id: number;
    perguntas_checklist: { ordem: number; texto: string; tipo_resposta: string } | null;
  }[];
  checklist_fotos: { id: number; criado_em: string; pergunta_id: number | null }[];
  enviado_por_perfil: { nome_completo: string | null } | null;
};

/**
 * Sem `!inner` em `visitas` aqui, ao contrario da listagem: no detalhe a
 * consulta e por id, nao ha o que filtrar por coluna de visita, e o inner
 * existia justamente para viabilizar aqueles filtros.
 */
const SELECT_DO_DETALHE = `
  id, numero, ano, tipo, motivo, criado_em, visita_id, assinatura_path, modelo_id,
  modelos_checklist ( nome ),
  visitas (
    criado_em,
    motivos_visita ( nome ),
    profiles ( nome_completo ),
    sites ( id, nome )
  ),
  checklist_respostas (
    resposta, observacao, pergunta_id,
    perguntas_checklist ( ordem, texto, tipo_resposta )
  ),
  checklist_fotos ( id, criado_em, pergunta_id ),
  enviado_por_perfil:profiles!checklists_visita_enviado_por_fkey ( nome_completo )
`;

/**
 * Um checklist com tudo que a tela de detalhe mostra.
 *
 * `maybeSingle` e nao `single`: id inexistente -- ou fora do escopo de RLS de
 * quem pediu, que da no mesmo daqui -- e um 404 da tela, nao um erro do
 * Postgres subindo ate a fronteira de erro do App Router.
 */
export async function getChecklist(id: number): Promise<ChecklistDetalhe | null> {
  const supabase = await createClient();

  const [perguntasPorModelo, resultado] = await Promise.all([
    contarPerguntasAtivasPorModelo(supabase),
    supabase.from("checklists_visita").select(SELECT_DO_DETALHE).eq("id", id).maybeSingle(),
  ]);

  if (resultado.error) throw resultado.error;
  if (!resultado.data) return null;

  return montarDetalhe(resultado.data as unknown as ChecklistDetalheBruto, perguntasPorModelo);
}

/**
 * Quantos checklists o "Exportar PDF Unificado" junta num arquivo. No sistema
 * antigo o botao leva todos os ids do filtro; aqui ha teto porque cada
 * checklist traz respostas, fotos e assinatura, e uma pagina de impressao com
 * milhares deles trava o navegador antes de abrir o dialogo.
 */
export const TETO_DO_PDF_UNIFICADO = 100;

/** Ids por consulta no `.in()`: mantem a URL do PostgREST curta. */
const IDS_POR_CONSULTA = 100;

function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/**
 * O detalhe de varios checklists, na ordem dos `ids` recebidos (a da
 * listagem). Id que o RLS nao deixa ver simplesmente nao volta.
 */
export async function getChecklistsDetalhados(ids: readonly number[]): Promise<ChecklistDetalhe[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const [perguntasPorModelo, ...lotes] = await Promise.all([
    contarPerguntasAtivasPorModelo(supabase),
    ...emLotes(ids, IDS_POR_CONSULTA).map((lote) =>
      supabase.from("checklists_visita").select(SELECT_DO_DETALHE).in("id", lote),
    ),
  ]);

  const porId = new Map<number, ChecklistDetalhe>();
  for (const lote of lotes) {
    if (lote.error) throw lote.error;
    for (const bruto of (lote.data ?? []) as unknown as ChecklistDetalheBruto[]) {
      porId.set(bruto.id, montarDetalhe(bruto, perguntasPorModelo));
    }
  }

  return ids.flatMap((id) => porId.get(id) ?? []);
}

function montarDetalhe(bruto: ChecklistDetalheBruto, perguntasPorModelo: Map<number, number>): ChecklistDetalhe {
  const respostas = ordenarRespostas(bruto.checklist_respostas ?? [], bruto.checklist_fotos ?? []);
  const comResposta = new Set(respostas.map((resposta) => resposta.perguntaId));

  return {
    linha: montarLinha(bruto, totalDoModelo(perguntasPorModelo, bruto.modelo_id)),
    visitaId: bruto.visita_id,
    registradoEm: bruto.visitas?.criado_em ?? bruto.criado_em,
    motivoDaCorretiva: bruto.motivo,
    motivoDaVisita: bruto.visitas?.motivos_visita?.nome ?? "",
    respostas,
    // Foto de pergunta sem resposta na lista (nao deveria existir: o trigger
    // da 0061 exige pergunta do modelo, e o app so manda de respondida) entra
    // nas gerais -- sumir da tela seria pior que aparecer fora do lugar.
    fotos: (bruto.checklist_fotos ?? [])
      .filter((foto) => foto.pergunta_id === null || !comResposta.has(foto.pergunta_id))
      .map(paraFoto),
    temAssinatura: Boolean(bruto.assinatura_path),
    enviadoPor: bruto.enviado_por_perfil?.nome_completo ?? null,
  };
}

/**
 * Os campos do cabecalho de um checklist, na ordem da tela. Mora aqui, e nao
 * no `page.tsx` do detalhe, porque o PDF Unificado imprime o mesmo cabecalho:
 * duas listas escritas a mao se desencontrariam no primeiro campo novo.
 */
export function camposDoResumo(detalhe: ChecklistDetalhe): { rotulo: string; valor: string }[] {
  const { linha } = detalhe;

  return [
    { rotulo: "ID", valor: String(linha.id) },
    { rotulo: "Número/Ano", valor: linha.numeroAno },
    { rotulo: "Checklist", valor: linha.checklist },
    // Vazio na corretiva, que nao tem modelo (0061) -- a celula em branco e a
    // convencao da tela para "nao se aplica".
    { rotulo: "Modelo", valor: linha.modelo },
    { rotulo: "Site", valor: linha.site },
    { rotulo: "Responsável", valor: linha.responsavel },
    { rotulo: "Motivo da visita", valor: detalhe.motivoDaVisita },
    { rotulo: "Enviado em", valor: formatarDataHora(linha.enviadoEm) },
    // Pode nao ser o Responsavel: desde a 0059 um GESTOR fecha a visita de um
    // inspetor, e e isto que o relatorio precisa mostrar.
    { rotulo: "Enviado por", valor: detalhe.enviadoPor ?? "" },
    { rotulo: "Visita registrada em", valor: formatarDataHora(detalhe.registradoEm) },
    { rotulo: "Situação", valor: textoDaSituacao(linha) },
    { rotulo: "Conclusão", valor: textoDaConclusao(linha) },
    { rotulo: "Nota", valor: linha.nota === null ? "" : `${linha.nota}%` },
  ];
}

// ---------------------------------------------------------------------------
// Exportacoes no formato do sistema antigo (Excel, Respostas e PDF)
// ---------------------------------------------------------------------------
//
// Copiadas dos arquivos que o antigo exportou em 30/10/2026: o Excel e o de
// Respostas sao .xlsx (`lib/xlsx.ts`), e o PDF sai deitado. Dados que o
// sistema novo nao tem (aprovacao, agendamento, atividade) saem como no
// antigo, que os mostra vazios ou zerados.

/** As 17 colunas do "Exportar para Excel" do antigo, na mesma ordem. */
export const COLUNAS_DO_EXCEL = [
  "ID",
  "Número/Ano",
  "Checklist",
  "Data Planejada",
  "Data Início",
  "Data Término",
  "Data Finalização",
  "Data Aprovação",
  "Responsável",
  "Site",
  "Regional",
  "Situação",
  "Conclusão",
  "Nota",
  "Status",
  "Agendamento ID",
  "Atividade",
];

/** As 13 colunas do "Exportar para PDF" do antigo. */
export const COLUNAS_DO_PDF = [
  "Número/Ano",
  "Checklist",
  "Data Planejada",
  "Data Início",
  "Data Término",
  "Data Finalização",
  "Responsável",
  "Site",
  "Situação",
  "Conclusão",
  "Nota",
  "Status",
  "Atividade",
];

/** As quatro datas do antigo. Sem agenda, a Planejada e a abertura da visita;
 * sem hora de termino separada, Termino e Finalizacao sao o envio (mesma
 * regra de `datasDaLinha`). */
function datasDoAntigo(linha: HistoricoLinha) {
  const inicio = formatarDataHoraComSegundos(linha.inicioEm);
  const envio = formatarDataHoraComSegundos(linha.enviadoEm);
  return { planejada: inicio, inicio, termino: envio, finalizacao: envio };
}

/** Linha do Excel. A nota vai como o antigo a escreve ("100.0"). */
export function toLinhaDoExcel(linha: HistoricoLinha, regional: string): (string | number)[] {
  const datas = datasDoAntigo(linha);
  return [
    linha.id,
    linha.numeroAno,
    nomeDoChecklist(linha),
    datas.planejada,
    datas.inicio,
    datas.termino,
    datas.finalizacao,
    "",
    linha.responsavel,
    linha.site,
    regional,
    SITUACAO_DA_LISTA,
    conclusaoDaLista(linha),
    linha.nota === null ? "" : linha.nota.toFixed(1),
    "Ativo",
    "0",
    "",
  ];
}

/** Linha do PDF. Aqui a nota vai inteira, como no PDF do antigo ("100"). */
export function toLinhaDoPdf(linha: HistoricoLinha): string[] {
  const datas = datasDoAntigo(linha);
  return [
    linha.numeroAno,
    nomeDoChecklist(linha),
    datas.planejada,
    datas.inicio,
    datas.termino,
    datas.finalizacao,
    linha.responsavel,
    linha.site,
    SITUACAO_DA_LISTA,
    conclusaoDaLista(linha),
    linha.nota === null ? "" : String(linha.nota),
    "Ativo",
    "",
  ];
}

/**
 * Regional de cada site, para a coluna do Excel. A linha do historico (0079)
 * nao a traz, entao sai numa consulta a parte, pelos sites das linhas.
 */
export async function getRegionais(siteIds: readonly number[]): Promise<Map<number, string>> {
  const supabase = await createClient();
  const regionais = new Map<number, string>();
  for (const lote of emLotes([...new Set(siteIds)], IDS_POR_CONSULTA)) {
    const { data, error } = await supabase.from("sites").select("id, regional").in("id", lote);
    if (error) throw error;
    for (const site of (data ?? []) as { id: number; regional: string | null }[]) {
      regionais.set(site.id, site.regional ?? "");
    }
  }
  return regionais;
}

/** Os modelos que aparecem no filtro, com quantos checklists cada um tem -- a
 * lista de onde se escolhe a planilha de respostas, como a caixa do antigo. */
export function modelosDoHistorico(
  linhas: readonly HistoricoLinha[],
): { id: number; nome: string; total: number }[] {
  const porId = new Map<number, { id: number; nome: string; total: number }>();
  for (const linha of linhas) {
    if (linha.modeloId === null) continue;
    const atual = porId.get(linha.modeloId) ?? { id: linha.modeloId, nome: linha.modelo, total: 0 };
    atual.total += 1;
    porId.set(linha.modeloId, atual);
  }
  return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export type RespostaParaExportar = {
  checklist_id: number;
  pergunta_id: number;
  resposta: string;
  observacao: string | null;
};

export type PerguntaDoModelo = { id: number; ordem: number; texto: string; tipo_resposta: string };

/**
 * Monta a planilha de respostas de UM modelo, no formato do antigo: uma linha
 * por checklist e, para cada pergunta, uma coluna com a resposta seguida de
 * uma "Obs. Resposta". As perguntas seguem a `ordem` do modelo.
 *
 * O Numero/Ano aqui vai sem os zeros a esquerda ("2096/2026"), como o antigo
 * escreve nesta planilha -- no Excel e no PDF ele usa cinco digitos.
 */
export function planilhaDeRespostas(
  linhas: readonly HistoricoLinha[],
  perguntas: readonly PerguntaDoModelo[],
  respostas: readonly RespostaParaExportar[],
): { colunas: string[]; linhas: (string | number)[][] } {
  const ordenadas = [...perguntas].sort((a, b) => a.ordem - b.ordem);
  const colunas = [
    "ID",
    "Número/Ano",
    "Data Planejada",
    "Data Finalização",
    "Responsável",
    "Site",
    "Situação",
    "Conclusão",
    "Observações",
    ...ordenadas.flatMap((pergunta) => [pergunta.texto, "Obs. Resposta"]),
  ];

  const porChecklist = new Map<number, Map<number, RespostaParaExportar>>();
  for (const resposta of respostas) {
    const doChecklist = porChecklist.get(resposta.checklist_id) ?? new Map<number, RespostaParaExportar>();
    doChecklist.set(resposta.pergunta_id, resposta);
    porChecklist.set(resposta.checklist_id, doChecklist);
  }

  return {
    colunas,
    linhas: linhas.map((linha) => {
      const datas = datasDoAntigo(linha);
      const doChecklist = porChecklist.get(linha.id) ?? new Map<number, RespostaParaExportar>();
      return [
        linha.id,
        linha.numeroAno.replace(/^0+(?=\d)/, ""),
        datas.planejada,
        datas.finalizacao,
        linha.responsavel,
        linha.site,
        SITUACAO_DA_LISTA,
        conclusaoDaLista(linha),
        linha.tipo === TIPO_CORRETIVA ? linha.motivo : "",
        ...ordenadas.flatMap((pergunta) => {
          const resposta = doChecklist.get(pergunta.id);
          if (!resposta) return ["", ""];
          return [
            rotuloDaResposta(tipoDeResposta(pergunta.tipo_resposta), resposta.resposta),
            resposta.observacao ?? "",
          ];
        }),
      ];
    }),
  };
}

export type RespostasDoModelo = {
  nomeDoModelo: string;
  colunas: string[];
  linhas: (string | number)[][];
  /** O historico passou do teto, ou as respostas passaram do delas. */
  truncado: boolean;
};

/**
 * A planilha de respostas de um modelo, dentro do filtro da tela.
 *
 * Parte da mesma `getHistorico` da tela (sem pagina, ate o teto), para trazer
 * exatamente os checklists que a listagem mostra, e fica com os do modelo.
 * Entram todas as perguntas do modelo, inclusive as desativadas depois: um
 * checklist antigo pode ter resposta numa pergunta que hoje nao esta ativa.
 */
export async function getRespostasDoModelo(filtros: Filtros, modeloId: number): Promise<RespostasDoModelo> {
  const historico = await getHistorico(filtros);
  const doModelo = historico.linhas.filter((linha) => linha.modeloId === modeloId);
  const supabase = await createClient();

  const { data: modelo, error: erroDoModelo } = await supabase
    .from("modelos_checklist")
    .select("nome")
    .eq("id", modeloId)
    .maybeSingle();
  if (erroDoModelo) throw erroDoModelo;

  const { data: perguntas, error: erroDasPerguntas } = await supabase
    .from("perguntas_checklist")
    .select("id, ordem, texto, tipo_resposta")
    .eq("modelo_id", modeloId)
    .order("ordem");
  if (erroDasPerguntas) throw erroDasPerguntas;

  const respostas: RespostaParaExportar[] = [];
  let atingiuTeto = false;
  for (const lote of emLotes(
    doModelo.map((linha) => linha.id),
    IDS_POR_CONSULTA,
  )) {
    const resultado = await buscarEmPaginas<RespostaParaExportar>(
      (de, ate) =>
        supabase
          .from("checklist_respostas")
          .select("checklist_id, pergunta_id, resposta, observacao")
          .in("checklist_id", lote)
          // Chave primaria inteira: ordem estavel entre as paginas.
          .order("checklist_id")
          .order("pergunta_id")
          .range(de, ate),
      TETO_DE_AGREGACAO - respostas.length,
    );
    respostas.push(...resultado.linhas);
    if (resultado.atingiuTeto) {
      atingiuTeto = true;
      break;
    }
  }

  if (atingiuTeto) {
    erro(
      gerarIdDeRequisicao(),
      `Histórico de Checklist: teto de ${TETO_DE_AGREGACAO} respostas atingido na exportação.`,
    );
  }

  const planilha = planilhaDeRespostas(doModelo, (perguntas ?? []) as PerguntaDoModelo[], respostas);
  return {
    nomeDoModelo: modelo?.nome ?? "",
    ...planilha,
    truncado: historico.truncado || atingiuTeto,
  };
}

/**
 * Ordena pela `ordem` da pergunta, e nao pelo que o PostgREST devolveu.
 *
 * A ordenacao nao pode ir na consulta: `order` sobre recurso embutido vale
 * para as colunas do proprio embutido, e `ordem` esta um nivel abaixo, em
 * `perguntas_checklist`. Ordenar aqui e a alternativa -- e a sequencia importa,
 * porque e a mesma que o inspetor viu no celular (a 0042 documenta o porque).
 */
export function ordenarRespostas(
  respostas: ChecklistDetalheBruto["checklist_respostas"],
  fotos: ChecklistDetalheBruto["checklist_fotos"] = [],
): RespostaDoChecklist[] {
  return respostas
    .map((r) => {
      const tipo = tipoDeResposta(r.perguntas_checklist?.tipo_resposta);
      return {
        perguntaId: r.pergunta_id,
        ordem: r.perguntas_checklist?.ordem ?? null,
        pergunta: r.perguntas_checklist?.texto ?? "",
        valor: r.resposta,
        tipo,
        resposta: rotuloDaResposta(tipo, r.resposta),
        observacao: r.observacao,
        fotos: fotos.filter((foto) => foto.pergunta_id === r.pergunta_id).map(paraFoto),
      };
    })
    .sort((a, b) => (a.ordem ?? Number.MAX_SAFE_INTEGER) - (b.ordem ?? Number.MAX_SAFE_INTEGER));
}

function paraFoto(foto: { id: number; criado_em: string }): FotoDoChecklist {
  return { id: foto.id, criadoEm: foto.criado_em };
}

/**
 * Caminho da assinatura no bucket `checklists`, ou `null` quando o checklist
 * nao existe para quem pediu.
 *
 * Devolve o CAMINHO, e nao a imagem nem uma URL assinada: quem entrega os
 * bytes e a rota `[id]/assinatura`, na propria origem. Ver o cabecalho de
 * `midia.ts` para o porque de nao usar `createSignedUrl`.
 */
export async function getCaminhoDaAssinatura(id: number): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checklists_visita")
    .select("assinatura_path")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data?.assinatura_path ?? null;
}

/**
 * Caminho de UMA foto, exigindo que ela pertenca ao checklist da URL.
 *
 * O `.eq("checklist_id", ...)` nao e redundante com o RLS: sem ele,
 * `/checklist/1/fotos/999` entregaria a foto 999 de qualquer checklist que
 * quem pediu pudesse ver -- autorizado, mas nao e o que a URL diz, e e o tipo
 * de descasamento que vira referencia direta insegura quando a policy mudar.
 */
export async function getCaminhoDaFoto(id: number, fotoId: number): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checklist_fotos")
    .select("storage_path")
    .eq("id", fotoId)
    .eq("checklist_id", id)
    .maybeSingle();

  if (error) throw error;
  return data?.storage_path ?? null;
}
