/**
 * Regras puras do km do veiculo (0104) e das metas de visita (0105 a 0107),
 * usadas pelo app e pelo portal. Aqui so formato e texto: quem pode registrar
 * e o que conta para a meta moram no banco.
 */

/** Km digitado ("12.345", "12345", "12345 km") como inteiro; `null` se invalido. */
export function lerKm(texto: string): number | null {
  const limpo = texto.replace(/[.\s]/g, "").replace(/km$/i, "");
  if (!/^\d{1,7}$/.test(limpo)) return null;
  const km = Number(limpo);
  return km <= 2_000_000 ? km : null;
}

const NUMERO = new Intl.NumberFormat("pt-BR");

/** "12.345 km". */
export function kmNaTela(km: number): string {
  return `${NUMERO.format(km)} km`;
}

/** "ABC1D23" vira "ABC-1D23", como se escreve a placa. */
export function placaComHifen(placa: string): string {
  return placa.length === 7 ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa;
}

const PERIODO_NA_FRASE: Record<string, string> = {
  DIARIA: "hoje",
  SEMANAL: "na semana",
  QUINZENAL: "na quinzena",
  MENSAL: "no mês",
};

export type ProgressoDaMeta = {
  meta_id: number;
  usuario_id: string;
  site_id: number;
  periodo: string;
  quantidade: number;
  feitas: number;
};

export type MetaPendente = {
  metaId: number;
  siteId: number;
  /** "1 de 4 na semana". */
  resumo: string;
  faltam: number;
};

/**
 * As metas da pessoa que ainda nao foram batidas no periodo atual, das que
 * faltam mais para as que faltam menos. O progresso vem de
 * `progresso_das_metas`, que para quem administra devolve as metas de todo
 * mundo: por isso o filtro pela pessoa aqui.
 */
export function metasPendentes(progresso: readonly ProgressoDaMeta[], usuarioId: string): MetaPendente[] {
  return progresso
    .filter((p) => p.usuario_id === usuarioId && p.feitas < p.quantidade)
    .map((p) => ({
      metaId: p.meta_id,
      siteId: p.site_id,
      resumo: `${p.feitas} de ${p.quantidade} ${PERIODO_NA_FRASE[p.periodo] ?? ""}`.trim(),
      faltam: p.quantidade - p.feitas,
    }))
    .sort((a, b) => b.faltam - a.faltam || a.metaId - b.metaId);
}
