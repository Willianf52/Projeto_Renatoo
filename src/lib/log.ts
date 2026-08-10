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
 * O destino continua sendo so o stdout. Mandar para um servico de
 * observabilidade (Sentry, Datadog, etc.) exige credencial e servico
 * externos que este ambiente nao tem -- o `TODO` em `app/dashboard/error.tsx`
 * marca o lugar de plugar isso quando existir.
 */

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
}
