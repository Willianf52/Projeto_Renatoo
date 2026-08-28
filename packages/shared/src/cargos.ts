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

export function ehCargoConhecido(valor: string): valor is Cargo {
  return (CARGOS as readonly string[]).includes(valor);
}
