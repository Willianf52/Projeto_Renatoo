import { NextResponse, type NextRequest } from "next/server";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { identificarChamador, limitarTaxa } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Proxy do ViaCEP (SiteForm.tsx, botao "Procurar CEP").
 *
 * O ViaCEP nao esta -- e nao deve estar -- em `connect-src` da CSP
 * (`lib/security-headers.ts`): a diretiva existe justamente para restringir
 * XHR do navegador ao Supabase, contendo exfiltracao caso um script hostil
 * rode na pagina algum dia. Chamar o ViaCEP direto do cliente (como o codigo
 * original fazia) ou afrouxava essa garantia adicionando um dominio externo
 * a lista, ou era bloqueado pela propria CSP -- era o segundo caso, e a
 * causa do "Nao foi possivel buscar o CEP agora" aparecendo sempre. Esta
 * rota resolve as duas coisas: o navegador so fala com `self`, e o
 * ViaCEP e chamado daqui, pelo servidor.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const idRequisicao = gerarIdDeRequisicao();

  // So para quem esta logado no dashboard -- nao e um utilitario publico.
  // `/api/*` fica fora do matcher do proxy.ts de proposito (rotas de API
  // cuidam da propria autenticacao), entao a checagem precisa estar aqui.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limite = limitarTaxa(`cep:${identificarChamador(request)}`, 30, 60_000);
  if (!limite.permitido) {
    return NextResponse.json(
      { error: "muitas requisições, tente novamente mais tarde" },
      { status: 429, headers: { "Retry-After": String(limite.tenteNovamenteEmSegundos) } },
    );
  }

  const digitos = (request.nextUrl.searchParams.get("cep") ?? "").replace(/\D/g, "");
  if (digitos.length !== 8) {
    return NextResponse.json({ error: "CEP deve ter 8 dígitos" }, { status: 400 });
  }

  let dados: { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
    dados = await resposta.json();
  } catch (falha) {
    erro(idRequisicao, "Busca de CEP: falha ao consultar o ViaCEP.", falha);
    return NextResponse.json({ error: "falha ao consultar o serviço de CEP" }, { status: 502 });
  }

  if (dados.erro) {
    return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    logradouro: dados.logradouro ?? "",
    bairro: dados.bairro ?? "",
    localidade: dados.localidade ?? "",
    uf: dados.uf ?? "",
  });
}
