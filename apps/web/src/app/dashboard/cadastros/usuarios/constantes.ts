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
  // Migration 0036: unico nivel com permissao de gravar visitas/leituras
  // pelo token da propria sessao (app de campo) -- os demais continuam
  // so lendo, como antes.
  { value: "INSPETOR", label: "Inspetor" },
];

export const SITUACOES = [
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
];

/**
 * Tipo de conta, espelhando `profiles_tipo_check` (migration 0019).
 *
 * Nao se confunde com `cargo`: cargo e quanto a pessoa enxerga e altera,
 * tipo e o que a conta e. Uma conta de integracao pode precisar do alcance de
 * um GESTOR sem ser uma pessoa da operacao, e hoje ela ficaria indistinguivel
 * de uma na listagem.
 *
 * Como `cargo` e `ativo`, a coluna nao tem grant de update para
 * `authenticated` -- so a action de administracao escreve nela.
 */
export const TIPOS_USUARIO = [
  { value: "PADRAO", label: "Usuário Padrão" },
  { value: "SISTEMA", label: "Usuário Sistema" },
  { value: "POWERDESK", label: "Usuário PowerDesk" },
];

/** Default de `profiles.tipo` no banco (migration 0019). Repetido aqui para o
 * formulario de criacao abrir na mesma opcao que o banco aplicaria. */
export const TIPO_PADRAO = "PADRAO";

/**
 * Funcoes conhecidas, para o select de filtro nao nascer vazio.
 *
 * `profiles.funcao` e texto livre (migration 0003) e nao ha tabela de
 * dominio: esta lista e ponto de partida, nao regra. `getFuncoes()` a une com
 * o que estiver gravado, e a gravacao continua aceitando qualquer texto --
 * uma funcao nova nao precisa passar por aqui para funcionar.
 *
 * A grafia e a do sistema de referencia, inclusive onde ela e inconsistente
 * ("DIRETOR", "lider de limpeza"): sao os valores que os dados de la trazem, e
 * normalizar aqui faria o filtro exibir um texto e os dados guardarem outro.
 * O casamento e case-insensitive justamente por isso -- ver `getFuncoes()`.
 */
export const FUNCOES_CONHECIDAS = [
  "Cliente",
  "DIRETOR",
  "Gerencia",
  "Gerente de Operações",
  "Gerente Geral",
  "Gestor",
  "INSPETOR ADMINISTRATIVO",
  "Inspetor Operacional",
  "lider de limpeza",
  "Operacional",
  "Operador",
  "Ronda",
  "Supervisor",
  "Supervisor de Operações",
  "Supervisor Operacional",
];
