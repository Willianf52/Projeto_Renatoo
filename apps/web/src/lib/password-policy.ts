/**
 * Politica de senha do sistema, separada da tela que a desenha.
 *
 * ATENCAO: estas regras rodam no navegador e servem para orientar quem digita.
 * Elas nao sao a defesa -- `supabase.auth.updateUser({ password })` e uma
 * chamada direta a API do Supabase com a anon key, que qualquer pessoa refaz
 * pelo console ou por curl sem passar por este arquivo.
 *
 * O que de fato recusa uma senha fraca e a politica do GoTrue, em
 * Authentication > Sign In / Providers > Password:
 *
 *   - "Minimum password length"  -> MIN_LENGTH abaixo
 *   - "Password Requirements"    -> "Lowercase, uppercase, digits and symbols"
 *
 * Os dois precisam espelhar o que esta aqui. Desalinhados, o efeito nao e uma
 * tela quebrada: e uma regra que a lista promete e o servidor nao cobra.
 *
 * Mora em lib/ e nao no componente por ser regra pura, do mesmo tipo que
 * safe-redirect.ts e security-headers.ts -- e, como elas, precisa de teste
 * proprio, o que um arquivo com JSX nao permite (o tsconfig usa
 * `"jsx": "preserve"` para o Next, e o vite nao consegue importa-lo).
 */

export const MIN_LENGTH = 8;

/**
 * Teto de 16 caracteres, em paridade com o sistema de referencia (decisao do
 * dono do produto em 23/09/2026).
 *
 * O QUE ISSO CUSTA, REGISTRADO PORQUE A DECISAO FOI TOMADA CIENTE DISSO. Este
 * teto ja foi 15 e virou 64 na #79 (decisao de 14/09, item B-3 da varredura de
 * AppSec de 31/08) justamente porque um teto baixo recusa a saida padrao dos
 * gerenciadores de senha (1Password e Chrome geram ~20 caracteres) e qualquer
 * passphrase de tres ou quatro palavras -- e a saida obvia para quem e
 * recusado e digitar uma senha pior no lugar. Senha longa e mais forte, nao
 * mais fraca.
 *
 * ALCANCE REAL DESTE NUMERO. Ele vale na tela e em
 * `cadastros/usuarios/actions.ts`, que chama `isPasswordValid` no servidor. O
 * GoTrue nao tem configuracao de comprimento MAXIMO -- so de minimo --, entao
 * uma chamada direta a `supabase.auth.updateUser({ password })` com a anon key
 * continua aceitando senha maior. Baixar este numero nao invalida senha que ja
 * existe: o login nao revalida comprimento.
 */
export const MAX_LENGTH = 16;

/**
 * Teto em BYTES, alem do de caracteres. O GoTrue guarda a senha com bcrypt,
 * que so considera os primeiros 72 bytes -- e recusa senha maior que isso.
 *
 * Com MAX_LENGTH em 16 este limite voltou a ser INALCANCAVEL: 16 caracteres
 * acentuados ("ã", "ç") ocupam 2 bytes cada, 32 bytes no pior caso. A checagem
 * fica de guarda mesmo assim, e nao removida junto com o motivo dela -- se o
 * teto de caracteres subir de novo (foi 15, virou 64, voltou a 16), o limite do
 * bcrypt volta a ser alcancavel, e quem mexer no numero nao tem como saber
 * disso se a regra tiver sumido.
 */
export const MAX_BYTES = 72;

const bytesEmUtf8 = (texto: string) => new TextEncoder().encode(texto).length;

export type PasswordRule = {
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    label: `${MIN_LENGTH} a ${MAX_LENGTH} caracteres`,
    // `bytesEmUtf8` junto, e nao como regra separada na lista: so e alcancavel
    // com senha longa e acentuada, e uma linha a mais na tela para um caso
    // raro so poluiria a orientacao de todo mundo. Ver MAX_BYTES.
    test: (p) => p.length >= MIN_LENGTH && p.length <= MAX_LENGTH && bytesEmUtf8(p) <= MAX_BYTES,
  },
  {
    label: "Pelo menos 1 letra maiúscula",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    label: "Pelo menos 1 letra minúscula",
    test: (p) => /[a-z]/.test(p),
  },
  {
    label: "Pelo menos 1 número",
    test: (p) => /[0-9]/.test(p),
  },
  {
    /**
     * Qualquer caractere que nao seja letra nem numero, em vez da lista fechada
     * "@+$#" que havia aqui. A lista curta parecia mais restritiva, mas o efeito
     * era o oposto: a senha gerada por um gerenciador quase sempre traz simbolos
     * de fora dela ("!", "%", "&"), era recusada na tela, e a saida obvia para o
     * usuario e digitar uma senha pior no lugar.
     *
     * O "@+$#" do rotulo e exemplo, nao lista de permitidos -- esta ali so para
     * quem nunca sabe o que conta como caractere especial. Nao estreite a regex
     * para casar com o parenteses: e o parenteses que ilustra a regex.
     */
    label: "Pelo menos 1 caractere especial (ex.: @+$#)",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

export const isPasswordValid = (password: string) =>
  PASSWORD_RULES.every((rule) => rule.test(password));
