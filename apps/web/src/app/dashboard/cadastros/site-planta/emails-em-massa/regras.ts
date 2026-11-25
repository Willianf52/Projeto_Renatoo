import { lerListaDeEmails } from "@/lib/lista-de-emails";

/**
 * "Alterar E-mails em Massa" do Site/Planta, como no sistema antigo (pedido
 * do dono, 25/11/2026): escolhe grupos de sites e/ou locais avulsos, digita os
 * e-mails e marca em que lista eles entram. Os e-mails SUBSTITUEM a lista
 * marcada de cada local escolhido ("E-mails alterados em N local(is)", como
 * no antigo).
 *
 * Os tipos do antigo eram Ocorrências, Checklists, Eventos e FieldLab. Aqui:
 *   - Checklists -> `sites.emails_checklist` (0082), o "E-mails Checklist";
 *   - Eventos (ocorrências) -> `sites.emails_eventos` (0065), o "E-mails
 *     Eventos". No novo, ocorrência e evento sao a mesma lista.
 *   - FieldLab nao existe no novo.
 *
 * A trava do aviso de inspecao (`manutencao.aviso_de_inspecao.somente_para`)
 * continua valendo: enquanto estiver restrita, um e-mail de site fora da lista
 * nao recebe nada. Aqui so muda o cadastro.
 */
export const TIPOS_DE_EMAIL = [
  { valor: "checklists", rotulo: "Checklists", coluna: "emails_checklist" },
  { valor: "eventos", rotulo: "Eventos (ocorrências)", coluna: "emails_eventos" },
] as const;

export type ColunaDeEmail = (typeof TIPOS_DE_EMAIL)[number]["coluna"];

/** Mesmo teto dos CHECKs `sites_emails_*_validos` (0065, 0082). */
export const MAXIMO_DE_EMAILS = 20;

export type PedidoEmMassa = {
  /** Ids escolhidos no campo "Grupo de Sites". */
  grupos: number[];
  /** Ids escolhidos no campo "Locais" (avulsos). */
  locais: number[];
  emails: string[];
  colunas: ColunaDeEmail[];
};

function ids(valores: FormDataEntryValue[]): number[] | null {
  const lidos = valores.map((v) => Number(v));
  if (lidos.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  return Array.from(new Set(lidos));
}

/** Le e confere o formulario. Os ids dos grupos viram locais depois, no banco. */
export function lerPedido(
  formData: FormData,
): { ok: true; pedido: PedidoEmMassa } | { ok: false; erro: string } {
  const grupos = ids(formData.getAll("grupos"));
  const locais = ids(formData.getAll("locais"));
  if (!grupos || !locais) return { ok: false, erro: "Seleção inválida. Recarregue a página." };
  if (grupos.length === 0 && locais.length === 0) {
    return { ok: false, erro: "Selecione ao menos um grupo de sites ou um local." };
  }

  const tipos = formData.getAll("tipos").map(String);
  const colunas = TIPOS_DE_EMAIL.filter((t) => tipos.includes(t.valor)).map((t) => t.coluna);
  if (colunas.length === 0) return { ok: false, erro: "Marque ao menos um tipo de atualização." };

  const bruto = String(formData.get("emails") ?? "");
  const lista = lerListaDeEmails(bruto, MAXIMO_DE_EMAILS, "e-mails");
  if (!lista.ok) return { ok: false, erro: lista.erro };
  if (lista.emails.length === 0) return { ok: false, erro: "Informe ao menos um e-mail." };

  return { ok: true, pedido: { grupos, locais, emails: lista.emails, colunas } };
}

/** Locais avulsos mais os locais dos grupos escolhidos, sem repetir. */
export function juntarLocais(locaisAvulsos: number[], locaisDosGrupos: number[]): number[] {
  return Array.from(new Set([...locaisAvulsos, ...locaisDosGrupos]));
}

/** A linha do UPDATE: a mesma lista em cada coluna marcada. */
export function linhaDoUpdate(pedido: PedidoEmMassa): Partial<Record<ColunaDeEmail, string[]>> {
  return Object.fromEntries(pedido.colunas.map((coluna) => [coluna, pedido.emails]));
}

export function mensagemDeSucesso(alterados: number): string {
  return `E-mails alterados em ${alterados} ${alterados === 1 ? "local" : "locais"}.`;
}
