import { avisoDeCorte, baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import { extrairFiltros, getSitesParaExportar, toTableRow, COLUNAS_EXPORTACAO, LIMITE_EXPORTACAO } from "../../queries";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  return baixarPdfDeTabela("Site_Planta.pdf", "Site/Planta", async () => {
    const { rows, truncado } = await getSitesParaExportar(filtros);
    return {
      titulo: "Site / Planta",
      colunas: COLUNAS_EXPORTACAO,
      linhas: rows.map(toTableRow),
      aviso: avisoDeCorte(truncado, LIMITE_EXPORTACAO),
    };
  });
}
