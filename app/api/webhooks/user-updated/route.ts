import { NextResponse, type NextRequest } from "next/server";
import { enviarAvisoSenhaAlterada } from "@/lib/resend";

/**
 * Alvo de um Database Webhook do Supabase (Database > Webhooks) escutando
 * UPDATE em auth.users. auth.users nao expoe a senha em texto plano -- so da
 * pra perceber que ela mudou comparando o hash entre record e old_record.
 */
type SupabaseUserWebhookPayload = {
  type: string;
  table: string;
  schema: string;
  record: { id: string; email: string; encrypted_password?: string | null };
  old_record: { id: string; email: string; encrypted_password?: string | null } | null;
};

function isSenhaAlterada(payload: SupabaseUserWebhookPayload): boolean {
  const senhaAntiga = payload.old_record?.encrypted_password;
  const senhaNova = payload.record.encrypted_password;
  return Boolean(senhaAntiga) && Boolean(senhaNova) && senhaAntiga !== senhaNova;
}

export async function POST(request: NextRequest) {
  const segredoEsperado = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!segredoEsperado) {
    console.error("Webhook user-updated: SUPABASE_WEBHOOK_SECRET não configurado no servidor.");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  // Header combinado na configuracao do Database Webhook no Supabase --
  // sem isso, qualquer POST forjado dispararia e-mail pra qualquer endereco.
  const segredoRecebido = request.headers.get("x-webhook-secret");
  if (segredoRecebido !== segredoEsperado) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as SupabaseUserWebhookPayload;

  if (payload.schema !== "auth" || payload.table !== "users" || payload.type !== "UPDATE") {
    return NextResponse.json({ skipped: "evento não relevante" });
  }

  if (!isSenhaAlterada(payload)) {
    return NextResponse.json({ skipped: "update não alterou a senha" });
  }

  try {
    await enviarAvisoSenhaAlterada(payload.record.email);
  } catch (error) {
    console.error("Webhook user-updated: falha ao enviar aviso de troca de senha.", error);
    return NextResponse.json({ error: "falha ao enviar e-mail" }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}
