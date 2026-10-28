/**
 * O Expo so substitui `process.env.EXPO_PUBLIC_*` no bundle quando a
 * referencia e estatica e literal -- mesma restricao do `NEXT_PUBLIC_*` no
 * painel web (ver `src/lib/env.ts` na raiz, que documenta o porque). Nome
 * dinamico (`process.env[nome]`) vira `undefined` no aparelho: nao existe
 * `process.env` de verdade em runtime, e so texto trocado em tempo de build.
 *
 * Por isso as duas leituras abaixo estao escritas por extenso, e nao num laco
 * sobre uma lista de nomes.
 */
function exigirEnv(nome: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Variável de ambiente ausente: ${nome}. Copie .env.example para .env e preencha com os valores do projeto Supabase.`,
    );
  }

  return valor;
}

/**
 * O token da sessao, as respostas e as fotos da inspecao vao por essa conexao:
 * fora da rede local, so HTTPS. O Android de release e o iOS ja recusam texto
 * puro por padrao, mas isso depende da configuracao nativa de cada build; aqui
 * a recusa vem antes e com mensagem, no lugar de uma "falha de rede" muda no
 * campo (revisao de seguranca de 27/10/2026).
 *
 * `http://` continua aceito para endereco de rede local: e o stack do Supabase
 * rodando na maquina de desenvolvimento (emulador em 10.0.2.2, aparelho no
 * Wi-Fi de casa). Regex e nao `new URL`: o `URL` do React Native nao tinha
 * `hostname` ate pouco tempo, e este modulo roda antes de tudo.
 */
const ENDERECO_DE_REDE_LOCAL =
  /^http:\/\/(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?(\/|$)/i;

function exigirHttps(nome: string, valor: string): string {
  if (/^https:\/\//i.test(valor) || ENDERECO_DE_REDE_LOCAL.test(valor)) return valor;

  throw new Error(
    `${nome} precisa começar com https://. Endereço http só vale para o Supabase local de desenvolvimento.`,
  );
}

export const env = {
  supabaseUrl: exigirHttps(
    "EXPO_PUBLIC_SUPABASE_URL",
    exigirEnv("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  ),
  supabaseAnonKey: exigirEnv(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  /**
   * Opcional, e sem `exigirEnv` de proposito: recuperar senha e fluxo do
   * painel (envio de e-mail, link com token, tela de nova senha), que o app de
   * campo nao reimplementa. Configurada, a tela de login mostra o link
   * "Perdeu sua Senha?" abrindo o navegador no portal; ausente, o link
   * simplesmente nao aparece -- melhor do que um atalho que leva a lugar
   * nenhum no meio de uma inspecao.
   */
  urlDoPortal: process.env.EXPO_PUBLIC_URL_DO_PORTAL,
};
