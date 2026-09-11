/**
 * O que "estar de pe" significa para este sistema.
 *
 * Separado da rota de proposito: a rota junta request, limite de taxa e
 * codigo HTTP; aqui fica a decisao, que e o que se quer conferir em teste sem
 * levantar servidor.
 *
 * DUAS VERIFICACOES, E SO DUAS. Um health check que mede tudo vira um
 * segundo sistema para manter, e o primeiro alarme falso ensina todo mundo a
 * ignorar o alerta. As duas abaixo sao as que, falhando, deixam o painel no
 * ar e inutil -- que e o modo de falha que ninguem percebe ate o inspetor
 * ligar:
 *
 *   1) O banco responde? URL errada, projeto pausado por inatividade, chave
 *      rotacionada sem atualizar o ambiente: em todos, o painel carrega e so
 *      quebra quando alguem tenta usar.
 *   2) As envs criticas estao presentes? Um deploy sem `CRON_SECRET` derruba
 *      o alerta de importacao em silencio -- o controle que avisa que os
 *      lotes pararam de chegar. Silencio em cima de silencio.
 */

/**
 * As envs sem as quais uma funcionalidade inteira sobe quebrada.
 *
 * Espelha a lista de `scripts/check-env.mjs`, e a duplicacao e deliberada: o
 * script e portao de DEPLOY (roda antes, com o ambiente do build) e isto e
 * observacao de RUNTIME (roda depois, com o ambiente que a funcao de fato
 * recebeu). Sao perguntas diferentes -- "vai subir quebrado?" e "esta
 * quebrado agora?" -- e um ambiente pode passar na primeira e falhar na
 * segunda, que e justamente o caso que importa pegar.
 *
 * O que a duplicacao NAO pode fazer e divergir sem ninguem ver, entao
 * `saude.test.ts` compara as duas listas e falha se uma andar sem a outra.
 */
export const ENVS_OBRIGATORIAS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "RESEND_API_KEY",
  "SUPABASE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "IMPORTACAO_SECRET",
  "CRON_SECRET",
  "ALERTA_OPERACAO_EMAIL",
] as const;

export type Verificacoes = {
  banco: boolean;
  envs: boolean;
};

export type Saude = {
  status: "ok" | "fora";
  banco: boolean;
  envs: boolean;
};

/**
 * Quais das obrigatorias faltam no ambiente recebido.
 *
 * `Record<string, string | undefined>` e nao `NodeJS.ProcessEnv`: o Next
 * aumenta esse tipo com campos proprios (`NODE_ENV` entre eles), e exigi-lo
 * obrigaria todo teste a montar um ambiente falso completo para conferir uma
 * lista de oito nomes. `process.env` satisfaz a forma mais frouxa sem
 * conversao.
 */
export function envsAusentes(ambiente: Record<string, string | undefined>): string[] {
  return ENVS_OBRIGATORIAS.filter((nome) => {
    const valor = ambiente[nome];
    return typeof valor !== "string" || valor.trim().length === 0;
  });
}

/**
 * Junta as verificacoes num veredito.
 *
 * NAO HA ESTADO INTERMEDIARIO. Um "degradado" que devolve 200 nao acorda
 * ninguem, e um que devolve 503 e so um "fora" com nome mais longo -- as duas
 * verificacoes aqui sao binarias para quem opera: ou da para trabalhar, ou
 * nao da.
 */
export function avaliar(verificacoes: Verificacoes): Saude {
  const tudoBem = verificacoes.banco && verificacoes.envs;

  return {
    status: tudoBem ? "ok" : "fora",
    banco: verificacoes.banco,
    envs: verificacoes.envs,
  };
}
