import { textoDoPeriodo } from "@/components/dashboard/TabelaImpressao";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { gerarPdfDeTabela, respostaDePdf } from "@/lib/pdf-de-tabela";
import { COLUNAS_DO_PDF, extrairFiltros, getColetasParaExportar, LIMITE_EXPORTACAO, toLinhaDoPdf } from "../../queries";

/**
 * "Exportar para PDF" de Coletas Importadas: o arquivo PDF para baixar, sem
 * abrir aba nem a janela de impressao (pedido do dono, 05/11/2026). Mesmos
 * filtros e mesmo RLS da listagem; o desenho e o da folha impressa de antes
 * ("Relatorio Coletor de Dados", como no antigo).
 */
export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  try {
    const { rows, truncado } = await getColetasParaExportar(filtros);
    const pdf = await gerarPdfDeTabela({
      titulo: "Relatório Coletor de Dados",
      apoio: textoDoPeriodo(filtros.dataInicial, filtros.dataFinal),
      colunas: COLUNAS_DO_PDF,
      // A consulta vem da mais nova para a mais antiga (a da tela); o PDF do
      // antigo lista em ordem de horario, da primeira coleta do dia em diante.
      linhas: [...rows].reverse().map(toLinhaDoPdf),
      aviso: truncado ? `Limitado aos primeiros ${LIMITE_EXPORTACAO} registros. Ajuste os filtros para reduzir o total.` : null,
    });
    return respostaDePdf(pdf, "Coletas.pdf");
  } catch (falha) {
    erro(gerarIdDeRequisicao(), "Coletas Importadas: falha ao gerar o PDF:", falha);
    return new Response("Não foi possível gerar o PDF. Tente de novo.", { status: 500 });
  }
}
