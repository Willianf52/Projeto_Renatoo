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

// ---------------------------------------------------------------------------
// Carro do dia (0109): a mesma pessoa pode usar mais de um carro
// ---------------------------------------------------------------------------

export type VeiculoDaFrota = {
  id: number;
  placa: string;
  modelo: string;
  km_atual: number;
  usuario_id: string | null;
};

/**
 * Os carros para escolher: os da pessoa primeiro, depois os da frota, cada
 * grupo por modelo e placa. `seu` marca os que estao no nome dela.
 */
export function carrosParaEscolher(
  veiculos: readonly VeiculoDaFrota[],
  usuarioId: string,
): (VeiculoDaFrota & { seu: boolean })[] {
  return veiculos
    .map((v) => ({ ...v, seu: v.usuario_id === usuarioId }))
    .sort(
      (a, b) =>
        Number(b.seu) - Number(a.seu) ||
        a.modelo.localeCompare(b.modelo, "pt-BR") ||
        a.placa.localeCompare(b.placa),
    );
}

/**
 * Quem recebe o pedido do km ao abrir o app: quem usa carro (tem um no nome
 * ou registrou km nos ultimos 30 dias) e ainda nao registrou km hoje. Quem
 * so trabalha no escritorio nao e incomodado todo dia.
 */
export function devePedirKm(situacao: {
  temCarroNoNome: boolean;
  registrouKmNosUltimos30Dias: boolean;
  registrouKmHoje: boolean;
}): boolean {
  if (situacao.registrouKmHoje) return false;
  return situacao.temCarroNoNome || situacao.registrouKmNosUltimos30Dias;
}
