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

/**
 * Formulario de criacao em branco.
 *
 * Mora aqui, e nao em `novo/page.tsx`, porque `valoresParaDuplicar` abaixo
 * precisa da mesma base e e regra que merece teste proprio.
 */
export const VALORES_VAZIOS = {
  nomeCompleto: "",
  email: "",
  senha: "",
  login: "",
  funcao: "",
  // Mesmo default da coluna (migration 0058), para o campo abrir preenchido em
  // vez de exigir que se digite o obvio -- como `pais` em site-planta.
  pais: "Brasil",
  // Mesmo default do trigger `handle_new_user` (migration 0008): o nivel mais
  // baixo, para que conceder mais seja sempre um ato deliberado.
  cargo: "OPERADOR",
  // Mesmo default da coluna (migration 0019): o caso comum e cadastrar uma
  // pessoa, e conta de integracao e a excecao que se escolhe.
  tipo: TIPO_PADRAO,
  superiorId: "",
  // Ja marcado: quem chega aqui e um gestor criando alguem de proposito, e o
  // caso comum e que a pessoa deva conseguir entrar. A 0008 defende contra
  // cadastro vindo de fora do app, que e outro caminho.
  ativo: true,
  gruposDoCliente: [] as string[],
};

/** O que a conta de origem empresta no Duplicar -- nada que a identifique. */
export type ModeloParaDuplicar = {
  funcao: string | null;
  /** Opcional: nem todo select que alimenta o Duplicar traz a coluna. */
  pais?: string;
  cargo: string;
  tipo: string;
  /** Opcional: o select da listagem nem sempre traz a coluna. */
  superior_id?: string | null;
  ativo: boolean;
};

/**
 * Valores iniciais do formulario ao duplicar um usuario.
 *
 * Copia o PERFIL DE ACESSO: cargo, tipo, funcao, superior, situacao e os
 * grupos do escopo de cliente. Nome, e-mail, login e senha ficam em branco de
 * proposito -- sao o que identifica a pessoa, e o e-mail e unico na conta de
 * autenticacao do Supabase, entao copia-lo so produziria recusa no envio.
 *
 * Objeto novo a cada chamada: `VALORES_VAZIOS` e compartilhado, e devolver a
 * mesma referencia (com o mesmo array de grupos) deixaria duas telas
 * mexendo no mesmo estado.
 */
export function valoresParaDuplicar(
  modelo: ModeloParaDuplicar | null,
  escopoDoModelo: string[],
): typeof VALORES_VAZIOS {
  if (!modelo) return { ...VALORES_VAZIOS, gruposDoCliente: [] };

  return {
    ...VALORES_VAZIOS,
    funcao: modelo.funcao ?? "",
    // `?? VALORES_VAZIOS.pais` e nao `?? ""`: o campo e `not null` no banco, e
    // um select que nao trouxe a coluna deve cair no default, nao em vazio.
    pais: modelo.pais ?? VALORES_VAZIOS.pais,
    cargo: modelo.cargo,
    tipo: modelo.tipo,
    superiorId: modelo.superior_id ?? "",
    ativo: modelo.ativo,
    gruposDoCliente: escopoDoModelo,
  };
}
