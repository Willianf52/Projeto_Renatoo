import { NextResponse, type NextRequest } from "next/server";
import {
  calcularSilencio,
  limiteDeSilencioHoras,
  montarMensagemDeSilencio,
} from "@/lib/importacao-alerta";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { limitarTaxa } from "@/lib/rate-limit";

/**
 * Alvo de um Vercel Cron Job (`vercel.json`), rodando uma vez por dia.
 *
 * Confere se `importacoes` recebeu alguma linha nas ultimas
 * `IMPORTACAO_SILENCIO_HORAS` (padrao 24h, ver `lib/importacao-alerta.ts`) e
 * avisa por e-mail quando nao. E o outro lado do alerta de falha em
 * `api/importar/coletas/route.ts`: aquele cobre "o lote chegou e foi
 * recusado", este cobre "o lote nem chegou".
 *
 * Cadencia diaria por causa do plano Vercel: cron mais frequente que uma vez
 * ao dia exige Pro. Com o padrao de 24h os dois casam -- checar uma vez ao
 * dia contra um limite de 24h nao perde silencio nenhum.
 */
import { enviarAlertaOperacional } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { segredoConfere } from "@/lib/webhook-user-updated";


const LIMITE_DE_REQUISICOES = 5;
const JANELA_MS = 60_000;

export async function GET(request: NextRequest) {
  const idRequisicao = gerarIdDeRequisicao();

  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado) {
    erro(idRequisicao, "Verificação de silêncio de importação: CRON_SECRET não configurado no servidor.");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  // A Vercel manda `Authorization: Bearer <CRON_SECRET>` sozinha quando a
  // variavel esta configurada no projeto -- e o mecanismo documentado pra
  // proteger rota de cron. Mesma comparacao em tempo constante das demais
  // rotas autenticadas por segredo.
  const cabecalho = request.headers.get("authorization");
  const recebido = cabecalho?.startsWith("Bearer ") ? cabecalho.slice("Bearer ".length) : null;
  if (!segredoConfere(recebido, segredoEsperado)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Defesa em profundidade, mesmo com o segredo: um vazamento do CRON_SECRET
  // nao deveria virar disparo ilimitado de e-mail.
  const limite = limitarTaxa("cron-verificar-importacoes", LIMITE_DE_REQUISICOES, JANELA_MS);
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
    erro(idRequisicao, "Verificação de silêncio de importação: service_role indisponível.", falha);
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const { data: ultima, error } = await admin
    .from("importacoes")
    .select("criado_em")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    erro(idRequisicao, "Verificação de silêncio de importação: falha ao consultar `importacoes`.", error);
    return NextResponse.json({ error: "falha ao consultar o banco" }, { status: 502 });
  }

  const limiteHoras = limiteDeSilencioHoras(process.env.IMPORTACAO_SILENCIO_HORAS);
  const resultado = calcularSilencio(ultima?.criado_em ?? null, limiteHoras, Date.now());

  if (!resultado.emSilencio) {
    return NextResponse.json({ alertado: false, horas_desde_ultima: resultado.horasDesdeUltima });
  }

  try {
    await enviarAlertaOperacional(
      "Importação de coletas em silêncio",
      montarMensagemDeSilencio(resultado, limiteHoras),
    );
  } catch (falha) {
    erro(idRequisicao, "Verificação de silêncio de importação: falha ao enviar alerta.", falha);
    return NextResponse.json({ error: "falha ao enviar alerta" }, { status: 502 });
  }

  return NextResponse.json({ alertado: true, horas_desde_ultima: resultado.horasDesdeUltima });
}
