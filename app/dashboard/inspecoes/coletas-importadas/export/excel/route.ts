import { paraCsv } from "@/lib/csv";
import { getColetasParaExportar, toTableRow, extrairFiltros } from "../../queries";

const TABLE_COLUMNS = [
  "Coleta",
  "Data / Hora",
  "Coletor de Dados",
  "Funcionário",
  "Local",
  "Área",
  "Evento",
  "Observação",
  "Ação",
  "Qualificador",
  "Data Integração",
];

/**
 * "Exportar para Excel" desta tela: CSV com os mesmos filtros aplicados na
 * listagem (sem paginacao). Leitura de `leituras`/`profiles` continua sob o
 * mesmo RLS da listagem -- inclusive o recorte de `profiles` por
 * `pode_ver_toda_operacao()` embutido no join com `visitas.profiles`
 * (migration 0006): quem so enxerga o proprio perfil exporta coletas com o
 * campo Funcionario vazio nas linhas que nao sao suas, nao o nome de outra
 * pessoa.
 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filtros = extrairFiltros(Object.fromEntries(searchParams));

  const { rows, truncado } = await getColetasParaExportar(filtros);
  const linhas = rows.map(toTableRow);
  if (truncado) {
    linhas.push([
      "…",
      "Resultado truncado — ajuste os filtros para reduzir o total",
      ...Array(TABLE_COLUMNS.length - 2).fill(""),
    ]);
  }

  return new Response(paraCsv(TABLE_COLUMNS, linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="coletas-importadas.csv"',
    },
  });
}
