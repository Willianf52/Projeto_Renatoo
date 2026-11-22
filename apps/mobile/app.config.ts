import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * O `app.json` continua sendo a configuracao do app; este arquivo so acrescenta
 * o que nao pode ficar escrito nele (22/11/2026, push no celular):
 *
 * `googleServicesFile`: o `google-services.json` do projeto do Firebase. O
 * repositorio e publico, entao o arquivo nao vai para o git: no build do EAS
 * ele chega pela variavel de arquivo `GOOGLE_SERVICES_JSON` (ambientes preview
 * e production); fora do EAS, procura um `google-services.json` local, que o
 * `.gitignore` deixa de fora.
 */
const configuracao = ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  },
});

export default configuracao;
