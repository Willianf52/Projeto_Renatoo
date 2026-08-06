/**
 * Constantes puras da tela de Usuarios.
 *
 * Separadas de `queries.ts` porque `UsuarioForm` e um Client Component e
 * precisa de `NIVEIS_ACESSO` como valor, nao como tipo. Importando de
 * `queries.ts`, o bundler puxaria junto `lib/supabase/server.ts` -- e com ele
 * `next/headers`, que so existe no servidor. O build falha alto nesse caso,
 * o que e melhor que passar; mas o arranjo certo e este arquivo sem
 * dependencia nenhuma.
 */

export type FilterOption = { value: string; label: string };

/** Espelha o check constraint `profiles_cargo_check` (migration 0003). Um
 * valor fora desta lista nao existe no banco: filtraria para lista vazia na
 * listagem, e seria recusado pela constraint na gravacao. */
export const NIVEIS_ACESSO = [
  { value: "GESTOR", label: "Gestor" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "OPERACIONAL", label: "Operacional" },
  { value: "OPERADOR", label: "Operador" },
  { value: "CLIENTE", label: "Cliente" },
];

export const SITUACOES = [
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
];
