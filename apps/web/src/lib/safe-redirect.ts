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
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  /**
   * Conferencia final contra o proprio parser de URL.
   *
   * As checagens de texto acima olham o valor como ele chega, mas quem navega
   * olha o valor ja normalizado -- e a especificacao WHATWG manda *remover*
   * tab, quebra de linha e retorno de carro antes de resolver. Um
   * "?redirectTo=/%09/site-falso.com" chega aqui como "/\t/site-falso.com":
   * comeca com uma barra so, nao tem barra invertida, passa. Na hora de
   * navegar o tab some, sobra "//site-falso.com" e o destino vira externo --
   * o mesmo phishing que esta funcao existe para impedir, so que disfarcado.
   *
   * Resolver contra uma origem descartavel e exigir que ela sobreviva fecha
   * esse caso e qualquer outro que o parser venha a normalizar, sem precisar
   * enumerar caractere por caractere. O `.invalid` e reservado por RFC 2606:
   * nao resolve em DNS nem por acidente.
   */
  const ORIGEM_DE_TESTE = "https://interno.invalid";

  try {
    if (new URL(value, ORIGEM_DE_TESTE).origin !== ORIGEM_DE_TESTE) {
      return fallback;
    }
  } catch {
    // Valor que o parser nem consegue ler nao serve como destino.
    return fallback;
  }

  // Devolve o valor cru, nao o normalizado: o caminho ja foi aprovado e
  // preservar query e fragmento exatamente como vieram evita reescrever
  // percent-encoding que a pagina de destino talvez leia.
  return value;
}
