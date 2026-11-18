import type { NextRequest } from "next/server";
import { limitarTaxa } from "@/lib/limite-compartilhado";
import { chaveDoLink, lerLinkDoPdf } from "@/lib/link-do-pdf";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { gerarPdfDoChecklist } from "@/lib/pdf-do-checklist";
import { identificarChamador } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O PDF do checklist aberto pelo navegador do celular, a partir do link que o
 * app pediu em `/api/app/checklists/[id]/link-do-pdf` (18/11/2026). Sem sessao:
 * a assinatura do link e a prova de que quem o pediu enxerga o checklist (ver
 * `lib/link-do-pdf.ts`). O PDF e o mesmo do Historico e do aviso por e-mail.
 *
 * `inline`, e nao `attachment`: o celular mostra o PDF, e de la a pessoa
 * salva ou manda por WhatsApp pelo proprio visualizador.
 */

// Sem `export const dynamic`: com Cache Components ligado o Next recusa a
// opcao, e a rota ja e dinamica por ler o pedido (cabecalhos e parametros).

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const idRequisicao = gerarIdDeRequisicao();

  const limite = await limitarTaxa(`pdf-do-app:${identificarChamador(request)}`, 30, 60_000);
  if (!limite.permitido) {
    return new Response("Muitas tentativas. Aguarde um minuto e tente de novo.", {
      status: 429,
      headers: { "Retry-After": String(limite.tenteNovamenteEmSegundos) },
    });
  }

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) {
    erro(idRequisicao, "PDF do app: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
    return new Response("Não foi possível gerar o PDF.", { status: 500 });
  }

  const id = lerLinkDoPdf((await params).token, chaveDoLink(serviceRole));
  if (id === null) {
    return new Response("Este link venceu. Volte ao app e toque em Baixar PDF de novo.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const pdf = await gerarPdfDoChecklist(createAdminClient(), id);
    if (!pdf) return new Response("Checklist não encontrado.", { status: 404 });
    return new Response(Buffer.from(pdf.arquivo), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.nome}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (falha) {
    erro(idRequisicao, "PDF do app: falha ao gerar o PDF do checklist:", falha);
    return new Response("Não foi possível gerar o PDF. Tente de novo.", { status: 500 });
  }
}
