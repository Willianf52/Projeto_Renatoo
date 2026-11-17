/**
 * Regras puras do cadastro de veiculos (0104), sem banco: testaveis sozinhas e
 * reaproveitadas pela listagem, pelo detalhe e pelas actions.
 */

/** A revisao e a cada 10.000 km; o aviso sai aos 9.000 (pedido do gestor). */
export const INTERVALO_DE_REVISAO_KM = 10_000;
export const AVISO_DE_REVISAO_KM = 9_000;

/**
 * A placa como o banco guarda: maiusculas, sem hifen nem espaco. Aceita a
 * antiga (ABC1234) e a Mercosul (ABC1D23); devolve `null` se nao for nenhuma.
 */
export function normalizarPlaca(texto: string): string | null {
  const placa = texto.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa) ? placa : null;
}

/** "ABC1D23" vira "ABC-1D23" so na tela, como se escreve a placa. */
export function placaNaTela(placa: string): string {
  return placa.length === 7 ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa;
}

export type SituacaoDaRevisao = {
  /** Km rodados desde a ultima revisao. */
  rodados: number;
  /** Km que faltam para a proxima revisao (negativo: passou). */
  faltam: number;
  tom: "em-dia" | "perto" | "vencida";
  rotulo: string;
};

const numero = new Intl.NumberFormat("pt-BR");

export function formatarKm(km: number): string {
  return `${numero.format(km)} km`;
}

export function situacaoDaRevisao(kmAtual: number, kmUltimaRevisao: number): SituacaoDaRevisao {
  const rodados = Math.max(0, kmAtual - kmUltimaRevisao);
  const faltam = INTERVALO_DE_REVISAO_KM - rodados;

  if (faltam <= 0) {
    return { rodados, faltam, tom: "vencida", rotulo: `Revisão vencida há ${formatarKm(-faltam)}` };
  }
  if (rodados >= AVISO_DE_REVISAO_KM) {
    return { rodados, faltam, tom: "perto", rotulo: `Revisão em ${formatarKm(faltam)}` };
  }
  return { rodados, faltam, tom: "em-dia", rotulo: `Em dia (faltam ${formatarKm(faltam)})` };
}

export const TIPOS_DE_MANUTENCAO = [
  { value: "REVISAO", label: "Revisão" },
  { value: "PREVENTIVA", label: "Preventiva" },
  { value: "CORRETIVA", label: "Corretiva" },
  { value: "OUTRA", label: "Outra" },
] as const;

export type TipoDeManutencao = (typeof TIPOS_DE_MANUTENCAO)[number]["value"];

export function rotuloDoTipo(tipo: string): string {
  return TIPOS_DE_MANUTENCAO.find((t) => t.value === tipo)?.label ?? tipo;
}

/** Km digitado na tela ("12.345" ou "12345") como inteiro; `null` se invalido. */
export function lerKm(texto: string): number | null {
  const limpo = texto.replace(/[.\s]/g, "").replace(/km$/i, "");
  if (!/^\d{1,7}$/.test(limpo)) return null;
  const km = Number(limpo);
  return km <= 2_000_000 ? km : null;
}
