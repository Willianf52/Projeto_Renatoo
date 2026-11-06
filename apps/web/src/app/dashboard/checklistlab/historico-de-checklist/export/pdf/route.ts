import { avisoDeCorte, baixarPdfDeTabela } from "@/lib/pdf-de-tabela";
import { COLUNAS_DO_PDF, TETO_DO_HISTORICO, extrairFiltros, getHistorico, toLinhaDoPdf } from "../../queries";

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  return baixarPdfDeTabela("historico_checklist.pdf", "Histórico de Checklist", async () => {
    const historico = await getHistorico(filtros);
    return {
      titulo: "Histórico de Checklist",
      colunas: COLUNAS_DO_PDF,
      linhas: historico.linhas.map(toLinhaDoPdf),
      aviso: avisoDeCorte(historico.truncado, TETO_DO_HISTORICO),
      estilo: "simples",
      paisagem: true,
    };
  });
}
