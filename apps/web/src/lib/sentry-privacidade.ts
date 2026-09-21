/**
 * O que o Sentry pode levar de uma requisicao: nada que identifique pessoa ou
 * carregue credencial. Compartilhado pelas tres inicializacoes (servidor,
 * edge e navegador) para nao existirem tres lugares que precisam concordar.
 *
 * POR QUE EXPLICITO, CAMPO A CAMPO. O wizard do Sentry gerou
 * `dataCollection: {}` com os campos sensiveis comentados. No SDK instalado
 * (@sentry/core 10.74, `resolveDataCollectionOptions`), um objeto presente --
 * mesmo vazio -- troca a base de "respeite `sendDefaultPii`" para os DEFAULTS
 * do SDK, que ligam corpo de requisicao, cookies, dados do usuario e valores
 * de consulta ao banco. Com DSN configurado, um erro durante
 * `/api/senha/verificar-vazamento` mandaria a senha nova em texto puro para o
 * Sentry (hospedado na UE); durante o webhook `user-updated`, o registro de
 * `auth.users`. Achado H1 da auditoria de AppSec de 16/09/2026.
 *
 * Cada campo aqui e declarado mesmo quando coincide com um default atual:
 * default de SDK muda entre versoes menores, e o Dependabot mescla essas
 * sozinho. `sentry-privacidade.test.ts` trava cada um.
 */

/** Cabecalhos que nunca saem, mesmo com a coleta de cabecalhos ligada. */
export const CABECALHOS_SENSIVEIS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-webhook-secret",
  "x-importacao-secret",
];

type RequisicaoDoEvento = { data?: unknown; cookies?: unknown };

/**
 * Segunda barreira, independente da configuracao acima: remove corpo e
 * cookies de qualquer evento que chegue ate aqui. Se um upgrade do SDK mudar
 * o significado de `dataCollection`, o corpo continua sem sair.
 */
export function removerDadosDaRequisicao<E extends { request?: RequisicaoDoEvento }>(evento: E): E {
  if (evento.request) {
    delete evento.request.data;
    delete evento.request.cookies;
  }
  return evento;
}

export const OPCOES_DE_PRIVACIDADE_DO_SENTRY = {
  sendDefaultPii: false,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    genAI: { inputs: false, outputs: false },
    httpHeaders: {
      request: { deny: CABECALHOS_SENSIVEIS },
      response: false,
    },
  },
  beforeSend: removerDadosDaRequisicao,
};
