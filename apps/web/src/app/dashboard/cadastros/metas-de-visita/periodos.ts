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
