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

export const env = {
  supabaseUrl: exigirEnv("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: exigirEnv(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
};
