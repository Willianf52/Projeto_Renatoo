import { avisoDeCorte, baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import { extrairFiltros, getQrCodesParaExportar, toTableRow, COLUNAS_EXPORTACAO, LIMITE_EXPORTACAO } from "../../queries";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  return baixarPdfDeTabela("QR-Code.pdf", "QR-Code", async () => {
    const { rows, truncado } = await getQrCodesParaExportar(filtros);
    return {
      titulo: "QR-Code",
      colunas: COLUNAS_EXPORTACAO,
      linhas: rows.map(toTableRow),
      aviso: avisoDeCorte(truncado, LIMITE_EXPORTACAO),
    };
  });
}
