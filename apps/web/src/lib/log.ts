/**
 * Log estruturado com id de correlacao.
 *
 * `console.error` solto -- middleware, `perfil-atual.ts` e o webhook de troca
 * de senha logavam cada linha por conta propria, sem nada que ligasse duas
 * linhas de uma mesma requisicao nem apontasse para fora do stdout do
 * servidor. Isto resolve a metade que da para resolver sem infraestrutura
 * nova: um id curto por requisicao, gerado uma vez e repassado para cada
 * `erro()` daquele fluxo, para que as linhas relacionadas apareçam juntas ao
 * ler o log depois.
 *
 * Tambem manda para o Sentry (`instrumentation.ts`), com o id de correlacao
 * como tag -- sem SENTRY_DSN configurado isto e um no-op silencioso, entao o
 * stdout continua sendo o destino garantido mesmo sem a credencial.
 */
import * as Sentry from "@sentry/nextjs";

/** Id curto por requisicao. Nao e um UUID inteiro no log de proposito: o que
 * importa e conseguir apontar "essas linhas sao da mesma requisicao" lendo o
 * stdout a olho, nao unicidade global. */
export function gerarIdDeRequisicao(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function erro(idRequisicao: string, mensagem: string, detalhe?: unknown): void {
  if (detalhe === undefined) {
    console.error(`[${idRequisicao}] ${mensagem}`);
  } else {
    console.error(`[${idRequisicao}] ${mensagem}`, detalhe);
  }

  Sentry.withScope((escopo) => {
    escopo.setTag("id_requisicao", idRequisicao);
    if (detalhe instanceof Error) {
      Sentry.captureException(detalhe, { extra: { mensagem } });
    } else {
      Sentry.captureMessage(mensagem, "error");
    }
  });
}
