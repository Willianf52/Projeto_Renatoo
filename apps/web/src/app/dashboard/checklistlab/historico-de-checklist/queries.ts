import { formatarDataHora } from "@/lib/data-hora";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { escaparLike } from "@/lib/postgrest-escape";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";

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
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/** Coluna a que o periodo (Data Inicial/Final) se aplica. */
export type CampoDeData = "envio" | "visita";

export type Filtros = {
  campoData: CampoDeData;
  dataInicial?: string;
  dataFinal?: string;
  numeroAno?: string;
  /** `tipo` da tabela: CORRETIVA ou CONSULTORIA. */
  checklist?: string;
  ordem: "recentes" | "antigos";
  site?: string;
  grupoSite?: string;
  grupoUsuario?: string;
  responsavel?: string;
  /** "conforme" | "nao_conforme" -- derivado das respostas, ver `montarLinha`. */
  situacao?: string;
  /** "concluido" | "incompleto" -- idem. */
  conclusao?: string;
  busca?: string;
  buscaRespostas?: string;
};

export const CAMPO_DE_DATA_OPCOES = [
  { value: "envio", label: "Data de Envio" },
  { value: "visita", label: "Data de Registro da Visita" },
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

export const CHECKLIST_OPCOES = [
  { value: TIPO_CONSULTORIA, label: "Consultoria" },
  { value: TIPO_CORRETIVA, label: "Corretiva" },
];

export const ORDEM_OPCOES = [
  { value: "recentes", label: "Mais recentes primeiro" },
  { value: "antigos", label: "Mais antigos primeiro" },
];

export const SITUACAO_OPCOES = [
  { value: "nao_conforme", label: "Com não conformidade" },
  { value: "conforme", label: "Conforme" },
];

export const CONCLUSAO_OPCOES = [
  { value: "concluido", label: "Concluído" },
  { value: "incompleto", label: "Incompleto" },
];

/**
 * Data do periodo, ou `undefined` quando o que veio na URL nao e uma data.
 *
 * O `FilterDatePicker` so emite `yyyy-mm-dd`, mas a querystring e editavel a
 * mao -- e `?data_inicial=abc` viraria o literal `abcT00:00:00-03:00` num
 * `gte` de timestamptz, ou seja, erro 22007 do Postgres subindo como 500 da
 * tela em vez de filtro ignorado. Mesma guarda que `registro-de-rondas` faz
 * com `mesValido`.
 *
 * O ida e volta pelo ISO existe porque o formato sozinho nao basta:
 * "2026-02-31" passa no regex e nao existe no calendario.
 */
function dataValida(valor: string | undefined): string | undefined {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return undefined;
  const data = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(data.getTime())) return undefined;
  return data.toISOString().slice(0, 10) === valor ? valor : undefined;
}

/**
 * Le os filtros da querystring. Exportada (e nao so usada por `page.tsx`)
 * para as rotas de exportar lerem exatamente os mesmos filtros da listagem,
 * sem duplicar o mapeamento campo a campo -- mesmo arranjo de
 * `coletas-importadas/queries.ts`.
 *
 * `campoData` e `ordem` caem no padrao em vez de virarem `undefined`: os dois
 * mandam na consulta (que coluna filtrar, em que sentido ordenar) e um valor
 * ausente ali nao significa "nao filtrar", significa "nao sei o que fazer".
 */
export function extrairFiltros(params: SearchParams): Filtros {
  const campoData = primeiro(params.campo_data);
  const ordem = primeiro(params.ordem);

  return {
    campoData: campoData === "visita" ? "visita" : "envio",
    dataInicial: dataValida(primeiro(params.data_inicial)),
    dataFinal: dataValida(primeiro(params.data_final)),
    numeroAno: primeiro(params.numero_ano),
    checklist: primeiro(params.checklist),
    ordem: ordem === "antigos" ? "antigos" : "recentes",
    site: primeiro(params.site),
    grupoSite: primeiro(params.grupo_site),
    grupoUsuario: primeiro(params.grupo_usuario),
    responsavel: primeiro(params.responsavel),
    situacao: primeiro(params.situacao),
    conclusao: primeiro(params.conclusao),
    busca: primeiro(params.busca),
    buscaRespostas: primeiro(params.busca_respostas),
  };
}

export type Opcao = { value: string; label: string };

