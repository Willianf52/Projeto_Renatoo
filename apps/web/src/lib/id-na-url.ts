/**
 * Peneira para ids que chegam pela URL -- segmento `[id]` da rota ou filtro
 * `?site=...` de listagem -- antes de virarem `.eq()` no PostgREST.
 *
 * O QUE DAVA ERRADO. Valor que nao cabe no tipo da coluna nao "acha nada": o
 * Postgres RECUSA a consulta (22P02 para `abc` numa coluna bigint ou uuid,
 * 22003 para um numero maior que bigint), a pagina lanca e cai no "Nao foi
 * possivel carregar esta pagina". A checagem antiga, `Number.isInteger`,
 * deixava passar `99999999999999999999` -- o JavaScript o representa como
 * inteiro (1e20), mas ele estoura o bigint. Achado ao vivo no Historico de
 * Checklist em 25/09/2026.
 *
 * Nenhum id real deste sistema chega perto de `Number.MAX_SAFE_INTEGER`
 * (9.007.199.254.740.991, abaixo do teto do bigint), entao "inteiro seguro
 * e positivo" e peneira suficiente e sem falso negativo.
 */

const SO_DIGITOS = /^\d+$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id inteiro positivo, ou `null`. Recusa tambem `1e3`, `0x10`, ` 7` e `7.0`, que `Number()` aceitaria. */
export function idNaUrl(valor: string | undefined): number | null {
  if (valor === undefined || !SO_DIGITOS.test(valor)) return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

/**
 * Para filtros de listagem, que seguem como texto ate o `.eq()` e ate o
 * `defaultValue` do select: devolve o proprio valor se for id valido, e
 * `undefined` se nao for -- o filtro invalido e ignorado, como se nao tivesse
 * vindo. O select mostra "todos", que e exatamente o que a lista mostra.
 */
export function filtroDeId(valor: string | undefined): string | undefined {
  return idNaUrl(valor) === null ? undefined : valor;
}

/** Idem, para colunas uuid (`profiles.id`, `funcionario_id`). */
export function filtroDeUuid(valor: string | undefined): string | undefined {
  return valor !== undefined && UUID.test(valor) ? valor : undefined;
}
