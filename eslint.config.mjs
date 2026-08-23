/**
 * Flat config nativo, a partir do Next 16.
 *
 * Antes isto passava por `FlatCompat.extends("next/core-web-vitals")`, que
 * traduzia o formato antigo (.eslintrc) para flat config. O plugin do Next 16
 * ja exporta flat config direto, e a ponte quebrou: o `FlatCompat` tentava
 * serializar a config para validar e batia num ciclo de referencias
 * ("Converting circular structure to JSON"), porque o plugin agora se
 * referencia a si mesmo. Importar direto resolve e tira uma camada.
 *
 * `globalIgnores` SUBSTITUI os ignores padrao do `eslint-config-next` em vez
 * de somar a eles -- por isso os quatro primeiros, que sao os defaults dele,
 * estao repetidos aqui junto com os dois nossos.
 */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextPlugin from "@next/eslint-plugin-next";

/**
 * Todas as regras `@next/next/*`, desligadas de uma vez. Gerado da lista do
 * plugin em vez de enumerado a mao: regra nova numa atualizacao do Next entra
 * sozinha, e nao aparece de surpresa no app de campo.
 */
const regrasDoNextDesligadas = Object.fromEntries(
  Object.keys(nextPlugin.rules).map((regra) => [`@next/next/${regra}`, "off"]),
);

const config = defineConfig([
  ...nextVitals,

  /**
   * O `eslint-config-next` se aplica ao repositorio inteiro, e so o painel e
   * Next. Aqui as regras dele saem de tudo que nao e o painel.
   *
   * O que NAO sai: `react`, `react-hooks`, `jsx-a11y` e `import`, que vem no
   * mesmo bloco e valem para React Native tambem -- foram elas que pegaram os
   * dois `setState` sincronos em effect no app de campo. Desligar o bloco
   * inteiro para o mobile levaria essa cobertura junto.
   *
   * As regras do Next nao chegaram a dar falso positivo no mobile: elas
   * dependem de `<img>`, `<a>`, `<head>` e `<script>`, que nao existem em
   * React Native. Mas a config declarava o app de campo como app Next, e isso
   * deixou de ser so incorreto no papel quando o painel saiu da raiz.
   */
  {
    name: "regras-do-next-so-no-painel",
    files: ["apps/mobile/**", "packages/**"],
    rules: regrasDoNextDesligadas,
  },

  /**
   * `no-html-link-for-pages` procura o diretorio de rotas a partir da raiz do
   * eslint. Com o painel em apps/web/, a raiz do monorepo nao tem `pages` nem
   * `src/pages`, e a regra avisava a cada execucao. `rootDir` e a opcao que o
   * proprio eslint-config-next expoe para monorepo.
   */
  {
    name: "raiz-do-next-para-monorepo",
    settings: { next: { rootDir: "apps/web" } },
  },
  globalIgnores([
    // Prefixados com `**/` porque o padrao do flat config e relativo ao
    // arquivo de config, que fica na raiz do monorepo -- e os artefatos agora
    // nascem dentro de apps/web/ e apps/mobile/, nao mais na raiz.
    // Defaults do eslint-config-next:
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    // Nossos:
    "**/node_modules/**",
    ".pnpm-store/**",
    // Gerado pela CLI do Supabase a partir do schema; nao e codigo nosso.
    "packages/shared/src/database.types.ts",
  ]),
]);

export default config;