export type OpcoesFiltros = {
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

  const [sites, gruposSites, gruposUsuarios, responsaveis] = await Promise.all([
    supabase.from("sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
  ]);

  return {
    sites: toOptions(sites.data, "id", "nome"),
    gruposSites: toOptions(gruposSites.data, "id", "nome"),
    gruposUsuarios: toOptions(gruposUsuarios.data, "id", "nome"),
    responsaveis: toOptions(responsaveis.data, "id", "nome_completo"),
  };
}

/** Linha crua do PostgREST, antes de derivar situacao/conclusao/nota. */
export type ChecklistBruto = {
  id: number;
  tipo: string;
  motivo: string | null;
  criado_em: string;
  visitas: {
    numero_coleta: string;
    criado_em: string;
    motivos_visita: { nome: string } | null;
    profiles: { nome_completo: string | null } | null;
    sites: { nome: string } | null;
  } | null;
  checklist_respostas: { resposta: string; observacao: string | null }[];
};

export type HistoricoLinha = {
  id: number;
  /** Valor cru da coluna `tipo` -- e por ele que se DECIDE. O `checklist`
   * abaixo e o mesmo dado em texto de tela, e serve so para EXIBIR. */
  tipo: string;
  numeroAno: string;
  /** "Consultoria" | "Corretiva" -- o `tipo` em capitalizacao de tela. */
  checklist: string;
  enviadoEm: string;
  responsavel: string;
  site: string;
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
  /** Percentual de SIM entre as respostas que sao SIM ou NAO. `null` quando
   * nao ha nenhuma das duas -- so 'NA', ou nenhuma resposta. */
  nota: number | null;
};


/**
 * Deriva as tres colunas que a tela mostra e que nao existem como coluna no
 * banco.
 *
 * `totalPerguntas` e a contagem de perguntas ATIVAS hoje, nao a de quando o
 * checklist foi enviado -- o banco nao guarda a segunda (a 0042 grava resposta
 * por `pergunta_id`, sem versionar o questionario). Cadastrar uma pergunta
 * nova, portanto, faz checklists antigos passarem a aparecer como
 * "Incompleto". E o comportamento correto para quem quer saber o que falta
 * responder hoje, e o unico calculavel com o schema atual.
 */
export function montarLinha(bruto: ChecklistBruto, totalPerguntas: number): HistoricoLinha {
  const respostas = bruto.checklist_respostas ?? [];
  const sim = respostas.filter((r) => r.resposta === "SIM").length;
  const nao = respostas.filter((r) => r.resposta === "NAO").length;
  const decididas = sim + nao;

  const motivoDaVisita = bruto.visitas?.motivos_visita?.nome ?? "";

  return {
    id: bruto.id,
    tipo: bruto.tipo,
    numeroAno: bruto.visitas?.numero_coleta ?? "",
    checklist: bruto.tipo === TIPO_CORRETIVA ? "Corretiva" : "Consultoria",
    enviadoEm: bruto.criado_em,
    responsavel: bruto.visitas?.profiles?.nome_completo ?? "",
    site: bruto.visitas?.sites?.nome ?? "",
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
    nota: decididas > 0 ? Math.round((sim / decididas) * 100) : null,
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
 * O `respondidas > 0` no ramo "conforme" nao e detalhe: sem ele, a
 * consultoria enviada sem resposta nenhuma cai em "Conforme" -- ela tem zero
 * nao conformidades, afinal -- enquanto a tabela ao lado a rotula
 * "Sem respostas" (ver `textoDaSituacao`). Filtro e rotulo discordando na
 * mesma tela e pior do que qualquer um dos dois sozinho, e "conforme" aqui
 * significa "foi respondido e nada foi reprovado", nao "nada foi reprovado".
 */
function combinaSituacao(linha: HistoricoLinha, situacao: string | undefined): boolean {
  if (!situacao) return true;
  if (linha.tipo === TIPO_CORRETIVA) return false;
  return situacao === "nao_conforme"
    ? linha.naoConformidades > 0
    : linha.naoConformidades === 0 && linha.respondidas > 0;
}

function combinaConclusao(linha: HistoricoLinha, conclusao: string | undefined): boolean {
  if (!conclusao) return true;
  return conclusao === "concluido" ? estaConcluido(linha) : !estaConcluido(linha);
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
    if (!combinaSituacao(linha, filtros.situacao)) return false;
    if (!combinaConclusao(linha, filtros.conclusao)) return false;

    if (busca) {
      const casa =
        contem(linha.numeroAno, busca) ||
        contem(linha.site, busca) ||
        contem(linha.responsavel, busca) ||
        contem(linha.motivo, busca) ||
        contem(linha.checklist, busca);
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
export function montarSelect(precisaProfile: boolean): string {
  return `
    id, tipo, motivo, criado_em,
    visitas!inner (
      numero_coleta,
      criado_em,
      motivos_visita ( nome ),
      ${precisaProfile ? "profiles!inner" : "profiles"} (
        nome_completo
        ${precisaProfile ? ", grupos_usuarios_membros!inner ( grupo_id )" : ""}
      ),
      sites!inner ( id, nome, grupo_site_id )
    ),
    checklist_respostas ( resposta, observacao )
  `;
}

/**
 * Fuso da operacao (Brasilia). Fixo em -03:00 pelo mesmo motivo escrito em
 * `coletas-importadas/queries.ts`: o Brasil nao observa horario de verao desde
 * 2019, e sem o deslocamento explicito o Postgres interpretaria o limite do
 * periodo no fuso da conexao.
 */
const FUSO_OPERACIONAL = "-03:00";

/**
 * `query: any` pelo mesmo motivo de `aplicarFiltrosDeColeta`: o builder do
 * PostgREST nao expoe um tipo para "o mesmo builder de volta" a cada `.eq()`
 * reencadeado condicionalmente.
 */
function aplicarFiltros(query: any, filtros: Filtros) {
  let q = query;

  if (filtros.checklist) q = q.eq("tipo", filtros.checklist);
  if (filtros.site) q = q.eq("visitas.sites.id", filtros.site);
  if (filtros.grupoSite) q = q.eq("visitas.sites.grupo_site_id", filtros.grupoSite);
  if (filtros.responsavel) q = q.eq("visitas.funcionario_id", filtros.responsavel);
  if (filtros.grupoUsuario) {
    q = q.eq("visitas.profiles.grupos_usuarios_membros.grupo_id", filtros.grupoUsuario);
  }
  if (filtros.numeroAno) {
    // `escaparLike` sozinho, sem `escaparPostgrest`: e filtro de coluna unica,
    // entao o valor viaja como parametro proprio e nao dentro de um `or(...)`
    // -- ver o cabecalho de lib/postgrest-escape.ts.
    q = q.ilike("visitas.numero_coleta", `%${escaparLike(filtros.numeroAno)}%`);
  }

  // Qual coluna o periodo recorta depende do que a pessoa escolheu no primeiro
  // select da tela, exatamente como na referencia.
  const coluna = filtros.campoData === "visita" ? "visitas.criado_em" : "criado_em";
  if (filtros.dataInicial) q = q.gte(coluna, `${filtros.dataInicial}T00:00:00${FUSO_OPERACIONAL}`);
  if (filtros.dataFinal) q = q.lte(coluna, `${filtros.dataFinal}T23:59:59${FUSO_OPERACIONAL}`);

  return q;
}

export type Historico = {
  linhas: HistoricoLinha[];
  /** true quando o teto foi atingido -- ha mais checklists no filtro do que a
   * tela buscou, e o Total exibido esta por baixo. */
  truncado: boolean;
};

/**
 * Quantas perguntas o checklist de CONSULTORIA tem hoje. Head + count exato:
 * so o numero interessa, entao nao ha por que trazer as linhas.
 */
async function contarPerguntasAtivas(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number> {
  const { count, error } = await supabase
    .from("perguntas_checklist")
    .select("id", { count: "exact", head: true })
    .eq("ativo", true);

  if (error) throw error;
  return count ?? 0;
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
  const precisaProfile = Boolean(filtros.grupoUsuario);
  const ascendente = filtros.ordem === "antigos";

  const [totalPerguntas, resultado] = await Promise.all([
    contarPerguntasAtivas(supabase),
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
  const linhas = brutos.map((bruto) => montarLinha(bruto, totalPerguntas));

  return {
    linhas: aplicarFiltrosDerivados(linhas, filtros),
    truncado: resultado.atingiuTeto,
  };
}

export const TABLE_COLUMNS = [
  "ID",
  "Número/Ano",
  "Checklist",
  "Enviado em",
  "Responsável",
  "Site",
  "Motivo",
  "Situação",
  "Conclusão",
  "Nota",
];

/**
 * Colunas de texto de uma linha, na mesma ordem de `TABLE_COLUMNS`.
 * Reaproveitada pelas exportacoes de Excel/PDF para nao duplicar o mapeamento
 * campo a campo -- mesmo arranjo das demais telas.
 */
export function toTableRow(linha: HistoricoLinha): string[] {
  return [
    String(linha.id),
    linha.numeroAno,
    linha.checklist,
    formatarDataHora(linha.enviadoEm),
    linha.responsavel,
    linha.site,
    linha.motivo,
    textoDaSituacao(linha),
    textoDaConclusao(linha),
    linha.nota === null ? "" : `${linha.nota}%`,
  ];
}

// ---------------------------------------------------------------------------
// Tela de detalhe
// ---------------------------------------------------------------------------

const RESPOSTA_ROTULOS: Record<string, string> = {
  SIM: "Sim",
  NAO: "Não",
  NA: "Não se aplica",
};

/**
 * O banco guarda 'NA' sem acento e 'NAO' sem cedilha (check
 * `checklist_respostas_resposta_check`, 0042) porque o valor e chave, nao
 * texto de tela. A traducao mora aqui, num lugar so, e nao espalhada por
 * `page.tsx` -- desconhecido cai nele mesmo em vez de virar celula vazia, que
 * esconderia um valor novo entrando no banco sem a tela saber.
 */
export function rotuloDaResposta(resposta: string): string {
  return RESPOSTA_ROTULOS[resposta] ?? resposta;
}

export type RespostaDoChecklist = {
  perguntaId: number;
  /** `null` quando a pergunta foi apagada do cadastro -- impossivel hoje
   * (`on delete restrict`, 0042), mas a coluna vem de um join e o tipo
   * honesto e o que evita um `!` no meio da tela. */
  ordem: number | null;
  pergunta: string;
  /** Ja traduzida por `rotuloDaResposta`. */
  resposta: string;
  observacao: string | null;
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
  fotos: FotoDoChecklist[];
  temAssinatura: boolean;
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
    perguntas_checklist: { ordem: number; texto: string } | null;
  }[];
  checklist_fotos: { id: number; criado_em: string }[];
};

/**
 * Um checklist com tudo que a tela de detalhe mostra.
 *
 * Sem `!inner` em `visitas` aqui, ao contrario da listagem: numa consulta de
 * uma linha so nao ha o que filtrar por coluna de visita, e o inner existia
 * justamente para viabilizar aqueles filtros. `maybeSingle` e nao `single`:
 * id inexistente -- ou fora do escopo de RLS de quem pediu, que da no mesmo
 * daqui -- e um 404 da tela, nao um erro do Postgres subindo ate a fronteira
 * de erro do App Router.
 */
export async function getChecklist(id: number): Promise<ChecklistDetalhe | null> {
  const supabase = await createClient();

  const [totalPerguntas, resultado] = await Promise.all([
    contarPerguntasAtivas(supabase),
    supabase
      .from("checklists_visita")
      .select(
        `
        id, tipo, motivo, criado_em, visita_id, assinatura_path,
        visitas (
          numero_coleta,
          criado_em,
          motivos_visita ( nome ),
          profiles ( nome_completo ),
          sites ( nome )
        ),
        checklist_respostas (
          resposta, observacao, pergunta_id,
          perguntas_checklist ( ordem, texto )
        ),
        checklist_fotos ( id, criado_em )
      `,
      )
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (resultado.error) throw resultado.error;
  if (!resultado.data) return null;

  const bruto = resultado.data as unknown as ChecklistDetalheBruto;

  return {
    linha: montarLinha(bruto, totalPerguntas),
    visitaId: bruto.visita_id,
    registradoEm: bruto.visitas?.criado_em ?? bruto.criado_em,
    motivoDaCorretiva: bruto.motivo,
    motivoDaVisita: bruto.visitas?.motivos_visita?.nome ?? "",
    respostas: ordenarRespostas(bruto.checklist_respostas ?? []),
    fotos: (bruto.checklist_fotos ?? []).map((foto) => ({ id: foto.id, criadoEm: foto.criado_em })),
    temAssinatura: Boolean(bruto.assinatura_path),
  };
}

/**
 * Ordena pela `ordem` da pergunta, e nao pelo que o PostgREST devolveu.
 *
 * A ordenacao nao pode ir na consulta: `order` sobre recurso embutido vale
 * para as colunas do proprio embutido, e `ordem` esta um nivel abaixo, em
 * `perguntas_checklist`. Ordenar aqui e a alternativa -- e a sequencia importa,
 * porque e a mesma que o inspetor viu no celular (0042 e
 * `perguntas/queries.ts` documentam o porque).
 */
export function ordenarRespostas(
  respostas: ChecklistDetalheBruto["checklist_respostas"],
): RespostaDoChecklist[] {
  return respostas
    .map((r) => ({
      perguntaId: r.pergunta_id,
      ordem: r.perguntas_checklist?.ordem ?? null,
      pergunta: r.perguntas_checklist?.texto ?? "",
      resposta: rotuloDaResposta(r.resposta),
      observacao: r.observacao,
    }))
    .sort((a, b) => (a.ordem ?? Number.MAX_SAFE_INTEGER) - (b.ordem ?? Number.MAX_SAFE_INTEGER));
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
