// Sobe para o Sentry os source maps de uma atualizacao remota (a pasta `dist`
// que o `eas update` deixa), para a stack trace de um erro da OTA chegar
// legivel. Roda o script da propria Sentry (`sentry-expo-upload-sourcemaps`),
// que sozinho nao funciona neste projeto por tres motivos:
//
// 1. Sem SENTRY_ORG/PROJECT/URL no ambiente, ele procura o plugin no
//    `expo config` pelo nome `@sentry/react-native/expo` -- o app.json registra
//    como `@sentry/react-native`, entao ele nao acha e aborta em qualquer SO.
//    Aqui as tres saem do proprio app.json, fonte unica com o build nativo.
// 2. Essa busca chama `spawnSync("npx", ...)` sem shell; no Windows o `npx` e
//    `npx.cmd` e o Node devolve ENOENT. Com as tres variaveis preenchidas a
//    busca nem acontece.
// 3. O upload executa `@sentry/cli/bin/sentry-cli` direto -- um script Node
//    sem extensao, que o Windows nao executa. No Windows, apontamos
//    SENTRY_CLI_EXECUTABLE para o binario nativo que o `@sentry/cli` instala.
//
// SENTRY_AUTH_TOKEN nao entra aqui: vem do ambiente ou de `.env.local`, que o
// script da Sentry carrega via `@expo/env`.
//
// Uso (em apps/mobile, depois de `pnpm atualizar:preview`/`:producao`):
//   pnpm atualizar:source-maps          # usa ./dist
//   node scripts/enviar-source-maps.mjs <pasta>

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const appJson = JSON.parse(readFileSync(path.join(raiz, "app.json"), "utf8"));
const plugin = appJson.expo.plugins.find(
  (p) => Array.isArray(p) && p[0] === "@sentry/react-native",
);
if (!plugin) {
  console.error("Plugin @sentry/react-native nao encontrado em app.json.");
  process.exit(1);
}
const { organization, project, url } = plugin[1];

const env = {
  ...process.env,
  SENTRY_ORG: process.env.SENTRY_ORG || organization,
  SENTRY_PROJECT: process.env.SENTRY_PROJECT || project,
  SENTRY_URL: process.env.SENTRY_URL || url || "https://sentry.io/",
};

if (process.platform === "win32" && !env.SENTRY_CLI_EXECUTABLE) {
  const requireDaCli = createRequire(require.resolve("@sentry/cli/package.json"));
  env.SENTRY_CLI_EXECUTABLE = requireDaCli.resolve(
    `@sentry/cli-win32-${process.arch}/bin/sentry-cli.exe`,
  );
}

const scriptDaSentry = require.resolve(
  "@sentry/react-native/scripts/expo-upload-sourcemaps.js",
);
const pasta = process.argv[2] ?? "dist";

const resultado = spawnSync(process.execPath, [scriptDaSentry, pasta], {
  cwd: raiz,
  env,
  stdio: "inherit",
});
process.exit(resultado.status ?? 1);
