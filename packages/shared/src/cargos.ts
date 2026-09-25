/**
 * Cargos de `profiles`, espelhando o check constraint `profiles_cargo_check`
 * (criado na 0003, ampliado na 0036 com INSPETOR).
 *
 * Mora aqui, e nao no app que precisar, porque o cargo atravessa os dois
 * clientes: o painel web filtra e grava por ele, e o app de campo escolhe por
 * ele o recorte da lista. Um valor divergente entre os dois nao daria erro de
 * compilacao -- daria uma tela vazia num lado e dado de mais no outro.
 *
 * Sem label: rotulo e decisao de interface, e as duas interfaces sao
 * diferentes. Aqui fica so o valor, que e o que o banco reconhece.
 */
export const CARGOS = [
  "GESTOR",
  "SUPERVISOR",
  "OPERACIONAL",
  "OPERADOR",
  "CLIENTE",
  "INSPETOR",
] as const;

export type Cargo = (typeof CARGOS)[number];

/**
 * Unico cargo que grava visitas/leituras pelo token da propria sessao
 * (migration 0036). O portao de verdade e a policy no banco -- `e_inspetor()`
 * decide, e nao o cliente. Esta constante existe para o app nao *oferecer* o
 * que a policy vai recusar, o que e experiencia de uso, nao seguranca.
 *
 * Nao confundir com "quem entra no app": entrar, entra qualquer cargo. Este
 * aqui e so quem registra em campo -- e, por isso, de quem a lista de visitas
 * pode ser filtrada por `funcionario_id` sem esconder nada.
 */
export const CARGO_INSPETOR: Cargo = "INSPETOR";

/**
 * Quem fecha visita pelo app (checklist, fotos, assinatura): o INSPETOR, na
 * propria visita, e o GESTOR, em qualquer visita que enxerga. Decisao do dono
 * em 25/09/2026, com o portao de verdade em
 * `autorizacao.pode_finalizar_visita` (migration 0059).
 *
 * Mesma natureza de `CARGO_INSPETOR`: serve para o app mostrar o botao a quem
 * o banco vai aceitar, e esconder de quem ele vai recusar. Se a policy mudar,
 * esta lista muda junto -- as duas sao a mesma regra.
 */
export const CARGOS_QUE_FINALIZAM_VISITA: readonly Cargo[] = ["INSPETOR", "GESTOR"];

export function podeFinalizarVisita(cargo: string | null | undefined): boolean {
  return cargo != null && (CARGOS_QUE_FINALIZAM_VISITA as readonly string[]).includes(cargo);
}

export function ehCargoConhecido(valor: string): valor is Cargo {
  return (CARGOS as readonly string[]).includes(valor);
}
