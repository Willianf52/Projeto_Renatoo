import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { gerarPdfUnificado } from "@/lib/pdf-do-checklist";
import { createAdminClient } from "@/lib/supabase/admin";
import { TETO_DO_PDF_UNIFICADO, extrairFiltros, getHistorico } from "../../queries";

/**
 * "Exportar para PDF Unificado": os checklists do filtro num PDF so, que baixa
 * direto, no desenho do arquivo que o sistema antigo exporta (10/11/2026).
 *
 * Os ids saem de `getHistorico` com a sessao de quem pede, entao o RLS ja
 * recortou o que a pessoa pode ver; so depois a service_role le as fotos e as
 * assinaturas do bucket privado -- o mesmo criterio do PDF de um checklist
 * (`../../[id]/pdf/route.ts`).
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));

  try {
    const historico = await getHistorico(filtros);
    const ids = historico.linhas.slice(0, TETO_DO_PDF_UNIFICADO).map((linha) => linha.id);
    const pdf = await gerarPdfUnificado(createAdminClient(), ids);

    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="pdf-unificado.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (falha) {
    erro(gerarIdDeRequisicao(), "Histórico: falha ao gerar o PDF Unificado:", falha);
    return new Response("Não foi possível gerar o PDF Unificado. Tente de novo.", { status: 500 });
  }
}
