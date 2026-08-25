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
import tsParser from "@typescript-eslint/parser";

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
   * Regras com informacao de TIPO, so no codigo de aplicacao.
   *
   * `@typescript-eslint/eslint-plugin` e `/parser` estavam declarados na raiz
   * desde sempre e nunca foram referenciados aqui -- dependencia instalada sem
   * efeito nenhum, e sem elas `no-floating-promises` jamais rodou neste
   * repositorio. Achado Q-01 da auditoria de 25/08.
   *
   * `files` limitado ao `src/` de cada workspace de proposito: analise com
   * tipo abre o programa do TypeScript e e a parte cara do lint. Arquivo de
   * configuracao na raiz de pacote (`vitest.config.mts`, `next.config.ts`,
   * `playwright.config.ts`) fica de fora -- nao ha promessa solta para achar
   * ali, e incluir a raiz obrigaria a manter um tsconfig que a estrutura do
   * monorepo eliminou de proposito.
   *
   * `projectService: true` (nao `project: [...]`) porque cada workspace tem o
   * seu tsconfig e a lista teria de ser mantida a mao a cada pacote novo; o
   * service resolve o tsconfig mais proximo de cada arquivo sozinho.
   */
  {
    name: "regras-com-tipo-no-codigo-de-aplicacao",
    files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    /**
     * Sem `plugins` aqui: o `eslint-config-next` JA registra
     * `@typescript-eslint`, e redefini-lo e erro fatal de config
     * ("Cannot redefine plugin"). O que faltava nunca foi o plugin -- era o
     * parser com informacao de tipo, sem o qual as regras abaixo nem chegam a
     * ser avaliadas.
     */
    rules: {
      /**
       * A regra que motivou ligar isto: promessa criada e nunca aguardada nem
       * encaminhada. Numa Server Action ou num handler de tela, o efeito e uma
       * escrita que parece ter acontecido e um erro que nunca aparece.
       * `void promessa()` continua sendo a forma aceita de dizer
       * "descartada de proposito" -- ja usada em `TelaDeInspecoes.tsx`.
       */
      "@typescript-eslint/no-floating-promises": "error",

      /**
       * `checksVoidReturn.attributes: false` e a acomodacao padrao para React:
       * `onPress={async () => ...}` e `onClick={async () => ...}` sao idioma
       * corrente e seguros na pratica. Sem esta opcao a regra acusaria toda
       * tela do painel e do app de campo, e o ruido faria desligar o conjunto
       * inteiro -- que e como uma regra util morre.
       */
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],

      /** Barata e sem falso positivo: `await` em valor que nao e Promise
       * quase sempre indica que faltou chamar a funcao. */
      "@typescript-eslint/await-thenable": "error",
    },
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
