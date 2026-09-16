import { NextResponse, type NextRequest } from "next/server";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { limitarTaxa } from "@/lib/limite-compartilhado";
import { identificarChamador } from "@/lib/rate-limit";
import { enviarAvisoSenhaAlterada } from "@/lib/resend";
import {
  eFormatoDoWebhookAntigo,
  lerAvisoDeTrocaDeSenha,
  segredoConfere,
} from "@/lib/webhook-user-updated";

/** Mesmo raciocinio do limite em `/api/importar/coletas`. Desde a 0053 o
 * trigger so dispara em troca de senha -- nao mais a cada login --, entao o
 * uso normal fica muito abaixo disto, e o limite barra um segredo vazado sendo
 * usado para estourar a cota do Resend com e-mail. */
const LIMITE_DE_REQUISICOES = 30;
const JANELA_MS = 60_000;

/**
 * Aviso por e-mail de que a senha da conta foi trocada.
 *
 * Quem chama e o trigger `avisar_troca_de_senha` em `auth.users` (migration
 * 0053), que so dispara quando o hash da senha muda e manda so
 * `{ type, user_id, email }` -- o banco decide que houve troca; a aplicacao
 * nao recebe hash nenhum. A validacao do corpo e a comparacao do segredo
 * vivem em lib/webhook-user-updated.ts, com testes proprios.
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

  const limite = await limitarTaxa(`webhook-user-updated:${identificarChamador(request)}`, LIMITE_DE_REQUISICOES, JANELA_MS);
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

  // Webhook antigo do painel, ainda vivo ate ser apagado la: ignorado sem
  // erro. Ver `eFormatoDoWebhookAntigo`.
  if (eFormatoDoWebhookAntigo(corpo)) {
    return NextResponse.json({ skipped: "formato do webhook antigo" });
  }

  const aviso = lerAvisoDeTrocaDeSenha(corpo);
  if (!aviso) {
    return NextResponse.json({ error: "payload fora do formato esperado" }, { status: 400 });
  }

  try {
    await enviarAvisoSenhaAlterada(aviso.email);
  } catch (error) {
    erro(idRequisicao, "Webhook user-updated: falha ao enviar aviso de troca de senha.", error);
    return NextResponse.json({ error: "falha ao enviar e-mail" }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}
