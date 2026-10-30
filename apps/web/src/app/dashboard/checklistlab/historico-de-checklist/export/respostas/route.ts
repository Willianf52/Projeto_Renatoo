import { redirect } from "next/navigation";
import { paraXlsx } from "@/lib/xlsx";
import { extrairFiltros, getRespostasDoModelo, hojeNoFuso, idValido, paramsDaUrl } from "../../queries";

/**
 * "Exportar Respostas para Excel": a planilha de respostas de UM modelo de
 * checklist (`?modelo=`), no formato do antigo -- uma linha por checklist e as
 * perguntas em colunas. Cada modelo tem perguntas proprias, entao, como no
 * antigo, sai um arquivo por modelo; sem `modelo`, volta para a lista de onde
 * se escolhe (`../escolher-modelo`).
 *
 * Mesmo RLS da tela -- `pode_ver_visita` (0042) recorta checklists e respostas
 * pela visita --, entao o arquivo sai com o recorte de quem pede.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const modeloId = idValido(url.searchParams.get("modelo") ?? "");
  if (modeloId === null) {
    url.searchParams.delete("modelo");
    const query = url.searchParams.toString();
    redirect(`/dashboard/checklistlab/historico-de-checklist/export/escolher-modelo${query ? `?${query}` : ""}`);
  }

  const filtros = extrairFiltros(paramsDaUrl(url.searchParams));
  const { colunas, linhas, truncado } = await getRespostasDoModelo(filtros, modeloId);

  if (truncado) {
    linhas.push(["…", "Resultado limitado: ajuste os filtros para reduzir o total"]);
  }

  return new Response(Buffer.from(paraXlsx(colunas, linhas)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // O mesmo nome do antigo: o id do modelo e a data.
      "Content-Disposition": `attachment; filename="perguntas_resposta_${modeloId}_${hojeNoFuso()}.xlsx"`,
    },
  });
}
