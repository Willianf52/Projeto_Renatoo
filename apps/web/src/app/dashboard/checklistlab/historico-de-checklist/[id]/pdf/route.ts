import { idNaUrl } from "@/lib/id-na-url";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { gerarPdfDoChecklist } from "@/lib/pdf-do-checklist";
import { createAdminClient } from "@/lib/supabase/admin";
import { getChecklist } from "../../queries";

/**
 * "PDF" de cada linha do Historico, como no sistema de referencia: o PDF no
 * modelo do antigo, o mesmo que vai anexo no aviso de inspecao (0080).
 *
 * O acesso e conferido com a sessao de quem pede (`getChecklist` passa pelo
 * RLS): so depois o PDF e montado pela service_role, que le as fotos do
 * bucket privado. Quem nao enxerga o checklist recebe 404, sem oraculo de ids.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idNaUrl((await params).id);
  if (id === null || !(await getChecklist(id))) return new Response(null, { status: 404 });

  try {
    const pdf = await gerarPdfDoChecklist(createAdminClient(), id);
    if (!pdf) return new Response(null, { status: 404 });
    return new Response(Buffer.from(pdf.arquivo), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.nome}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (falha) {
    erro(gerarIdDeRequisicao(), "Histórico: falha ao gerar o PDF do checklist:", falha);
    return new Response("Não foi possível gerar o PDF. Tente de novo.", { status: 500 });
  }
}
