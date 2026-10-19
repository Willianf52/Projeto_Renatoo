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
  /** "no_prazo" | "atrasado" | "antecipado" -- ver `aplicarFiltrosDerivados`. */
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
  /**
   * Todo texto livre que o inspetor digitou neste checklist: a `observacao`
   * de cada resposta mais o `motivo` da corretiva (0042 -- SIM/NAO/NA nao sao
   * texto livre). Mora na linha, e nao e relido da linha crua na hora de
   * filtrar, para que `aplicarFiltrosDerivados` precise de um array so: com
   * dois arrays em paralelo, a correspondencia era por INDICE, e nada no tipo
   * impedia passar um recortado e outro nao.
   */
  textosDeResposta: string[];
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
    enviadoEm: bruto.criado_em,
    inicioEm: bruto.visitas?.criado_em ?? bruto.criado_em,
    responsavel: bruto.visitas?.profiles?.nome_completo ?? "",
    responsavelId: bruto.visitas?.funcionario_id ?? null,
    site: bruto.visitas?.sites?.nome ?? "",
    siteId: bruto.visitas?.sites?.id ?? null,
    caminhoDoSite: bruto.visitas?.sites?.nome ?? "",
    motivo: bruto.motivo ?? motivoDaVisita,
    // `bruto.motivo`, e nao `motivo` acima: na consultoria aquele campo cai no
    // motivo da VISITA, que ninguem digitou respondendo o checklist e por isso
    // nao pertence a "Busca Livre Respostas tipo Texto".
    textosDeResposta: [...respostas.map((r) => r.observacao ?? ""), bruto.motivo ?? ""].filter(
      (texto) => texto.length > 0,
    ),
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
 * "No prazo" e o unico valor de Situacao no sistema novo (nao ha agenda para
 * estar atrasado ou antecipado), entao filtrar pelos outros dois nao acha nada
 * -- igual a referencia filtrando checklists avulsos.
 */
function combinaSituacao(situacao: string | undefined): boolean {
  return !situacao || situacao === "no_prazo";
}

/** "Finalizado" e "Incompleto" sao os dois que existem aqui; as outras seis
 * conclusoes da referencia dependem de agenda ou aprovacao, e nao acham nada. */
function combinaConclusao(linha: HistoricoLinha, conclusao: string | undefined): boolean {
  if (!conclusao) return true;
  if (conclusao === "finalizado") return estaConcluido(linha);
  if (conclusao === "incompleto") return !estaConcluido(linha);
  return false;
}

/** Checklist sem nota (corretiva, ou sem pergunta de conformidade) nao entra
 * quando ha limite de nota: nao da para dizer que ele passa do limite. */
function combinaNota(linha: HistoricoLinha, minima: number | undefined, maxima: number | undefined): boolean {
  if (minima === undefined && maxima === undefined) return true;
  if (linha.nota === null) return false;
  if (minima !== undefined && linha.nota < minima) return false;
  if (maxima !== undefined && linha.nota > maxima) return false;
  return true;
}

function contem(texto: string | null | undefined, termo: string): boolean {
  return (texto ?? "").toLocaleLowerCase("pt-BR").includes(termo);
}

/**
 * Os filtros que o PostgREST nao resolve, aplicados sobre a linha ja montada.
 *
 * Situacao, Conclusao e as duas buscas livres dependem das RESPOSTAS do
 * checklist -- contar 'NAO', comparar o total de respondidas com o cadastro de
 * perguntas, procurar num campo de observacao. Nenhuma delas e uma comparacao
 * de coluna: seriam agregacao ou subconsulta, que o PostgREST so exporia por
 * uma view ou RPC. Enquanto o volume desta tabela for uma linha por visita,
 * decidir aqui custa menos que uma migration a mais para manter em sincronia.
 *
 * Exportada pura (sem Supabase) para ser testada com linhas fabricadas.
 */
