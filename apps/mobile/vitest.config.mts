import { defineConfig } from "vitest/config";

/**
 * Testes de logica pura do app de campo -- nada de React Native aqui.
 *
 * `environment: node` de proposito: o que se testa neste pacote hoje e o
 * adaptador de armazenamento, que nao toca em DOM nem em componente. Modulo
 * nativo (`expo-secure-store`) entra por `vi.mock`, com um duble que imita o
 * limite de tamanho da plataforma -- ver o teste.
 *
 * Testar componente de React Native exigiria `react-native` transformado pelo
 * babel do Expo e um preset proprio; quando isso for necessario, e aqui que
 * entra, e nao no vitest da raiz do painel.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Mesma regra do painel (apps/web/vitest.config.mts): piso no numero de
    // hoje, arredondado para baixo, e sobe junto com a cobertura. Medido em
    // 13/09/2026: linhas 17,05%, statements 17,61%, branches 17,05%,
    // functions 11,69%. Baixo porque as telas `.tsx` contam e nenhuma tem
    // teste -- ver o paragrafo acima sobre por que componente RN ainda nao
    // roda aqui.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
      reporter: ["text-summary", "html"],
      thresholds: {
        lines: 17,
        statements: 17,
        branches: 17,
        functions: 11,
      },
    },
  },
});
