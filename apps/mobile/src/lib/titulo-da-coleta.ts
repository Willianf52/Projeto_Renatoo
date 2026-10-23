/**
 * O titulo "Coleta ..." das telas do checklist.
 *
 * O `numeroColeta` do app e um UUID: a chave de idempotencia da visita
 * (`numero_coleta`, unico com o site), que nao pode mudar. Na tela ele virava
 * "Coleta 6e809ec4-1fbe-...", e o dono pediu um numero em ordem (23/10/2026).
 * O numero em ordem e o id da visita -- o mesmo que o portal mostra em
 * Coletas Importadas (`codigoDaColeta`, que cai no `visita_id` quando o
 * `numero_coleta` nao e so digitos). Sem visita ainda (checklist aberto pelo
 * "Ver sites", que so cria a visita no envio), nao ha numero para mostrar.
 */
export function tituloDaColeta(visitaId: number | null): string {
  return visitaId === null ? "Nova coleta" : `Coleta ${visitaId}`;
}

/**
 * O numero de uma coleta da lista, com a regra do portal: `numero_coleta` so
 * de digitos (coleta importada do sistema antigo) aparece como esta; o UUID do
 * app da lugar ao id da visita.
 */
export function numeroDaColeta(numeroColeta: string | null, visitaId: number): string {
  return numeroColeta && /^\d+$/.test(numeroColeta) ? numeroColeta : String(visitaId);
}
