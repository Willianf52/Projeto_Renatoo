import { baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import {
  analiticoPorChecklist,
  COLUNAS_DO_ANALITICO,
  extrairFiltros,
  getChecklists,
  linhasDoAnalitico,
} from "../../../dados";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams), new Date());
  return baixarPdfDeTabela("Analitico_por_Checklist.pdf", "Analítico por Checklist", async () => ({
    titulo: "Analítico por Checklist",
    colunas: COLUNAS_DO_ANALITICO,
    linhas: linhasDoAnalitico(analiticoPorChecklist(await getChecklists(filtros))),
  }));
}
