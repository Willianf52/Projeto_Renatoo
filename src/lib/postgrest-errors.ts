/**
 * Traducao de codigo de erro do Postgres/PostgREST para mensagem que a pessoa
 * usando um formulario de cadastro entende.
 *
 * Os tres codigos e a estrutura de traducao (duplicado / sem permissao / FK
 * invalida / generico) se repetiam identicos em `site-planta/actions.ts`,
 * `grupo-de-sites/actions.ts`, `grupo-de-usuarios/actions.ts` e
 * `qr-code/actions.ts` -- so o texto de cada mensagem muda de tela para tela.
 * `usuarios/actions.ts` fica de fora de proposito: escreve com service_role
 * (RLS nao se aplica) e traduz erro do GoTrue por mensagem, nao por codigo
 * Postgres -- mecanismo diferente, nao a mesma regra reimplementada.
 */

export const CODIGO_POSTGRES = {
  /** Violacao de constraint `unique`. */
  VALOR_DUPLICADO: "23505",
  /** INSERT/UPDATE/DELETE barrado pelo RLS. Diferente do UPDATE, que passa em
   * silencio (zero linhas afetadas), o INSERT falha alto com este codigo. */
  SEM_PERMISSAO: "42501",
  /** FK apontando para um registro que nao existe (mais). */
  FK_INVALIDA: "23503",
} as const;

export type MensagensDeErro = {
  duplicado: string;
  semPermissao: string;
  /** Omitido quando a tela nao tem FK que a pessoa possa provocar apagando
   * outro registro entre carregar o formulario e enviar. */
  fkInvalida?: string;
  generico: string;
};

/**
 * `codigo` vem de `error.code` do cliente Supabase. Sem esta traducao a
 * pessoa recebe o texto cru do Postgres, que cita o nome da constraint e nao
 * explica nada.
 */
export function traduzirErroPostgres(codigo: string | undefined, mensagens: MensagensDeErro): string {
  if (codigo === CODIGO_POSTGRES.VALOR_DUPLICADO) return mensagens.duplicado;
  if (codigo === CODIGO_POSTGRES.SEM_PERMISSAO) return mensagens.semPermissao;
  if (codigo === CODIGO_POSTGRES.FK_INVALIDA && mensagens.fkInvalida) return mensagens.fkInvalida;
  return mensagens.generico;
}
