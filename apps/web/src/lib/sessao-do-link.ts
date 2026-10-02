/**
 * Le a sessao que o Supabase pendura no fragmento (`#...`) do link de e-mail
 * no fluxo "implicito" -- o que o app de campo usa ao pedir "Perdeu sua
 * Senha?" (`apps/mobile/src/auth/recuperar-senha.ts`).
 *
 * POR QUE (02/10/2026): o `/auth/callback` so troca o `code` do PKCE, e o
 * app nao tem como gerar um `code` que o navegador do celular consiga trocar
 * -- o verificador ficaria no app. O fluxo implicito entrega os tokens no
 * proprio link, e o fragmento nunca chega ao servidor: por isso a leitura e
 * aqui, no navegador (`/auth/sessao`).
 *
 * Provisorio ate o dominio proprio: com SMTP proprio, o modelo "Reset
 * Password" passa a apontar para `/auth/confirmar` (token_hash), que vale
 * para o web e para o app.
 */
export type SessaoDoLink =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false };

export function lerSessaoDoLink(fragmento: string): SessaoDoLink {
  const params = new URLSearchParams(fragmento.replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (params.get("error") || !accessToken || !refreshToken) {
    return { ok: false };
  }

  return { ok: true, accessToken, refreshToken };
}
