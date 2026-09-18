/**
 * Formatacao de data/hora para as tabelas.
 *
 * Morava em `coletas-importadas/queries.ts`, que era a unica tela a precisar.
 * Com a tela de Site / Planta exibindo "Data Criação", subiu para `lib/` pelo
 * mesmo motivo que `escaparLike` virou `lib/postgrest-escape.ts` e as
 * permissoes viraram `lib/permissoes.ts`: a alternativa era a segunda tela
 * importar de dentro da pasta da primeira.
 */

/**
 * Fuso em que este sistema le e escreve hora.
 *
 * PRECISA SER EXPLICITO EM TODA FORMATACAO DE DATA DO PAINEL. As colunas de
 * data no Postgres sao `timestamptz`, ou seja, guardam o instante absoluto --
 * quem escolhe como ele aparece e quem formata. Sem esta chave, `Intl` usa o
 * fuso do PROCESSO, e quem renderiza estas tabelas e o servidor: na Vercel ele
 * roda em UTC. O resultado nao era "hora deslocada" e pronto -- perto da
 * meia-noite a DATA tambem mudava:
 *
 *   banco:            2026-09-08T01:30:00Z
 *   servidor em UTC:  08/09/2026, 01:30   <- errado
 *   America/Sao_Paulo 07/09/2026, 22:30   <- o que o inspetor viveu
 *
 * Constante exportada em vez de string repetida porque ja sao tres telas
 * formatando data, e uma delas divergia das outras duas -- duas telas
 * mostrando horarios diferentes para o mesmo carimbo e um jeito caro de
 * descobrir que a string estava solta.
 */
export const FUSO_DO_PROJETO = "America/Sao_Paulo";

/**
 * Nulo vira string vazia, e nao "Invalid Date": a coluna e nullable no banco, e
 * a celula vazia ja diz "nao ha" sem gastar a atencao de quem le.
 *
 * `pt-BR` fixo, e nao a locale do navegador: o servidor renderiza esta tabela,
 * entao a locale de quem le nao chega ate aqui de qualquer forma -- e o
 * publico deste sistema e um so. Mesma razao vale para o fuso, com a diferenca
 * de que errar o fuso muda o dado exibido, e nao so o formato.
 */
export function formatarDataHora(valor: string | null): string {
  if (!valor) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: FUSO_DO_PROJETO,
  }).format(new Date(valor));
}

/**
 * "yyyy-mm" de hoje, no fuso do projeto -- o mes que os relatorios abrem
 * quando ninguem escolheu nenhum.
 *
 * Mesma armadilha do `formatarDataHora`, com sintoma mais discreto: montado
 * com `getFullYear()/getMonth()` (como era em duas telas), ele le o relogio
 * no fuso do processo. No ultimo dia do mes, das 21:00 as 23:59 em Brasilia,
 * o servidor em UTC ja esta no mes seguinte -- e o relatorio abre vazio,
 * mostrando um mes que mal comecou, bem no fim do expediente em que alguem
 * ainda esta conferindo o mes que fecha.
 *
 * `agora` injetavel para o teste nao depender de quando roda.
 */
export function mesAtual(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_DO_PROJETO,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(agora);

  const pedaco = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return `${pedaco("year")}-${pedaco("month")}`;
}

/**
 * "yyyy-mm-dd" vindo da querystring, ou `undefined` quando o que chegou nao e
 * uma data.
 *
 * POR QUE ISTO EXISTE. Os filtros de periodo montam o limite da consulta por
 * interpolacao -- `${data}T00:00:00-03:00` em `inicioDoFiltro` e
 * `fimExclusivoDoFiltro`. O `FilterDatePicker` so emite "yyyy-mm-dd", mas a
 * querystring e editavel a mao: `?data_inicial=abc` vira o literal
 * `abcT00:00:00-03:00` num `gte` de timestamptz, ou seja, erro 22007 do
 * Postgres subindo como erro de tela em vez de filtro ignorado.
 *
 * O ida e volta pelo ISO existe porque o formato sozinho nao basta:
 * "2026-02-31" passa no regex e nao existe no calendario. `Date.UTC` e nao o
 * fuso do projeto de proposito -- aqui so se pergunta se a data EXISTE, e
 * essa resposta nao muda com o fuso; converter deslocaria o dia.
 *
 * Nasceu em `checklistlab/historico-de-checklist/queries.ts` e subiu para ca
 * pelo mesmo motivo que `formatarDataHora`: a segunda tela a precisar dela
 * teria de importar de dentro da pasta da primeira.
 */
export function dataValida(valor: string | undefined): string | undefined {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return undefined;
  const data = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(data.getTime())) return undefined;
  return data.toISOString().slice(0, 10) === valor ? valor : undefined;
}

/**
 * Deslocamento fixo da operacao. Os relatorios recortam periodo com ele, e nao
 * com `FUSO_DO_PROJETO`, porque montam literal ISO -- e o Brasil nao observa
 * horario de verao desde 2019, entao -03:00 e o fuso de Brasilia o ano todo.
 */
export const FUSO_OPERACIONAL = "-03:00";

