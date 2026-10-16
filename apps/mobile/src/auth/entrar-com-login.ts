import { isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Entrar com o LOGIN do sistema de referencia (16/10/2026), o mesmo do
 * formulario do painel. Com formato de e-mail, a tela segue direto para o
 * Supabase Auth, como sempre; sem, chama a rota do portal
 * (`apps/web/src/app/api/entrar-com-login`), que acha a conta pelo login e
 * devolve so a sessao -- o e-mail da pessoa nao vem na resposta.
 */

/** O mesmo `EMAIL_REGEX` do painel. */
export const PARECE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DesfechoDaEntrada = "ok" | "recusada" | "sem-conexao" | "falhou";

/**
 * Sem portal configurado nao ha como resolver o login: "falhou", e nao
 * "recusada" -- nao foi credencial errada, e nao deve contar tentativa.
 *
 * `setSession` guarda a sessao no Keystore como o `signInWithPassword`, e
 * propaga a mesma excecao dele; quem chama ja trata (ver `TelaDeLogin`).
 *
 * `fetchImpl` existe para o teste, como em `lib/versao-minima.ts`.
 */
export async function entrarComLogin(
  auth: Pick<SupabaseClient["auth"], "setSession">,
  urlDoPortal: string | undefined,
  login: string,
  senha: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DesfechoDaEntrada> {
  if (!urlDoPortal) return "falhou";

  let resposta: Response;
  try {
    resposta = await fetchImpl(`${urlDoPortal.replace(/\/+$/, "")}/api/entrar-com-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: login.trim(), senha }),
    });
  } catch {
    return "sem-conexao";
  }

  if (resposta.status === 401) return "recusada";
  if (!resposta.ok) return "falhou";

  const corpo = (await resposta.json().catch(() => null)) as
    | { access_token?: unknown; refresh_token?: unknown }
    | null;
  if (typeof corpo?.access_token !== "string" || typeof corpo.refresh_token !== "string") {
    return "falhou";
  }

  const { error } = await auth.setSession({
    access_token: corpo.access_token,
    refresh_token: corpo.refresh_token,
  });
  if (!error) return "ok";
  return isAuthRetryableFetchError(error) ? "sem-conexao" : "falhou";
}
