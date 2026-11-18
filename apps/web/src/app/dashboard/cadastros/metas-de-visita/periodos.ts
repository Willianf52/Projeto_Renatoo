/**
 * Os periodos da meta de visitas (0106), na ordem da tela. A regra de cada
 * periodo (inicio e fim) mora no banco, em `periodo_da_meta`; aqui so o nome.
 */
export const PERIODOS = [
  { value: "DIARIA", label: "Diário", atual: "hoje" },
  { value: "SEMANAL", label: "Semanal", atual: "nesta semana" },
  { value: "QUINZENAL", label: "Quinzenal", atual: "nesta quinzena" },
  { value: "MENSAL", label: "Mensal", atual: "neste mês" },
] as const;

export type Periodo = (typeof PERIODOS)[number]["value"];

const VALORES = new Set<string>(PERIODOS.map((p) => p.value));

export function ehPeriodo(valor: string): valor is Periodo {
  return VALORES.has(valor);
}

export function rotuloDoPeriodo(valor: string): string {
  return PERIODOS.find((p) => p.value === valor)?.label ?? valor;
}

/**
 * "16/11 a 22/11" do intervalo [inicio, fim) que o banco devolve; o dia
 * sozinho na meta diaria. Datas "aaaa-mm-dd", sem passar por fuso.
 */
export function intervaloNaTela(inicio: string, fim: string): string {
  const [ai, mi, di] = inicio.split("-").map(Number);
  const [af, mf, df] = fim.split("-").map(Number);
  const ultimo = new Date(Date.UTC(af, mf - 1, df - 1));
  const f = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const primeiro = new Date(Date.UTC(ai, mi - 1, di));
  return primeiro.getTime() === ultimo.getTime() ? f(primeiro) : `${f(primeiro)} a ${f(ultimo)}`;
}

/**
 * A data de inicio da meta (0107), "aaaa-mm-dd". Recusa o que nao for um dia
 * de verdade (31/02) e o que fuja de uma faixa razoavel, para um erro de
 * digitacao nao virar uma meta que so comeca em 2099.
 */
export function lerDataDeInicio(valor: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ano < 2020 || ano > 2100) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** "aaaa-mm-dd" -> "dd/mm/aaaa", sem passar por fuso. */
export function dataNaTela(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Hoje no fuso de Sao Paulo, "aaaa-mm-dd": o padrao do campo de inicio. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}