export function aplicarFiltrosDerivados(
  linhas: HistoricoLinha[],
  filtros: Filtros,
): HistoricoLinha[] {
  const busca = filtros.busca?.trim().toLocaleLowerCase("pt-BR");
  const buscaRespostas = filtros.buscaRespostas?.trim().toLocaleLowerCase("pt-BR");

  return linhas.filter((linha) => {
    if (!combinaSituacao(filtros.situacao)) return false;
    if (!combinaConclusao(linha, filtros.conclusao)) return false;
    if (!combinaNota(linha, filtros.notaMinima, filtros.notaMaxima)) return false;

    if (busca) {
      const casa =
        contem(linha.numeroAno, busca) ||
        contem(linha.caminhoDoSite, busca) ||
        contem(linha.responsavel, busca) ||
        contem(linha.motivo, busca) ||
        contem(linha.checklist, busca) ||
        contem(linha.modelo, busca);
      if (!casa) return false;
    }

    // "Busca Livre Respostas tipo Texto": ver `textosDeResposta` em
    // `HistoricoLinha` para o que entra ali e o que fica de fora.
    if (buscaRespostas && !linha.textosDeResposta.some((t) => contem(t, buscaRespostas))) {
      return false;
    }

    return true;
  });
}

/**
 * O `!inner` em `visitas` e `sites` e permanente, nao condicional como em
 * `coletas-importadas`: `checklists_visita.visita_id` e `visitas.site_id` sao
 * NOT NULL (0042/0003), entao o join nunca descarta linha -- e sem ele o
 * PostgREST nao aceitaria filtrar por `visitas.sites.id`. Ja `profiles` vem de
 * `visitas.funcionario_id`, que e NULLABLE: ali o `!inner` entra so quando o
 * filtro de Grupo de Usuarios precisa dele, senao esconderia checklist de
 * visita importada sem funcionario.
 */
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

export function montarSelect(precisaProfile: boolean): string {
  return `
    id, numero, ano, tipo, motivo, criado_em, modelo_id,
    modelos_checklist ( nome ),
    visitas!inner (
      criado_em,
      funcionario_id,
      motivos_visita ( nome ),
      ${precisaProfile ? "profiles!inner" : "profiles"} (
        nome_completo
        ${precisaProfile ? ", grupos_usuarios_membros!inner ( grupo_id )" : ""}
      ),
      sites!inner ( id, nome, grupo_site_id, site_superior_id )
    ),
    checklist_respostas ( resposta, observacao, perguntas_checklist ( tipo_resposta ) )
  `;
}

/**
 * `query: any` pelo mesmo motivo de `aplicarFiltrosDeColeta`: o builder do
 * PostgREST nao expoe um tipo para "o mesmo builder de volta" a cada `.eq()`
 * reencadeado condicionalmente.
 */
function aplicarFiltros(query: any, filtros: Filtros) {
  let q = query;

  if (filtros.modelos.length) q = q.in("modelo_id", filtros.modelos);
  if (filtros.sites.length) q = q.in("visitas.sites.id", filtros.sites);
  if (filtros.gruposSites.length) q = q.in("visitas.sites.grupo_site_id", filtros.gruposSites);
  if (filtros.responsaveis.length) q = q.in("visitas.funcionario_id", filtros.responsaveis);
  if (filtros.gruposUsuarios.length) {
    q = q.in("visitas.profiles.grupos_usuarios_membros.grupo_id", filtros.gruposUsuarios);
  }
  // Sem agenda, sem atividade e sem checklist inativado no sistema novo: estes
  // tres filtros da referencia so tem resultado na opcao que vale para todos
  // (Avulso, Ativos). Nas outras, a lista volta vazia de proposito -- ignorar
  // o filtro mostraria tudo como se tivesse achado.
  if (filtros.origem === "agenda" || filtros.atividade || filtros.status === "inativos") {
    q = q.eq("id", -1);
  }
  if (filtros.numeroAno) {
    const procurado = interpretarNumeroAno(filtros.numeroAno);
    // Texto que nao e numero nao acha checklist nenhum: melhor a lista vazia
    // do que ignorar o filtro e mostrar tudo como se tivesse achado.
    if (!procurado) q = q.eq("numero", -1);
    else {
      q = q.eq("numero", procurado.numero);
      if (procurado.ano !== null) q = q.eq("ano", procurado.ano);
    }
  }

  // Qual coluna o periodo recorta depende do que a pessoa escolheu no primeiro
  // select da tela, exatamente como na referencia.
  const coluna =
    filtros.campoData === "planejada" || filtros.campoData === "inicio" ? "visitas.criado_em" : "criado_em";
  // `criado_em` tem fracao de segundo: limite superior exclusivo, ver
  // `fimExclusivoDoFiltro`.
  if (filtros.dataInicial) q = q.gte(coluna, inicioDoFiltro(filtros.dataInicial));
  if (filtros.dataFinal) q = q.lt(coluna, fimExclusivoDoFiltro(filtros.dataFinal));

  return q;
}

