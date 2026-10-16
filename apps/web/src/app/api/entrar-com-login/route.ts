import { randomUUID } from "node:crypto";
import { createClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { LIMITE_EMAIL } from "@projeto-renatoo/shared";
import { emailDoLogin, padraoDoLogin } from "@/lib/entrar-com-login";
import { env } from "@/lib/env";
import { limitarTaxa } from "@/lib/limite-compartilhado";
import { identificarChamador } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Entrar com o login do sistema de referencia (ver `lib/entrar-com-login.ts`).
 * Chamada pelo formulario do portal e pela tela de login do app, so quando o
 * que foi digitado NAO tem formato de e-mail.
 *
 * PUBLICA, SEM SESSAO: e o proprio login. `/api/*` fica fora do matcher do
 * `proxy.ts`.
 *
 * O que ela nao entrega:
 * - o e-mail de ninguem: acha o e-mail pelo login com a service_role, entra
 *   com ele aqui dentro e devolve so os tokens da sessao;
 * - se o login existe: login desconhecido tambem passa pelo Supabase Auth,
 *   com um e-mail que nao existe, para a resposta e o tempo serem os mesmos.
 *
 * Limite por IP no balde compartilhado (0048), alem do limite do proprio
 * Supabase Auth: aqui a chamada ao Auth sai do servidor, entao o limite dele
 * por IP ve o IP da Vercel, e nao o de quem tenta.
 */

const RECUSA = "Login ou senha incorretos.";

const esquema = z.object({
  login: z.string().min(1).max(LIMITE_EMAIL),
  // 72: o bcrypt do Supabase Auth ignora o que passa disso.
  senha: z.string().min(1).max(72),
});

const semCache = { "Cache-Control": "no-store" };

const FALHOU = Symbol("falhou");

/** O e-mail de acesso do login, null se nao ha conta (ou ha duas), FALHOU se o banco nao respondeu. */
async function emailPeloLogin(login: string): Promise<string | null | typeof FALHOU> {
  const padrao = padraoDoLogin(login);
  if (padrao === null) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("profiles")
      .select("email, login")
      .ilike("login", padrao)
      .limit(10);
    return error ? FALHOU : emailDoLogin(data ?? [], login);
  } catch {
    // service_role ausente no ambiente.
    return FALHOU;
  }
}

export async function POST(request: NextRequest) {
  // Vinte tentativas por minuto por IP: um turno inteiro entrando junto pela
  // mesma rede ainda cabe, e quem testa senha em lote nao.
  const limite = await limitarTaxa(`entrar-com-login:${identificarChamador(request)}`, 20, 60_000);
  if (!limite.permitido) {
    return NextResponse.json(
      { erro: "Muitas tentativas. Aguarde um pouco e tente de novo." },
      { status: 429, headers: { ...semCache, "Retry-After": String(limite.tenteNovamenteEmSegundos) } },
    );
  }

  const corpo = esquema.safeParse(await request.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ erro: RECUSA }, { status: 401, headers: semCache });
  }
  const { login, senha } = corpo.data;

  const email = await emailPeloLogin(login);
  if (email === FALHOU) {
    return NextResponse.json(
      { erro: "Não foi possível entrar. Tente de novo." },
      { status: 503, headers: semCache },
    );
  }

  // Cliente sem sessao guardada: a sessao e de quem chamou, e vai na resposta.
  const auth = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth;
  const { data, error } = await auth.signInWithPassword({
    email: email ?? `${randomUUID()}@login.invalid`,
    password: senha,
  });

  if (error || !data.session) {
    const semConexao = error !== null && isAuthRetryableFetchError(error);
    return NextResponse.json(
      { erro: semConexao ? "Não foi possível entrar. Tente de novo." : RECUSA },
      { status: semConexao ? 503 : 401, headers: semCache },
    );
  }

  return NextResponse.json(
    { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    { headers: semCache },
  );
}
