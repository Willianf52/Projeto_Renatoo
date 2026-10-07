import { after, NextResponse, type NextRequest } from "next/server";
import { processarFilaDeEmailsDeChecklist } from "@/lib/fila-de-emails-de-checklist";
import { processarFilaDeEmails } from "@/lib/fila-de-emails-de-ocorrencia";
import { limitarTaxa } from "@/lib/limite-compartilhado";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { segredoConfere } from "@/lib/webhook-user-updated";

/** Uma ocorrencia por resposta "Nao conforme", e cada uma avisa: um checklist
 * com muitas no inicio do turno chega a dezenas por minuto. O limite barra um
 * segredo vazado sendo usado para martelar a rota -- quem envia e a fila, e o
 * que nao entrar agora sai na proxima chamada ou no cron diario. */
const LIMITE_DE_REQUISICOES = 120;
const JANELA_MS = 60_000;

/**
 * Aviso do banco de que ha e-mail de ocorrencia na fila (migration 0065,
 * trigger `avisar_portal_dos_emails_de_ocorrencia`).
 *
 * O corpo nao carrega dado nenhum -- so `{ type: "OCORRENCIA_EMAILS" }`. O que
 * enviar e para quem a rota le da propria fila, com a service_role: um POST
 * forjado com o segredo vazado, no maximo, adianta o envio do que ja estava
 * na fila. Mesmo segredo do aviso de troca de senha (`SUPABASE_WEBHOOK_SECRET`):
 * mesma origem, mesma aplicacao.
 *
 * Responde 202 na hora e envia depois (`after`): o pg_net espera 5 s, e o
 * lote leva mais que isso.
 */
export async function POST(request: NextRequest) {
  const idRequisicao = gerarIdDeRequisicao();

  const segredoEsperado = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!segredoEsperado) {
    erro(idRequisicao, "Webhook ocorrencia-emails: SUPABASE_WEBHOOK_SECRET não configurado no servidor.");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  if (!segredoConfere(request.headers.get("x-webhook-secret"), segredoEsperado)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limite = await limitarTaxa("webhook-ocorrencia-emails", LIMITE_DE_REQUISICOES, JANELA_MS);
  if (!limite.permitido) {
    return NextResponse.json(
      { error: "muitas requisições, tente novamente mais tarde" },
      { status: 429, headers: { "Retry-After": String(limite.tenteNovamenteEmSegundos) } },
    );
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  if (typeof corpo !== "object" || corpo === null || (corpo as { type?: unknown }).type !== "OCORRENCIA_EMAILS") {
    return NextResponse.json({ error: "payload fora do formato esperado" }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (falha) {
    erro(idRequisicao, "Webhook ocorrencia-emails: service_role indisponível.", falha);
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const origem = new URL(request.url).origin;
  // As duas filas: o aviso do banco e o mesmo para os e-mails das ocorrencias
  // (0065) e para o do checklist ao superior (0068). Uma nao segura a outra.
  after(async () => {
    try {
      await processarFilaDeEmails(admin, origem, idRequisicao);
    } catch (falha) {
      erro(idRequisicao, "Webhook ocorrencia-emails: falha ao processar a fila.", falha);
    }
    try {
      await processarFilaDeEmailsDeChecklist(admin, origem, idRequisicao);
    } catch (falha) {
      erro(idRequisicao, "Webhook ocorrencia-emails: falha ao processar a fila dos checklists.", falha);
    }
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