export type Historico = {
  linhas: HistoricoLinha[];
  /** true quando o teto foi atingido -- ha mais checklists no filtro do que a
   * tela buscou, e o Total exibido esta por baixo. */
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

/**
 * "UP Serviços → Coopertativa → RAFARD": do site mais alto ate o proprio,
 * como a coluna Site da referencia. O teto de 10 niveis protege de um ciclo
 * no cadastro (A superior de B, B superior de A), que travaria a tela.
 */
export function caminhoDoSite(siteId: number | null, sites: ReadonlyMap<number, SiteDoCaminho>): string {
  const nomes: string[] = [];
  let atual = siteId;
  for (let nivel = 0; atual !== null && nivel < 10; nivel++) {
    const site = sites.get(atual);
    if (!site) break;
    nomes.unshift(site.nome);
    atual = site.superior;
  }
  return nomes.join(" → ");
}

/** O total que `montarLinha` recebe: o do modelo respondido, zero na corretiva. */
export function totalDoModelo(porModelo: Map<number, number>, modeloId: number | null): number {
  return modeloId === null ? 0 : (porModelo.get(modeloId) ?? 0);
}

/**
 * O historico inteiro dentro do filtro, ja com as colunas derivadas.
 *
 * Nao pagina no banco: os filtros de Situacao/Conclusao/busca em respostas sao
 * decididos em memoria (ver `aplicarFiltrosDerivados`), e paginar antes deles
 * devolveria paginas de tamanho aleatorio -- 25 linhas buscadas, 4 exibidas.
 * A paginacao acontece sobre o resultado ja filtrado, em `page.tsx`, do mesmo
 * jeito que em `registro-de-rondas`.
 *
 * `buscarEmPaginas` e nao um `.range(0, TETO)` unico: o PostgREST corta em
 * `max_rows` (1000 por padrao) e devolve o pedaco SEM erro nenhum -- a tela
 * mostraria um total menor que o real com cara de certo.
 */
export async function getHistorico(filtros: Filtros): Promise<Historico> {
  const supabase = await createClient();
  const precisaProfile = filtros.gruposUsuarios.length > 0;
  const ascendente = filtros.ordem === "antigos";

  const [perguntasPorModelo, sitesPorId, resultado] = await Promise.all([
    contarPerguntasAtivasPorModelo(supabase),
    carregarSites(supabase),
    buscarEmPaginas<ChecklistBruto>(
      (de, ate) =>
        aplicarFiltros(
          supabase
            .from("checklists_visita")
            .select(montarSelect(precisaProfile))
            .order("criado_em", { ascending: ascendente })
            // Desempate obrigatorio: `criado_em` tem default `now()` e dois
            // envios podem cair no mesmo instante. Sem um segundo criterio,
            // cada `.range()` e uma consulta nova e a mesma linha pode
            // aparecer em duas paginas enquanto outra nao aparece em nenhuma.
            .order("id", { ascending: ascendente })
            .range(de, ate),
          filtros,
        ),
      TETO_DO_HISTORICO,
    ),
  ]);

  if (resultado.atingiuTeto) {
    erro(
      gerarIdDeRequisicao(),
      `Histórico de Checklist: teto de ${TETO_DO_HISTORICO} checklists atingido; a listagem está incompleta.`,
    );
  }

  const brutos = resultado.linhas;
  const linhas = brutos.map((bruto) => {
    const linha = montarLinha(bruto, totalDoModelo(perguntasPorModelo, bruto.modelo_id));
    return { ...linha, caminhoDoSite: caminhoDoSite(linha.siteId, sitesPorId) || linha.site };
  });

  return {
    linhas: aplicarFiltrosDerivados(linhas, filtros),
    truncado: resultado.atingiuTeto,
  };
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
// Exportar Respostas para Excel
// ---------------------------------------------------------------------------

/** Uma linha por resposta: as colunas do checklist se repetem em cada uma,
 * para a planilha poder ser filtrada por site, pergunta ou resposta sem
 * precisar de um segundo arquivo. */
export const RESPOSTAS_COLUMNS = [
  "ID",
  "Número/Ano",
  "Checklist",
  "Modelo",
  "Enviado em",
  "Responsável",
  "Site",
  "Ordem",
  "Pergunta",
  "Resposta",
  "Observação",
];

export type RespostaParaExportar = {
  checklist_id: number;
  resposta: string;
  observacao: string | null;
  perguntas_checklist: { ordem: number; texto: string; tipo_resposta: string } | null;
};

/**
 * Monta as linhas da planilha, na ordem da listagem e, dentro de cada
 * checklist, na ordem das perguntas.
 *
 * Checklist sem resposta nenhuma tambem sai, numa linha com as colunas de
 * resposta em branco: sumir da planilha faria o total de checklists dela
 * discordar da tela. Na CORRETIVA, que nao tem questionario (0042), a linha
 * leva o motivo digitado pelo inspetor na Observacao.
 */
export function linhasDeRespostas(
  linhas: readonly HistoricoLinha[],
  respostas: readonly RespostaParaExportar[],
  motivos: ReadonlyMap<number, string | null> = new Map(),
): string[][] {
  const porChecklist = new Map<number, RespostaParaExportar[]>();
  for (const resposta of respostas) {
    const lista = porChecklist.get(resposta.checklist_id) ?? [];
    lista.push(resposta);
    porChecklist.set(resposta.checklist_id, lista);
  }

  return linhas.flatMap((linha) => {
    const doChecklist = [
      String(linha.id),
      linha.numeroAno,
      linha.checklist,
      linha.modelo,
      formatarDataHora(linha.enviadoEm),
      linha.responsavel,
      linha.site,
    ];

    const lista = (porChecklist.get(linha.id) ?? [])
      .slice()
      .sort(
        (a, b) =>
          (a.perguntas_checklist?.ordem ?? Number.MAX_SAFE_INTEGER) -
          (b.perguntas_checklist?.ordem ?? Number.MAX_SAFE_INTEGER),
      );

    if (lista.length === 0) {
      const motivo = linha.tipo === TIPO_CORRETIVA ? (motivos.get(linha.id) ?? "") : "";
      return [[...doChecklist, "", "", "", motivo]];
    }

    return lista.map((resposta) => [
      ...doChecklist,
      resposta.perguntas_checklist ? String(resposta.perguntas_checklist.ordem) : "",
      resposta.perguntas_checklist?.texto ?? "",
      rotuloDaResposta(tipoDeResposta(resposta.perguntas_checklist?.tipo_resposta), resposta.resposta),
      resposta.observacao ?? "",
    ]);
  });
}

export type RespostasDoHistorico = {
  linhas: string[][];
  /** O historico passou do teto, ou as respostas passaram do delas. */
  truncado: boolean;
};

/**
 * As respostas de todos os checklists do filtro, ja em linhas de planilha.
 *
 * Parte da mesma `getHistorico` da tela, para a planilha trazer exatamente os
 * checklists que a listagem mostra (Situacao, Conclusao e as buscas livres sao
 * decididas em memoria), e busca as respostas desses ids em lotes.
 */
export async function getRespostasDoHistorico(filtros: Filtros): Promise<RespostasDoHistorico> {
  const historico = await getHistorico(filtros);
  const supabase = await createClient();
  const ids = historico.linhas.map((linha) => linha.id);

  const respostas: RespostaParaExportar[] = [];
  let atingiuTeto = false;

  for (const lote of emLotes(ids, IDS_POR_CONSULTA)) {
    const restante = TETO_DE_AGREGACAO - respostas.length;
    const resultado = await buscarEmPaginas<RespostaParaExportar>(
      (de, ate) =>
        supabase
          .from("checklist_respostas")
          .select("checklist_id, resposta, observacao, perguntas_checklist ( ordem, texto, tipo_resposta )")
          .in("checklist_id", lote)
          // Chave primaria inteira: ordem estavel entre as paginas.
          .order("checklist_id")
          .order("pergunta_id")
          .range(de, ate),
      restante,
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

  // O motivo da corretiva: `linha.motivo` cai no motivo da VISITA na
  // consultoria, mas na corretiva e sempre o digitado (ver `montarLinha`).
  const motivos = new Map(
    historico.linhas.filter((linha) => linha.tipo === TIPO_CORRETIVA).map((linha) => [linha.id, linha.motivo]),
  );

  return {
    linhas: linhasDeRespostas(historico.linhas, respostas, motivos),
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
