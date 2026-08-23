/**
 * Leitura de campo de texto de um FormData.
 *
 * Repetia local, caractere por caractere, em `site-planta/actions.ts` e
 * `usuarios/actions.ts` -- e sem nome nenhum nos outros tres modulos de
 * cadastro, que inlinavam `String(formData.get(x) ?? "").trim()` a cada
 * campo. Mesmo raciocinio de `postgrest-errors.ts`: regra pequena, mas
 * duplicada o suficiente para divergir sem ninguem perceber.
 */
export function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}
