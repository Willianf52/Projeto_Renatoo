import { NextResponse, type NextRequest } from "next/server";
import { identificarChamador, limitarTaxa } from "@/lib/rate-limit";

/**
 * Piso de versao do app de campo.
 *
 * Quem consome e `consultarVersaoMinima` em `apps/mobile/src/lib/versao-minima.ts`,
 * chamada no login: o aparelho pergunta qual a versao minima aceita e se
 * recusa a seguir se estiver abaixo dela. O raciocinio completo -- por que o
 * piso precisa vir do servidor e por que a falha e aberta -- esta escrito la.
 *
 * PUBLICA, SEM SESSAO, de proposito: a pergunta acontece ANTES do login. Um
 * app velho o bastante para ser barrado pode ser velho o bastante para nao
 * conseguir autenticar direito, e um portao que exige sessao para dizer
 * "atualize o app" nao serve para nada. O que vaza aqui e um numero de versao
 * que ja esta dentro de todo APK instalado -- nao ha segredo a proteger.
 *
 * `/api/*` fica fora do matcher do `proxy.ts`, entao nao ha redirecionamento
 * de sessao no caminho; a rota cuida de si mesma, como as outras quatro.
 *
 * SEM PISO CONFIGURADO, SEM PORTAO. `VERSAO_MINIMA_DO_APP` ausente devolve
 * `minima: null`, e o app entende isso como "nao ha piso" e segue. E o
 * estado inicial de propósito: o portao entra no ar desligado e so passa a
 * barrar quando alguem decidir um numero -- ligar uma trava por default, sem
 * ninguem ter escolhido o valor, e como se derruba uma operacao inteira num
 * deploy de sexta.
 *
 * Para subir o piso: mudar a env no projeto da Vercel e publicar. Nao mexe em
 * APK, nao passa por loja.
 */

export async function GET(request: NextRequest) {
  // Limite generoso: a chamada acontece uma vez por login, e 15 inspetores
  // entrando junto no inicio do turno nao podem esbarrar nele. O que ele
  // barra e laco -- app com bug de retry inundando a rota.
  const limite = limitarTaxa(`versao-minima:${identificarChamador(request)}`, 60, 60_000);
  if (!limite.permitido) {
    return NextResponse.json(
      { error: "muitas requisições, tente novamente mais tarde" },
      { status: 429, headers: { "Retry-After": String(limite.tenteNovamenteEmSegundos) } },
    );
  }

  const minima = process.env.VERSAO_MINIMA_DO_APP?.trim();

  return NextResponse.json(
    { minima: minima && minima.length > 0 ? minima : null },
    {
      // Cinco minutos de cache na borda: o piso muda raramente, e o inspetor
      // que abre o app tres vezes seguidas nao precisa acordar a funcao. Curto
      // o bastante para que subir o piso valha no mesmo turno.
      headers: { "Cache-Control": "public, max-age=0, s-maxage=300" },
    },
  );
}
