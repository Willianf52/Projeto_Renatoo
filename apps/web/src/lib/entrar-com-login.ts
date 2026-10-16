/**
 * Entrar com o LOGIN do sistema de referencia, e nao so com o e-mail (pedido
 * do dono, 16/10/2026). La o campo da tela de entrada e "Login"; seis das
 * contas trazidas de la tem login que nao e e-mail (`fulano.operacional00`),
 * e o Supabase Auth so conhece e-mail.
 *
 * Quem digita algo com formato de e-mail (`EMAIL_REGEX`) segue o caminho de
 * sempre, direto do navegador (ou do app) para o Supabase Auth. O resto passa
 * pela rota
 * `/api/entrar-com-login`, que acha o e-mail pelo `profiles.login` no servidor
 * e devolve so a sessao: o e-mail de ninguem sai do servidor, e a resposta e a
 * mesma exista o login ou nao.
 */

/** Login compara sem caixa e sem espaco nas pontas, como no sistema de referencia. */
export function normalizarLogin(valor: string): string {
  return valor.trim().toLowerCase();
}

/**
 * Padrao do `ilike` que pre-filtra os perfis no banco. Escapa os curingas do
 * LIKE (`_` e comum em login); com `*` ou `%` (que o PostgREST trata como
 * curinga) devolve null e a rota nem consulta. A comparacao que vale e a exata,
 * em `emailDoLogin`: o filtro so poupa trazer a tabela inteira.
 */
export function padraoDoLogin(valor: string): string | null {
  const login = valor.trim();
  if (login === "" || /[*%]/.test(login)) return null;
  return login.replace(/[\\_]/g, (caractere) => `\\${caractere}`);
}

export type PerfilComLogin = { email: string | null; login: string | null };

/**
 * O e-mail de acesso do unico perfil com esse login. Nenhum, ou mais de um
 * (login repetido em dois cadastros), e null: entrar na conta errada e pior
 * que nao entrar.
 */
export function emailDoLogin(perfis: readonly PerfilComLogin[], digitado: string): string | null {
  const alvo = normalizarLogin(digitado);
  if (alvo === "") return null;
  const achados = perfis.filter((perfil) => perfil.login !== null && normalizarLogin(perfil.login) === alvo);
  if (achados.length !== 1) return null;
  const email = achados[0].email?.trim();
  return email ? email : null;
}
