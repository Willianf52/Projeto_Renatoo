import { appendFileSync } from "node:fs";

/**
 * Medicao dos testes de carga: latencia por operacao, erros e o resumo que
 * vai para o log e para o resumo do job no GitHub.
 */

export type Amostra = { ms: number; ok: boolean; erro?: string };

export async function medir(operacao: () => Promise<unknown>): Promise<Amostra> {
  const inicio = performance.now();
  try {
    await operacao();
    return { ms: performance.now() - inicio, ok: true };
  } catch (falha) {
    return {
      ms: performance.now() - inicio,
      ok: false,
      erro: falha instanceof Error ? falha.message : String(falha),
    };
  }
}

export type Resumo = {
  cenario: string;
  total: number;
  erros: number;
  p50: number;
  p95: number;
  max: number;
  porSegundo: number;
  primeiroErro?: string;
};

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 0) return 0;
  const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return Math.round(ordenados[Math.max(0, indice)]);
}

export function resumir(cenario: string, amostras: Amostra[], duracaoMs: number): Resumo {
  const tempos = amostras.map((a) => a.ms).sort((a, b) => a - b);
  const erros = amostras.filter((a) => !a.ok);
  return {
    cenario,
    total: amostras.length,
    erros: erros.length,
    p50: percentil(tempos, 50),
    p95: percentil(tempos, 95),
    max: Math.round(tempos.at(-1) ?? 0),
    porSegundo: Number((amostras.length / (duracaoMs / 1000)).toFixed(1)),
    primeiroErro: erros[0]?.erro,
  };
}

/** Uma linha no log e uma linha na tabela do resumo do job, quando rodando no GitHub. */
export function publicar(resumo: Resumo): void {
  console.log(`[carga] ${JSON.stringify(resumo)}`);

  const arquivo = process.env.GITHUB_STEP_SUMMARY;
  if (!arquivo) return;
  appendFileSync(
    arquivo,
    `| ${resumo.cenario} | ${resumo.total} | ${resumo.erros} | ${resumo.p50} | ${resumo.p95} | ${resumo.max} | ${resumo.porSegundo} |\n`,
  );
}

export function cabecalhoDoResumo(): void {
  const arquivo = process.env.GITHUB_STEP_SUMMARY;
  if (!arquivo) return;
  appendFileSync(
    arquivo,
    "### Teste de carga\n\n| Cenário | Requisições | Erros | p50 (ms) | p95 (ms) | máx (ms) | req/s |\n|---|---|---|---|---|---|---|\n",
  );
}

/** Roda `trabalhadores` fluxos em paralelo e junta as amostras de todos. */
export async function emParalelo<T>(
  trabalhadores: number,
  fluxo: (indice: number) => Promise<T[]>,
): Promise<{ amostras: T[]; duracaoMs: number }> {
  const inicio = performance.now();
  const resultados = await Promise.all(Array.from({ length: trabalhadores }, (_, i) => fluxo(i)));
  return { amostras: resultados.flat(), duracaoMs: performance.now() - inicio };
}
