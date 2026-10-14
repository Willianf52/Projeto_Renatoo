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
 * O cargo criado para o campo (migration 0036). Deixou de ser o unico que grava
 * visitas e leituras: a 0060 abriu para o GESTOR e a 0069 para SUPERVISOR,
 * OPERACIONAL e OPERADOR -- ver `CARGOS_QUE_REGISTRAM_VISITA`.
 *
 * Nao confundir com "quem entra no app": entrar, entra qualquer cargo.
 */
export const CARGO_INSPETOR: Cargo = "INSPETOR";

/**
 * Quem fecha visita pelo app (checklist, fotos, assinatura): todo cargo que
 * registra visita, na PROPRIA visita, e o GESTOR, em qualquer visita que
 * enxerga. Portao de verdade em `autorizacao.pode_finalizar_visita`
 * (migration 0059, ampliada na 0069 -- CLIENTE segue de fora, decisao do dono
 * em 14/10/2026).
 *
 * Serve para o app mostrar o botao a quem o banco vai aceitar, e esconder de
 * quem ele vai recusar. Se a policy mudar, esta lista muda junto -- as duas
 * sao a mesma regra.
 */
export const CARGOS_QUE_FINALIZAM_VISITA: readonly Cargo[] = [
  "INSPETOR",
  "GESTOR",
  "SUPERVISOR",
  "OPERACIONAL",
  "OPERADOR",
];

export function podeFinalizarVisita(cargo: string | null | undefined): boolean {
  return cargo != null && (CARGOS_QUE_FINALIZAM_VISITA as readonly string[]).includes(cargo);
}

/**
 * Quem registra visita e leitura de campo em nome proprio: espelha
 * `autorizacao.pode_registrar_visita()` (migration 0060, ampliada na 0069). E
 * quem faz ronda -- para o CLIENTE, "Inspecao" abre a lista, porque a camera
 * gravaria uma ronda que o banco recusaria na sincronizacao.
 */
export const CARGOS_QUE_REGISTRAM_VISITA: readonly Cargo[] = [
  "INSPETOR",
  "GESTOR",
  "SUPERVISOR",
  "OPERACIONAL",
  "OPERADOR",
];

export function podeRegistrarVisita(cargo: string | null | undefined): boolean {
  return cargo != null && (CARGOS_QUE_REGISTRAM_VISITA as readonly string[]).includes(cargo);
}

/**
 * Quem ve, no app, so as visitas que ele mesmo registrou: todo cargo que
 * registra, menos o GESTOR, que ve a lista inteira e fecha visita alheia
 * (0059). Para SUPERVISOR o RLS entrega a operacao toda; sem este recorte, o
 * app listaria visitas de outras pessoas com um botao "Finalizar" que o banco
 * recusaria. Para os outros e so o filtro de consulta: o RLS ja devolve o mesmo.
 *
 * O CLIENTE nao registra visita e segue vendo o recorte do cliente.
 */
export function listaSoAsMinhas(cargo: string | null | undefined): boolean {
  return podeRegistrarVisita(cargo) && cargo !== "GESTOR";
}

export function ehCargoConhecido(valor: string): valor is Cargo {
  return (CARGOS as readonly string[]).includes(valor);
}
