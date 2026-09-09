import { paraCsv } from "@/lib/csv";
import {
  TABLE_COLUMNS,
  TETO_DO_HISTORICO,
  extrairFiltros,
  getHistorico,
  toTableRow,
} from "../../queries";

/**
 * "Exportar para Excel" desta tela: CSV com os mesmos filtros aplicados na
 * listagem, sem a paginacao. A leitura continua sob o mesmo RLS da tela --
 * `pode_ver_visita` (0042) recorta os checklists pela visita a que pertencem,
 * entao o arquivo sai com o mesmo recorte que a pessoa ve na tela.
 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filtros = extrairFiltros(Object.fromEntries(searchParams));

  const historico = await getHistorico(filtros);
  const linhas = historico.linhas.map(toTableRow);

  if (historico.truncado) {
    linhas.push([
      "…",
      `Resultado limitado aos primeiros ${TETO_DO_HISTORICO} — ajuste os filtros para reduzir o total`,
      ...Array(TABLE_COLUMNS.length - 2).fill(""),
    ]);
  }

  return new Response(paraCsv(TABLE_COLUMNS, linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="historico-de-checklist.csv"',
    },
  });
}
