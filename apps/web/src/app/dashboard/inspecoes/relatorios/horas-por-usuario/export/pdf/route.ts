import { baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import { extrairFiltros, getHorasPorUsuario, paraLinhaDeExportacao, TABLE_COLUMNS } from "../../queries";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  return baixarPdfDeTabela("Horas_por_Usuario.pdf", "Quantidade de Horas por Usuário", async () => ({
    titulo: "Quantidade de Horas por Usuário",
    colunas: TABLE_COLUMNS,
    linhas: ((await getHorasPorUsuario(filtros)) ?? []).map(paraLinhaDeExportacao),
  }));
}
