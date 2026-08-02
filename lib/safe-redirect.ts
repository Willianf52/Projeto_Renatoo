/**
 * Garante que um destino vindo da URL aponte para dentro da aplicacao.
 *
 * Sem essa checagem, `?redirectTo=https://site-falso.com` faria o usuario
 * autenticar de verdade e em seguida cair num site controlado por terceiros,
 * pronto para exibir "sessao expirada" e colher a senha.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value) {
    return fallback;
  }

  // Precisa ser um caminho absoluto interno. "//host" e "https://host" viram
  // destinos externos; a barra invertida e normalizada para "/" por alguns
  // navegadores, servindo para disfarcar "/\host".
  const isInternalPath =
    value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");

  return isInternalPath ? value : fallback;
}
