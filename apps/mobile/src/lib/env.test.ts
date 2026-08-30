import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * O portao de configuracao do app de campo.
 *
 * `env` e um const avaliado no import, entao cada caso precisa de
 * `vi.resetModules()` e de um import novo -- e por isso que o modulo entra por
 * `carregarEnv()` e nao por um import no topo do arquivo.
 *
 * O que se prova aqui e a assimetria deliberada do modulo: as duas variaveis
 * do Supabase derrubam a abertura do app, e a do portal nao. Trocar uma pela
 * outra por engano daria ou um app que nao abre por falta de link opcional,
 * ou um app que abre sem saber com qual backend falar.
 */
const ORIGINAL = { ...process.env };

async function carregarEnv() {
  vi.resetModules();
  return await import("./env");
}

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("variaveis obrigatorias", () => {
  it("recusa a abertura sem a URL do Supabase", async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "chave";

    await expect(carregarEnv()).rejects.toThrow("EXPO_PUBLIC_SUPABASE_URL");
  });

  it("recusa a abertura sem a chave anonima", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://projeto.supabase.co";
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    await expect(carregarEnv()).rejects.toThrow("EXPO_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("trata string vazia como ausente", async () => {
    // O Expo troca a referencia por texto em tempo de build: uma variavel
    // declarada e vazia chega como "" e nao como undefined.
    process.env.EXPO_PUBLIC_SUPABASE_URL = "";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "chave";

    await expect(carregarEnv()).rejects.toThrow("EXPO_PUBLIC_SUPABASE_URL");
  });

  it("diz o que fazer, e nao so o que faltou", async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "chave";

    await expect(carregarEnv()).rejects.toThrow(/\.env\.example/);
  });

  it("le as duas quando estao presentes", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://projeto.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "chave-anonima";

    const { env } = await carregarEnv();

    expect(env.supabaseUrl).toBe("https://projeto.supabase.co");
    expect(env.supabaseAnonKey).toBe("chave-anonima");
  });
});

describe("url do portal", () => {
  it("abre o app mesmo sem ela", async () => {
    // Recuperar senha e fluxo do painel; sem a URL o link simplesmente nao
    // aparece, o que e melhor do que um atalho que leva a lugar nenhum no
    // meio de uma inspecao -- e MUITO melhor do que o app nao abrir.
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://projeto.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "chave";
    delete process.env.EXPO_PUBLIC_URL_DO_PORTAL;

    const { env } = await carregarEnv();

    expect(env.urlDoPortal).toBeUndefined();
  });

  it("le a URL quando esta configurada", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://projeto.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "chave";
    process.env.EXPO_PUBLIC_URL_DO_PORTAL = "https://portal.upservicos.com.br";

    const { env } = await carregarEnv();

    expect(env.urlDoPortal).toBe("https://portal.upservicos.com.br");
  });
});
