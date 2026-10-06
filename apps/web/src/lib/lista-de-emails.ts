const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "a@x.com; b@y.com, a@x.com" -> ["a@x.com", "b@y.com"], ou o erro.
 * Separa por espaco, virgula, ponto e virgula ou quebra de linha; minusculas e
 * sem repetidos. Mesmo criterio do CHECK `lista_de_emails_valida` (0065).
 * `rotulo` completa a mensagem do limite: "No máximo 10 <rotulo>."
 */
export function lerListaDeEmails(
  texto: string,
  maximo: number,
  rotulo: string,
): { ok: true; emails: string[] } | { ok: false; erro: string } {
  const itens = texto
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const unicos = Array.from(new Set(itens));
  const invalido = unicos.find((e) => !EMAIL.test(e) || e.length > 254);
  if (invalido) return { ok: false, erro: `E-mail inválido: ${invalido}` };
  if (unicos.length > maximo) return { ok: false, erro: `No máximo ${maximo} ${rotulo}.` };
  return { ok: true, emails: unicos };
}
