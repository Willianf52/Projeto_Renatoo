import { baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import { extrairFiltros, getRegistroDeRondas, paraLinhaDeExportacao, TABLE_COLUMNS } from "../../queries";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  return baixarPdfDeTabela("Registro_de_Rondas.pdf", "Registro das Rondas", async () => ({
    titulo: "Registro das Rondas por Tempo de Permanência",
    colunas: TABLE_COLUMNS,
    linhas: ((await getRegistroDeRondas(filtros)) ?? []).map(paraLinhaDeExportacao),
  }));
}
