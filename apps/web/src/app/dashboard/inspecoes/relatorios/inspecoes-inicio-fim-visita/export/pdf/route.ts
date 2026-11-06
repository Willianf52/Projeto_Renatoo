import { baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import { extrairFiltros, getInspecoesComInicioEFim, paraLinhaDeExportacao, TABLE_COLUMNS } from "../../queries";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  return baixarPdfDeTabela("Inspecoes_Inicio_e_Fim_de_Visita.pdf", "Inspeções com Início e Fim de Visita", async () => {
    const resultado = await getInspecoesComInicioEFim(filtros);
    return {
      titulo: "Relatório de Inspeções com Início e Fim de Visita",
      colunas: TABLE_COLUMNS,
      linhas: (resultado?.linhas ?? []).map(paraLinhaDeExportacao),
      aviso: resultado?.truncado ? "Resultado truncado: ajuste o período para reduzir o total." : null,
    };
  });
}
