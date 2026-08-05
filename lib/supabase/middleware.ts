import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/** Rotas publicas: acessiveis sem sessao ativa. */
const PUBLIC_ROUTES = ["/", "/recuperar-senha", "/nova-senha", "/auth"];

const isPublicRoute = (pathname: string) =>
  PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Nao inserir logica entre createServerClient e getUser(): getUser() revalida
  // o token junto ao Supabase e é o que mantém a sessão sincronizada.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  /**
   * Expira os cookies de sessao na resposta.
   *
   * Depender apenas do signOut para isso e arriscado: se a limpeza nao
   * propagar pelo adaptador de cookies, o usuario volta autenticado na
   * requisicao seguinte, cai de novo nesta checagem e entra num laco de
   * redirecionamento -- ficando trancado para fora sem explicacao.
   */
  const limparSessao = (resposta: NextResponse) => {
    request.cookies
      .getAll()
      .filter((cookie) => cookie.name.startsWith("sb-"))
      .forEach((cookie) => resposta.cookies.delete(cookie.name));
    return resposta;
  };

  /**
   * Copia para `resposta` os cookies que getUser() renovou.
   *
   * Quando o token esta perto de expirar, getUser() troca o refresh token por
   * um par novo e o adaptador acima grava o resultado em `supabaseResponse`.
   * Um redirect criado do zero nasce sem esses cookies: o servidor ja consumiu
   * o refresh token antigo, o navegador nunca recebe o novo, e a sessao cai
   * assim que passar o intervalo de reuso do GoTrue -- de forma intermitente,
   * porque so acontece nas requisicoes que calharam de renovar.
   *
   * Nao vale para `limparSessao`: la apagar os cookies e o objetivo.
   */
  const preservarSessao = (resposta: NextResponse) => {
    supabaseResponse.cookies.getAll().forEach((cookie) => resposta.cookies.set(cookie));
    return resposta;
  };

  // O estado em auth.users indica que a pessoa autenticou, mas a aplicação
  // também respeita a desativação administrativa registrada em profiles.
  let motivoBloqueio: "acesso-indisponivel" | "perfil-ausente" | null = null;

  if (user) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("ativo")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      // Falha de leitura nao deve virar acesso liberado: bloqueia e registra.
      console.error("Middleware: falha ao consultar o perfil.", error.message);
      motivoBloqueio = "perfil-ausente";
    } else if (!profile) {
      // Autenticado em auth.users sem linha correspondente em profiles --
      // trigger que falhou ou conta anterior a migration 0001. Nao e o mesmo
      // que desativacao administrativa, e a mensagem precisa refletir isso.
      console.error(
        `Middleware: usuário ${user.id} autenticado sem perfil em profiles.`,
      );
      motivoBloqueio = "perfil-ausente";
    } else if (!profile.ativo) {
      motivoBloqueio = "acesso-indisponivel";
    }
  }

  if (motivoBloqueio) {
    await supabase.auth.signOut({ scope: "local" });

    // Se ja estamos no login exibindo este mesmo aviso, apenas limpa a sessao
    // e renderiza. Redirecionar de novo para a propria URL e o que fecharia o
    // laco caso a limpeza de cookies falhe.
    const jaSinalizado =
      pathname === "/" && request.nextUrl.searchParams.get("erro") === motivoBloqueio;

    if (jaSinalizado) {
      return limparSessao(NextResponse.next({ request }));
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("erro", motivoBloqueio);

    return limparSessao(NextResponse.redirect(redirectUrl));
  }

  if (!user && !isPublicRoute(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.searchParams.set("redirectTo", `${pathname}${request.nextUrl.search}`);
    // Aqui nao ha token para renovar, mas um refresh que falhou deixa a remocao
    // dos cookies mortos em `supabaseResponse`. Carregar isso junto evita que a
    // proxima requisicao tente de novo com o mesmo token vencido.
    return preservarSessao(NextResponse.redirect(redirectUrl));
  }

  if (user && pathname === "/") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return preservarSessao(NextResponse.redirect(redirectUrl));
  }

  return supabaseResponse;
}
