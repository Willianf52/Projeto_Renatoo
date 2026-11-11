/**
 * Calendario dos Agendamentos, como o do sistema de referencia (11/11/2026):
 * visoes Mes, Semana, Dia e Lista, navegando por "<" e ">" a partir de uma
 * data ancora. So contas de datas aqui (AAAA-MM-DD), sem tela, para dar para
 * testar.
 *
 * As datas viram meio-dia UTC antes de qualquer conta: assim nenhuma soma de
 * dias escorrega de data por causa de fuso ou horario de verao.
 */

export type Visao = "mes" | "semana" | "dia" | "lista";

export const VISOES: { value: Visao; label: string }[] = [
  { value: "mes", label: "Mês" },
  { value: "semana", label: "Semana" },
  { value: "dia", label: "Dia" },
  { value: "lista", label: "Lista" },
];

export function visaoDe(valor: string | undefined): Visao {
  return VISOES.some((v) => v.value === valor) ? (valor as Visao) : "mes";
}

const paraData = (iso: string) => new Date(`${iso}T12:00:00Z`);
const paraIso = (data: Date) => data.toISOString().slice(0, 10);

export function somarDias(iso: string, dias: number): string {
  const data = paraData(iso);
  data.setUTCDate(data.getUTCDate() + dias);
  return paraIso(data);
}

/** O domingo da semana da data (a semana do antigo comeca no domingo). */
export function inicioDaSemana(iso: string): string {
  return somarDias(iso, -paraData(iso).getUTCDay());
}

function primeiroDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function ultimoDoMes(iso: string): string {
  const data = paraData(primeiroDoMes(iso));
  data.setUTCMonth(data.getUTCMonth() + 1);
  data.setUTCDate(0);
  return paraIso(data);
}

/**
 * O periodo que a visao mostra. No Mes, a grade inteira: do domingo antes do
 * dia 1 ao sabado depois do ultimo dia, porque os dias dos meses vizinhos
 * tambem aparecem na grade. Na Lista, so o mes.
 */
export function intervaloDaVisao(visao: Visao, ancora: string): { inicio: string; fim: string } {
  if (visao === "dia") return { inicio: ancora, fim: ancora };
  if (visao === "semana") {
    const inicio = inicioDaSemana(ancora);
    return { inicio, fim: somarDias(inicio, 6) };
  }
  if (visao === "lista") return { inicio: primeiroDoMes(ancora), fim: ultimoDoMes(ancora) };
  const inicio = inicioDaSemana(primeiroDoMes(ancora));
  return { inicio, fim: somarDias(inicioDaSemana(ultimoDoMes(ancora)), 6) };
}

/** A ancora depois de "<" (-1) ou ">" (+1). No Mes e na Lista, vai ao dia 1 do mes vizinho. */
export function navegar(visao: Visao, ancora: string, sentido: 1 | -1): string {
  if (visao === "dia") return somarDias(ancora, sentido);
  if (visao === "semana") return somarDias(ancora, 7 * sentido);
  const data = paraData(primeiroDoMes(ancora));
  data.setUTCMonth(data.getUTCMonth() + sentido);
  return paraIso(data);
}

/** As semanas da grade do mes, cada uma com os 7 dias, de domingo a sabado. */
export function semanasDoMes(ancora: string): string[][] {
  const { inicio, fim } = intervaloDaVisao("mes", ancora);
  const semanas: string[][] = [];
  for (let dia = inicio; dia <= fim; dia = somarDias(dia, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => somarDias(dia, i)));
  }
  return semanas;
}

export function mesmoMes(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

const MES_E_ANO = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const DIA_E_MES = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
const DIA_POR_EXTENSO = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "NOVEMBRO DE 2026", "8 de nov. a 14 de nov. de 2026" ou "quarta-feira, 11 de novembro de 2026". */
export function tituloDaVisao(visao: Visao, ancora: string): string {
  if (visao === "dia") return DIA_POR_EXTENSO.format(paraData(ancora));
  if (visao === "semana") {
    const { inicio, fim } = intervaloDaVisao("semana", ancora);
    return `${DIA_E_MES.format(paraData(inicio))} a ${DIA_E_MES.format(paraData(fim))} de ${fim.slice(0, 4)}`;
  }
  return MES_E_ANO.format(paraData(ancora)).toUpperCase();
}

export const DIAS_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** O numero do dia, sem zero a esquerda ("1", "15"). */
export function numeroDoDia(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}
