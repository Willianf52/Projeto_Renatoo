import { NextResponse, type NextRequest } from "next/server";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { identificarChamador, limitarTaxa } from "@/lib/rate-limit";
import { senhaVazada } from "@/lib/senha-vazada";
import { createClient } from "@/lib/supabase/server";

/**
 * Usada por `nova-senha/page.tsx` e `trocar-senha/page.tsx`: as duas chamam
 * `supabase.auth.updateUser({ password })` direto do navegador, sem Server
 * Action no meio (mesmo formato de `LoginForm.tsx`) -- não há um ponto no
 * servidor para checar a senha antes de `usuarios/actions.ts` existir para
 * elas. Esta rota é esse ponto, chamada antes de `updateUser`.
 *
 * Mesmo raciocínio de `api/cep`: rota fora do matcher do proxy.ts, então a
 * checagem de sessão mora aqui. `/nova-senha` é rota pública no middleware
 * (link de recuperação por e-mail, sem conta prévia no navegador), mas a
 * pessoa já tem sessão nesse ponto -- `/auth/callback` trocou o `code` por
 * sessão antes de redirecionar para lá.
 */


export async function POST(request: NextRequest) {
  const idRequisicao = gerarIdDeRequisicao();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limite = limitarTaxa(
    `senha-vazada:${identificarChamador(request)}`,
    30,
    60_000,
  );
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

  const senha = (corpo as { senha?: unknown } | null)?.senha;
  if (typeof senha !== "string" || senha === "") {
    return NextResponse.json({ error: "campo 'senha' obrigatório" }, { status: 400 });
  }

  try {
    const vazada = await senhaVazada(senha);
    return NextResponse.json({ vazada });
  } catch (falha) {
    // Nunca loga a senha em si -- só que a checagem falhou.
    erro(idRequisicao, "Verificação de senha vazada: falha inesperada.", falha);
    return NextResponse.json({ vazada: false });
  }
}
