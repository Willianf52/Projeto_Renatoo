import { z } from "zod";
import { lerListaDeEmails } from "@/lib/lista-de-emails";

/**
 * Regras do Cadastro de Eventos (migration 0072) que valem para o formulario e
 * para a importacao. Puras, sem banco: fora de `actions.ts` porque arquivo
 * `"use server"` so exporta funcao assincrona.
 */

export const LISTAGEM = "/dashboard/eventos/cadastro-de-eventos";

/** Mesmo teto do `check` da 0072 em `eventos_notificacoes`. */
export const MAXIMO_DE_EMAILS = 20;

/** Um ano: o teto do `check` da 0072 nos dois prazos. */
const MAXIMO_DE_MINUTOS = 525600;

export type Unidade = "minute" | "hour" | "day";

/** Os valores do sistema de referencia (`tempo_atendimento_tipo`). */
export const UNIDADES: { value: Unidade; label: string; minutos: number }[] = [
  { value: "minute", label: "Minuto(s)", minutos: 1 },
  { value: "hour", label: "Hora(s)", minutos: 60 },
  { value: "day", label: "Dia(s)", minutos: 1440 },
];

/** A maior unidade que divide exato: 120 vira 2 horas, 90 fica 90 minutos. */
export function deMinutos(minutos: number | null): { quantidade: string; unidade: Unidade } {
  if (!minutos) return { quantidade: "", unidade: "hour" };
  const unidade = [...UNIDADES].reverse().find((u) => minutos % u.minutos === 0) ?? UNIDADES[0];
  return { quantidade: String(minutos / unidade.minutos), unidade: unidade.value };
}

const NOMES: Record<Unidade, [string, string]> = {
  minute: ["minuto", "minutos"],
  hour: ["hora", "horas"],
  day: ["dia", "dias"],
};

/** "2 horas", "1 dia", "90 minutos"; vazio sem prazo (celula em branco). */
export function formatarMinutos(minutos: number | null): string {
  if (!minutos) return "";
  const { quantidade, unidade } = deMinutos(minutos);
  const [singular, plural] = NOMES[unidade];
  return `${quantidade} ${quantidade === "1" ? singular : plural}`;
}

/**
 * Le "2 horas", "1 dia", "90 minutos" (o que `formatarMinutos` escreve na
 * exportacao) ou um numero puro, que vale minutos. Vazio e zero: sem prazo.
 */
export function lerDuracao(texto: string): { ok: true; minutos: number | null } | { ok: false } {
  const limpo = texto.trim().toLowerCase();
  if (limpo === "" || limpo === "0") return { ok: true, minutos: null };
  const casou = /^(\d{1,6})\s*(minutos?|min|horas?|h|dias?|d)?$/.exec(limpo);
  if (!casou) return { ok: false };
  const quantidade = Number(casou[1]);
  const sufixo = casou[2] ?? "min";
  const fator = sufixo.startsWith("d") ? 1440 : sufixo.startsWith("h") ? 60 : 1;
  const minutos = quantidade * fator;
  if (minutos > MAXIMO_DE_MINUTOS) return { ok: false };
  return { ok: true, minutos: minutos === 0 ? null : minutos };
}

export const esquemaDeTexto = z.object({
  nome: z.string().min(1, "Informe o nome.").max(100, "O nome deve ter no máximo 100 caracteres."),
  descricao: z.string().max(1000, "A descrição deve ter no máximo 1000 caracteres."),
});

/** Quantidade + unidade do formulario em minutos. Vazio ou zero: sem prazo. */
export function paraMinutos(
  quantidade: string,
  unidade: string,
  rotulo: string,
): { ok: true; minutos: number | null } | { ok: false; erro: string } {
  const limpo = quantidade.trim();
  if (limpo === "" || limpo === "0") return { ok: true, minutos: null };
  if (!/^\d{1,6}$/.test(limpo)) return { ok: false, erro: `${rotulo}: informe um número inteiro.` };
  const fator = UNIDADES.find((u) => u.value === unidade)?.minutos;
  if (!fator) return { ok: false, erro: `${rotulo}: escolha a unidade.` };
  const minutos = Number(limpo) * fator;
  if (minutos > MAXIMO_DE_MINUTOS) return { ok: false, erro: `${rotulo}: no máximo um ano.` };
  return { ok: true, minutos };
}

export function lerEmailsDoEvento(texto: string) {
  return lerListaDeEmails(texto, MAXIMO_DE_EMAILS, "e-mails");
}
