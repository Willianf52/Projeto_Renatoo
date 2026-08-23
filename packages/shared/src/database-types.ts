/**
 * Recorte publico dos tipos gerados a partir do schema
 * (`pnpm run types:generate` escreve `database.types.ts` ao lado deste
 * arquivo, a partir do banco local).
 *
 * O arquivo gerado mora DENTRO deste pacote, e nao no app web, porque a
 * direcao da dependencia importa: `packages/shared` e consumido pelo painel e
 * pelo app de campo, entao ele nao pode importar de nenhum dos dois. Antes
 * este arquivo apontava para `../../../src/lib/supabase/database.types` --
 * funcionava, mas invertia a seta: o pacote compartilhado dependia de um dos
 * seus consumidores, e mover o painel de lugar quebraria o app mobile.
 *
 * Re-export explicito em vez de `export *`: a lista abaixo e a superficie que
 * os apps consomem. O arquivo gerado tambem declara utilitarios internos do
 * proprio gerador, que nao sao contrato nosso.
 */
export type {
  Json,
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
} from "./database.types";
