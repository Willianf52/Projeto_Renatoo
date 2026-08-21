/**
 * Calculo puro do alerta de silencio da importacao, separado da rota
 * (`api/cron/verificar-importacoes/route.ts`) pelo mesmo motivo de
 * `lib/webhook-user-updated.ts`: da pra testar sem Supabase nem Resend.
 */

/** Sem cadencia real estabelecida ainda (producao sem uso — ver
 * docs/producao-nunca-usada em memoria de sessao): 24h e um padrao razoavel
 * pra comecar, nao uma medida calibrada contra uso real. Ajustavel via
 * `IMPORTACAO_SILENCIO_HORAS` sem precisar mudar codigo. */
export const PADRAO_SILENCIO_HORAS = 24;

export function limiteDeSilencioHoras(valorEnv: string | undefined): number {
  const bruto = Number(valorEnv);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : PADRAO_SILENCIO_HORAS;
}

export type ResultadoSilencio = {
  emSilencio: boolean;
  /** Nulo quando `importacoes` nunca recebeu nenhuma linha -- "sem
   * referencia", nao "zero horas". */
  horasDesdeUltima: number | null;
};

/**
 * `ultimaCriadoEm` nulo cobre dois casos que o chamador nao precisa
 * distinguir: a tabela `importacoes` vazia (nunca rodou) ou -- mesmo que nao
 * aconteca no schema atual -- uma consulta que nao devolveu linha. Os dois
 * viram "em silencio", porque os dois significam "nao ha evidencia de lote
 * recente".
 */
export function calcularSilencio(
  ultimaCriadoEm: string | null,
  limiteHoras: number,
  agoraMs: number,
): ResultadoSilencio {
  if (!ultimaCriadoEm) return { emSilencio: true, horasDesdeUltima: null };

  const horasDesdeUltima = (agoraMs - new Date(ultimaCriadoEm).getTime()) / 3_600_000;
  return { emSilencio: horasDesdeUltima >= limiteHoras, horasDesdeUltima };
}

/** Mensagem do e-mail, extraida para o mesmo texto nao viver duplicado entre
 * a rota e o teste que confere o conteudo. */
export function montarMensagemDeSilencio(resultado: ResultadoSilencio, limiteHoras: number): string {
  if (resultado.horasDesdeUltima === null) {
    return `Nenhum lote de importação foi recebido ainda (tabela \`importacoes\` vazia). Limite configurado: ${limiteHoras}h.`;
  }

  return (
    `Nenhum lote de importação chegou nas últimas ${resultado.horasDesdeUltima.toFixed(1)} horas ` +
    `(limite: ${limiteHoras}h).`
  );
}
