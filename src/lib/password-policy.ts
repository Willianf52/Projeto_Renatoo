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
 * Teto definido pelo produto, em paridade com o sistema de origem.
 *
 * Registrando o custo, porque ele nao e obvio: um teto de 15 nao adiciona
 * seguranca -- senha longa e mais forte, nao mais fraca -- e recusa a saida
 * padrao de boa parte dos gerenciadores (1Password e Chrome geram ~20; o
 * Bitwarden, 14) e qualquer passphrase de tres ou quatro palavras. Na pratica
 * empurra o usuario para algo curto e memorizavel, que e justamente o que as
 * regras de composicao abaixo tentam evitar.
 *
 * Se um dia a paridade com o legado deixar de ser exigida, subir para 32 e o
 * suficiente para acomodar gerador e passphrase sem outro efeito.
 *
 * Nao ha guarda de bytes aqui de proposito: o bcrypt corta no 72o byte, e uma
 * senha de 15 caracteres chega no maximo a 45 bytes (3 bytes por unidade UTF-16
 * e o pior caso). O limite do bcrypt e inalcancavel enquanto o teto for 15.
 */
export const MAX_LENGTH = 15;

export type PasswordRule = {
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    label: `${MIN_LENGTH} a ${MAX_LENGTH} caracteres`,
    test: (p) => p.length >= MIN_LENGTH && p.length <= MAX_LENGTH,
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
