import { NextResponse, type NextRequest } from "next/server";
import { processarFilaDeEmails } from "@/lib/fila-de-emails-de-ocorrencia";
import { limitarTaxa } from "@/lib/limite-compartilhado";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { segredoConfere } from "@/lib/webhook-user-updated";

const LIMITE_DE_REQUISICOES = 5;
const JANELA_MS = 60_000;

/**
 * Rede de seguranca da fila de e-mails das ocorrencias (migration 0065), num
 * Vercel Cron Job diario (`vercel.json`): recolhe o que o aviso do banco nao
 * entregou -- pg_net sem resposta, deploy no meio, limite de taxa. Diario por
 * causa do plano da Vercel (ver `verificar-importacoes`); o caminho normal e o
 * aviso, que sai segundos depois da ocorrencia.
 */
export async function GET(request: NextRequest) {
  const idRequisicao = gerarIdDeRequisicao();

  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado) {
    erro(idRequisicao, "Cron de e-mails de ocorrência: CRON_SECRET não configurado no servidor.");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const cabecalho = request.headers.get("authorization");
  const recebido = cabecalho?.startsWith("Bearer ") ? cabecalho.slice("Bearer ".length) : null;
  if (!segredoConfere(recebido, segredoEsperado)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limite = await limitarTaxa("cron-enviar-emails-de-ocorrencia", LIMITE_DE_REQUISICOES, JANELA_MS);
  if (!limite.permitido) {
    return NextResponse.json(
      { error: "muitas requisições, tente novamente mais tarde" },
      { status: 429, headers: { "Retry-After": String(limite.tenteNovamenteEmSegundos) } },
    );
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (falha) {
    erro(idRequisicao, "Cron de e-mails de ocorrência: service_role indisponível.", falha);
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const resultado = await processarFilaDeEmails(admin, new URL(request.url).origin, idRequisicao);
  return NextResponse.json(resultado);
}
