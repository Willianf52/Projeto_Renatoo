import { paraXlsx } from "@/lib/xlsx";
import {
  COLUNAS_DO_EXCEL,
  TETO_DO_HISTORICO,
  extrairFiltros,
  getHistorico,
  getRegionais,
  hojeNoFuso,
  paramsDaUrl,
  toLinhaDoExcel,
} from "../../queries";

/**
 * "Exportar para Excel" desta tela: planilha .xlsx com as 17 colunas do
 * antigo, os mesmos filtros da listagem e sem a paginacao. A leitura continua
 * sob o mesmo RLS da tela -- `pode_ver_visita` (0042) recorta os checklists
 * pela visita a que pertencem, entao o arquivo sai com o mesmo recorte que a
 * pessoa ve na tela.
 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filtros = extrairFiltros(paramsDaUrl(searchParams));

  const historico = await getHistorico(filtros);
  const regionais = await getRegionais(
    historico.linhas.map((linha) => linha.siteId).filter((id): id is number => id !== null),
  );
  const linhas: (string | number)[][] = historico.linhas.map((linha) =>
    toLinhaDoExcel(linha, linha.siteId === null ? "" : (regionais.get(linha.siteId) ?? "")),
  );

  if (historico.truncado) {
    linhas.push([
      "…",
      `Resultado limitado aos primeiros ${TETO_DO_HISTORICO}: ajuste os filtros para reduzir o total`,
    ]);
  }

  return new Response(Buffer.from(paraXlsx(COLUNAS_DO_EXCEL, linhas)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // O mesmo nome do antigo, menos o codigo de cliente de la.
      "Content-Disposition": `attachment; filename="checklistlab_${hojeNoFuso()}.xlsx"`,
    },
  });
}
