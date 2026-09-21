/**
 * Cadeia organizacao > grupo de sites > site.
 *
 * Morava em `cadastros/site-planta/queries.ts`, onde alimenta a coluna
 * "Hierarquia". Subiu para `lib/` quando Registro de Eventos passou a mostrar
 * o site do mesmo jeito -- a alternativa era um relatorio importar de dentro da
 * pasta de um cadastro (mesmo motivo de `lib/data-hora.ts`).
 */

/**
 * Organizacao no topo da hierarquia. Fixa, como na barra superior
 * (`DashboardLayout`) -- quando existir tabela de organizacoes, as duas passam
 * a ler de la.
 */
export const ORGANIZACAO = "UP Serviços";

/**
 * Niveis da cadeia, sem os vazios: site sem grupo vira "UP Serviços > Site",
 * sem separador solto no meio.
 */
export function niveisDoSite(grupoNome: string | null | undefined, siteNome: string): string[] {
  return [ORGANIZACAO, grupoNome, siteNome].filter((nivel): nivel is string => Boolean(nivel));
}
