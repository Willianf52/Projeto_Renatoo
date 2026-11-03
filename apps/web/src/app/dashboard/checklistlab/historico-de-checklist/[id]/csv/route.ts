import { paraCsv } from "@/lib/csv";
import { idNaUrl } from "@/lib/id-na-url";
import { getChecklist } from "../../queries";

const COLUNAS = ["Número/Ano", "Checklist", "Site", "Responsável", "Ordem", "Pergunta", "Resposta", "Observação"];

/**
 * "Download CSV" de cada linha do Historico, como no sistema de referencia:
 * as respostas de UM checklist, uma por linha. Passa pelo RLS de quem pede;
 * quem nao enxerga o checklist recebe 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idNaUrl((await params).id);
  const detalhe = id === null ? null : await getChecklist(id);
  if (!detalhe) return new Response(null, { status: 404 });

  const { linha } = detalhe;
  const cabeca = [linha.numeroAno, linha.modelo || linha.checklist, linha.caminhoDoSite || linha.site, linha.responsavel];
  const linhas =
    detalhe.respostas.length > 0
      ? detalhe.respostas.map((r) => [
          ...cabeca,
          r.ordem === null ? "" : String(r.ordem),
          r.pergunta,
          r.resposta,
          r.observacao ?? "",
        ])
      : // Corretiva: sem perguntas, vai o motivo digitado no lugar da observacao.
        [[...cabeca, "", "Motivo da visita corretiva", "", detalhe.motivoDaCorretiva ?? ""]];

  return new Response(paraCsv(COLUNAS, linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="checklist-${linha.numeroAno.replace("/", "-")}.csv"`,
    },
  });
}
