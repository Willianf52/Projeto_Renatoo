/**
 * Escaping de texto digitado pelo usuario antes de virar filtro no PostgREST.
 *
 * Morava duplicado em duas telas -- `escaparLike` estava copiado caractere por
 * caractere em `grupo-de-sites/queries.ts` e `usuarios/queries.ts`, comentario
 * incluso. Escaping copiado e colado e o tipo de coisa que se conserta num
 * lugar so e continua errada no outro, sem ninguem perceber: o sintoma nao e
 * erro, e resultado de busca silenciosamente errado.
 *
 * Regra pura, sem dependencia de rede ou de cookie -- por isso mora em lib/ e
 * tem teste proprio, como safe-redirect.ts e password-policy.ts.
 */

/**
 * Neutraliza os curingas do LIKE.
 *
 * Sem isto, um "%" digitado na busca casaria com qualquer coisa e um "_" com
 * qualquer caractere -- a pessoa procura por um nome e recebe a lista inteira,
 * sem entender por que.
 *
 * A barra invertida entra na classe junto com os curingas porque ela e o
 * proprio caractere de escape do LIKE: deixada crua, um "\" digitado escaparia
 * o caractere seguinte do termo.
 */
export const escaparLike = (valor: string) => valor.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Escapa o que quebraria a expressao de um `or(...)`.
 *
 * Dentro de um `or(...)` o valor vai entre aspas duplas: virgula e parenteses
 * digitados na busca seriam lidos como separadores da propria expressao e
 * quebrariam a consulta. Aspa e barra invertida precisam ser escapadas para
 * nao fechar as aspas antes da hora.
 */
export const escaparPostgrest = (valor: string) => valor.replace(/["\\]/g, (c) => `\\${c}`);

/**
 * Termo pronto para ir dentro de um `or(...)` com `ilike`.
 *
 * Existe para que a ordem nao dependa de quem chama. Ela nao e intercambiavel:
 * `escaparLike` primeiro, `escaparPostgrest` depois.
 *
 * `escaparLike` introduz barras invertidas; `escaparPostgrest` precisa rodar
 * depois para dobra-las, porque o PostgREST desfaz um nivel ao tirar as aspas
 * e o que sobra e a barra que o LIKE espera. Invertida, a ordem escaparia as
 * barras que ainda nao existem e dobraria as que o proprio LIKE ia usar --
 * sobrando escape a mais e um termo que nao casa com o que a pessoa digitou.
 *
 * Para filtro de coluna unica (`.ilike("nome", ...)`) use `escaparLike`
 * sozinho: ali o valor viaja como parametro proprio, nao dentro de uma
 * expressao, e o escaping do PostgREST sobraria no termo.
 */
export const termoParaOr = (valor: string) => escaparPostgrest(escaparLike(valor));
