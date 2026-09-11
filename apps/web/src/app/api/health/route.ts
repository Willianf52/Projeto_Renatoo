import { NextResponse, type NextRequest } from "next/server";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { identificarChamador, limitarTaxa } from "@/lib/rate-limit";
import { avaliar, envsAusentes } from "@/lib/saude";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sinal de vida do painel, para um monitor externo bater a cada poucos
 * minutos.
 *
 * O QUE ISTO RESOLVE. O unico sinal periodico que o sistema tinha era o cron
 * diario de `/api/cron/verificar-importacoes`, e ele fala sobre silencio de
 * importacao -- nao sobre o painel estar de pe. Env perdida num deploy,
 * projeto Supabase pausado por inatividade, chave rotacionada: em todos os
 * casos quem descobria era o inspetor as 6h da manha.
 *
 * PUBLICA, SEM SESSAO: monitor nao autentica. O que ela devolve foi escolhido
 * com isso em mente -- dois booleanos e um rotulo, sem nome de env, sem
 * mensagem do Postgres, sem versao de nada. Quem opera o sistema ja sabe o
 * que "banco: false" quer dizer; para quem esta de fora nao ha o que colher
 * aqui que ja nao esteja na pagina de login. O detalhe vai para o log do
 * servidor, que e onde ele serve para alguma coisa.
 *
 * O CODIGO HTTP E A INTERFACE. Monitor nenhum le JSON por padrao: eles
 * olham o status. 200 de pe, 503 fora -- e por isso que o corpo nunca e
 * negociado e o veredito nunca vira 200 com "status": "fora".
 *
 * `/api/*` fica fora do matcher do `proxy.ts`, entao nao ha redirecionamento
 * de sessao no caminho.
 */

export async function GET(request: NextRequest) {
  const idRequisicao = gerarIdDeRequisicao();

  // Generoso: um monitor a cada 5 minutos nao chega perto disto, e dois ou
  // tres monitores (mais o teste manual de quem investiga) cabem folgados. O
  // que ele barra e a rota virar alvo de inundacao por ser publica.
  const limite = limitarTaxa(`health:${identificarChamador(request)}`, 60, 60_000);
  if (!limite.permitido) {
    return NextResponse.json(
      { error: "muitas requisições, tente novamente mais tarde" },
      { status: 429, headers: { "Retry-After": String(limite.tenteNovamenteEmSegundos) } },
    );
  }

  const ausentes = envsAusentes(process.env);
  if (ausentes.length > 0) {
    // No log, nao na resposta: aqui o nome da env e o que resolve o problema,
    // e o log do servidor e leitura de quem ja tem acesso.
    erro(idRequisicao, "Health check: variáveis de ambiente obrigatórias ausentes", ausentes);
  }

  const saude = avaliar({
    banco: await bancoResponde(idRequisicao),
    envs: ausentes.length === 0,
  });

  return NextResponse.json(saude, {
    status: saude.status === "ok" ? 200 : 503,
    // Health check com cache e um health check que mente: a borda
    // devolveria "ok" de cinco minutos atras durante uma queda.
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Uma ida e volta ao Postgres, pela mesma estrada que o painel usa.
 *
 * `limit(1)` numa tabela pequena, sem `count`: o que se prova e que a URL, a
 * chave, o PostgREST e o Postgres respondem -- nao quanto tem la dentro. Um
 * `count: "exact"` custaria uma varredura a cada batida do monitor, para
 * responder uma pergunta que ninguem fez.
 *
 * Com a `service_role` e nao com o cliente da sessao porque nao HA sessao
 * aqui: um cliente anonimo esbarraria nos grants explicitos da 0038 e
 * devolveria "permission denied" -- um erro de autorizacao lido como banco
 * fora, que e exatamente o alarme falso que derruba a confianca no alerta.
 * A chave nao sai desta funcao: o que vaza para a resposta e um booleano.
 */
async function bancoResponde(idRequisicao: string): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      erro(idRequisicao, "Health check: banco não respondeu", error.message);
      return false;
    }

    return true;
  } catch (excecao) {
    // `createAdminClient` lanca sem `SUPABASE_SERVICE_ROLE_KEY`, e a camada de
    // rede rejeita com o projeto pausado. Os dois significam a mesma coisa
    // para quem monitora, e nenhum pode derrubar a propria rota de saude --
    // um health check que responde 500 nao diz se o sistema esta fora ou se
    // quem esta fora e ele.
    erro(idRequisicao, "Health check: falha ao consultar o banco", excecao);
    return false;
  }
}
