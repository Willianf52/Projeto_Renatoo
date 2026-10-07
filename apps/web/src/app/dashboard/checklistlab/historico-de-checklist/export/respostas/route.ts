import { paraCsv } from "@/lib/csv";
import { RESPOSTAS_COLUMNS, extrairFiltros, getRespostasDoHistorico } from "../../queries";

/**
 * "Exportar Respostas para Excel": uma linha por resposta de cada checklist
 * do filtro, contra uma linha por checklist do "Exportar para Excel" ao lado.
 * Mesmo RLS da tela -- `pode_ver_visita` (0042) recorta checklists e
 * respostas pela visita --, entao o arquivo sai com o recorte de quem pede.
 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filtros = extrairFiltros(Object.fromEntries(searchParams));

  const { linhas, truncado } = await getRespostasDoHistorico(filtros);

  if (truncado) {
    linhas.push([
      "…",
      "Resultado limitado: ajuste os filtros para reduzir o total",
      ...Array(RESPOSTAS_COLUMNS.length - 2).fill(""),
    ]);
  }

  return new Response(paraCsv(RESPOSTAS_COLUMNS, linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="respostas-do-historico-de-checklist.csv"',
    },
  });
}
