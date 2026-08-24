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
  },
});