/** Intervalo meio-aberto `[inicio, fim)`, como as funcoes `relatorio_*` da
 * migration 0049 recebem. */
export type Periodo = { inicio: string; fim: string };

/**
 * "yyyy-mm" -> do dia 1 as 00:00 ate o dia 1 do mes seguinte, em -03:00.
 *
 * Meio-aberto de proposito: `fim` e o primeiro instante que NAO entra. Fechar
 * em "ultimo dia 23:59:59" (como as telas faziam) perde leitura no ultimo
 * segundo com fracao.
 */
export function periodoDoMes(mes: string): Periodo {
  const [ano, numero] = mes.split("-").map(Number);
  const anoFim = numero === 12 ? ano + 1 : ano;
  const mesFim = numero === 12 ? 1 : numero + 1;
  const pad = (n: number) => String(n).padStart(2, "0");

  return {
    inicio: `${ano}-${pad(numero)}-01T00:00:00${FUSO_OPERACIONAL}`,
    fim: `${anoFim}-${pad(mesFim)}-01T00:00:00${FUSO_OPERACIONAL}`,
  };
}

/**
 * "yyyy-mm-dd" inicial e final, AMBOS inclusivos na tela -> `[inicio do dia
 * inicial, inicio do dia seguinte ao final)`.
 *
 * O dia seguinte e calculado por `Date.UTC` sobre os componentes, nao somando
 * 24h a um instante local: a conta e de calendario, e assim nao depende do
 * fuso do processo. Recebe datas ja validadas por `dataValida`.
 */
export function periodoEntreDatas(dataInicial: string, dataFinal: string): Periodo {
  return { inicio: inicioDoFiltro(dataInicial), fim: fimExclusivoDoFiltro(dataFinal) };
}

/**
 * Limite inferior (inclusivo, use com `gte`) de um filtro "yyyy-mm-dd" com
 * "HH:MM" opcional. Recebe valores ja validados por `dataValida`/`horaValida`.
 *
 * O deslocamento vai explicito no literal: sem ele o Postgres interpretaria o
 * horario no fuso da conexao, nao no fuso em que a visita aconteceu.
 */
export function inicioDoFiltro(data: string, hora?: string): string {
  return `${data}T${hora ?? "00:00"}:00${FUSO_OPERACIONAL}`;
}

/**
 * Limite superior EXCLUSIVO (use com `lt`, nunca `lte`) de um filtro
 * "yyyy-mm-dd" com "HH:MM" opcional: o primeiro instante depois da menor
 * unidade que a pessoa declarou.
 *
 *   so data  ("ate 08/09")        ->  09/09 00:00
 *   com hora ("ate 08/09 17:30")  ->  08/09 17:31
 *
 * Fechar em `lte ...T23:59:59` (como Coletas Importadas e Historico de
 * Checklist faziam) descartava em silencio a leitura das 23:59:59.437: as
 * colunas sao `timestamptz` com fracao de segundo e o app de campo grava com
 * milissegundo. Com hora, `lte 17:30:00` perdia tudo de 17:30:00.001 a
 * 17:30:59.999 -- o minuto que a pessoa pediu.
 *
 * A virada (minuto, hora, dia, mes, ano, bissexto) fica com `Date.UTC` sobre
 * os componentes: e conta de calendario, entao nao depende do fuso do processo.
 */
export function fimExclusivoDoFiltro(data: string, hora?: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const [horas, minutos] = hora ? hora.split(":").map(Number) : [24, -1];
  const seguinte = new Date(Date.UTC(ano, mes - 1, dia, horas, minutos + 1));

  return `${seguinte.toISOString().slice(0, 16)}:00${FUSO_OPERACIONAL}`;
}

/**
 * "HH:MM" vindo da querystring, ou `undefined`.
 *
 * Mesma armadilha da `dataValida`, um campo adiante: `inicioDoFiltro`
 * concatena a hora no mesmo literal (`${data}T${hora}:00-03:00`), entao
 * `?hora_inicial=zz` derruba a consulta exatamente como uma data torta. O
 * `FilterTimePicker` emite "HH:MM" e nada mais.
 *
 * Sem ida e volta por Date aqui: a faixa valida de hora e minuto e fechada e
 * cabe no proprio teste, sem precisar de uma data de referencia para
 * construir.
 */
export function horaValida(valor: string | undefined): string | undefined {
  if (!valor || !/^\d{2}:\d{2}$/.test(valor)) return undefined;
  const [hora, minuto] = valor.split(":").map(Number);
  return hora <= 23 && minuto <= 59 ? valor : undefined;
}

function paraDate(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

function paraISO(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/**
 * Lista de dias (yyyy-mm-dd) entre inicio e fim, inclusive -- as colunas de
 * dia do Mapa de Locais Inspecionados e do Mapa de Eventos por Site. Subiu de
 * `mapa-de-locais-inspecionados/queries.ts` quando a segunda tela precisou.
 *
 * Construida a partir dos componentes (ano/mes/dia), nao de `new Date(iso)`:
 * o mesmo cuidado do FilterDatePicker -- string ISO pura vira meia-noite UTC,
 * que em fuso negativo volta um dia na leitura local.
 */
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
