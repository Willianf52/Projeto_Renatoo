/**
 * Regras puras das maquinas e dos acessorios e produtos (0111): os tipos e os
 * textos de tela. Quem pode o que mora no RLS.
 */

export const TIPOS_DE_MANUTENCAO_DE_MAQUINA = [
  { value: "PREVENTIVA", label: "Preventiva" },
  { value: "AUTONOMA", label: "Autônoma" },
  { value: "CORRETIVA", label: "Corretiva" },
] as const;

export const TIPOS_DE_ITEM = [
  { value: "ACESSORIO", label: "Acessório" },
  { value: "PRODUTO", label: "Produto" },
] as const;

function rotulo(lista: readonly { value: string; label: string }[], valor: string): string {
  return lista.find((t) => t.value === valor)?.label ?? valor;
}

export function rotuloDaManutencao(tipo: string): string {
  return rotulo(TIPOS_DE_MANUTENCAO_DE_MAQUINA, tipo);
}

export function rotuloDoItem(tipo: string): string {
  return rotulo(TIPOS_DE_ITEM, tipo);
}

export function ehTipoDeManutencao(valor: string): boolean {
  return TIPOS_DE_MANUTENCAO_DE_MAQUINA.some((t) => t.value === valor);
}

export function ehTipoDeItem(valor: string): boolean {
  return TIPOS_DE_ITEM.some((t) => t.value === valor);
}

/** "aaaa-mm-dd" (coluna date) como "dd/mm/aaaa", sem passar por fuso. */
export function dataNaTela(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Quantidade digitada como inteiro de 0 a 100.000; `null` se invalida. */
export function lerQuantidade(texto: string): number | null {
  const limpo = texto.replace(/[.\s]/g, "");
  if (!/^\d{1,6}$/.test(limpo)) return null;
  const n = Number(limpo);
  return n <= 100_000 ? n : null;
}
