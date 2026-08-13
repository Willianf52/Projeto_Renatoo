import { NextResponse, type NextRequest } from "next/server";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { identificarChamador, limitarTaxa } from "@/lib/rate-limit";
import { enviarAvisoSenhaAlterada } from "@/lib/resend";
import {
  isEventoRelevante,
  isSenhaAlterada,
  lerPayload,
  segredoConfere,
} from "@/lib/webhook-user-updated";

/** Mesmo raciocinio do limite em `/api/importar/coletas`: o Database Webhook
 * do Supabase nao dispara isto com frequencia alta em uso normal, entao um
 * limite generoso ja barra um segredo vazado sendo usado para estourar a
 * cota do Resend com e-mail. */
const LIMITE_DE_REQUISICOES = 30;
const JANELA_MS = 60_000;

/**
 * Alvo de um Database Webhook do Supabase (Database > Webhooks) escutando
 * UPDATE em auth.users. auth.users nao expoe a senha em texto plano -- so da
 * pra perceber que ela mudou comparando o hash entre record e old_record.
 *
 * A validacao do corpo e a comparacao do segredo vivem em
 * lib/webhook-user-updated.ts, com testes proprios.
 */
export async function POST(request: NextRequest) {
  const idRequisicao = gerarIdDeRequisicao();

  const segredoEsperado = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!segredoEsperado) {
    erro(idRequisicao, "Webhook user-updated: SUPABASE_WEBHOOK_SECRET não configurado no servidor.");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  // Header combinado na configuracao do Database Webhook no Supabase --
  // sem isso, qualquer POST forjado dispararia e-mail pra qualquer endereco.
  if (!segredoConfere(request.headers.get("x-webhook-secret"), segredoEsperado)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limite = limitarTaxa(`webhook-user-updated:${identificarChamador(request)}`, LIMITE_DE_REQUISICOES, JANELA_MS);
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

  const payload = lerPayload(corpo);
  if (!payload) {
    return NextResponse.json({ error: "payload fora do formato esperado" }, { status: 400 });
  }

  if (!isEventoRelevante(payload)) {
    return NextResponse.json({ skipped: "evento não relevante" });
  }

  if (!isSenhaAlterada(payload)) {
    return NextResponse.json({ skipped: "update não alterou a senha" });
  }

  try {
    await enviarAvisoSenhaAlterada(payload.record.email);
  } catch (error) {
    erro(idRequisicao, "Webhook user-updated: falha ao enviar aviso de troca de senha.", error);
    return NextResponse.json({ error: "falha ao enviar e-mail" }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}
