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

const config = defineConfig([
  ...nextVitals,
  globalIgnores([
    // Defaults do eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nossos:
    "node_modules/**",
    ".pnpm-store/**",
  ]),
]);

export default config;
