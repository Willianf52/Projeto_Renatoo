import { traduzirErroPostgres, type MensagensDeErro } from "./postgrest-errors";

/**
 * Interpreta o resultado de um UPDATE/DELETE/INSERT-com-select feito com o
 * token da sessao (RLS ativo) -- padrao que se repetia identico em
 * `site-planta`, `grupo-de-sites`, `grupo-de-usuarios` e `qr-code`:
 *
 *   const { data, error } = await supabase.from(tabela)...select("id").maybeSingle();
 *   if (error) return { erro: traduzir(error.code) };
 *   if (!data) return { erro: "sem permissao ou nao existe mais" };
 *
 * O UPDATE/DELETE barrado pelo RLS nao devolve erro -- devolve zero linhas
 * afetadas. Sem o segundo `if`, quem nao tem permissao veria sucesso e a
 * tela voltaria para a listagem com o registro intacto (ou, no DELETE,
 * "excluido" sem ter saido do banco).
 *
 * So a decisao e compartilhada -- a consulta em si (`.update()`, `.delete()`,
 * `.insert()`, as colunas do `.select()`) continua em cada `actions.ts`, cada
 * um com sua tabela e seu formato de linha.
 */
export function verificarEscritaComRls<T>(
  resultado: { data: T | null; error: { code?: string } | null },
  mensagens: MensagensDeErro,
  mensagemSemPermissao: string,
): { ok: true; data: T } | { ok: false; erro: string } {
  if (resultado.error) {
    return { ok: false, erro: traduzirErroPostgres(resultado.error.code, mensagens) };
  }
  if (!resultado.data) {
    return { ok: false, erro: mensagemSemPermissao };
  }
  return { ok: true, data: resultado.data };
}
