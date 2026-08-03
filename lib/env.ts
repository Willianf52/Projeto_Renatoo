// O Next so consegue substituir NEXT_PUBLIC_* no bundle do navegador quando a
// referencia e estatica e literal (process.env.NEXT_PUBLIC_X escrito direto
// no codigo). process.env[name] com nome dinamico e invisivel para essa
// substituicao: no navegador vira sempre undefined, mesmo com a env
// preenchida, porque nao existe process.env de verdade no cliente -- e
// so texto trocado em tempo de build.
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Copie .env.example para .env.local e preencha com os valores do projeto Supabase.`,
    );
  }

  return value;
}

export const env = {
  supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: requireEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
};
