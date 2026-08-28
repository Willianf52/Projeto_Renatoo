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
 * ISTO É CONSULTA, NÃO PORTÃO -- e a distinção não é acadêmica. `updateUser`
 * vai direto ao GoTrue com a anon key: quem monta a chamada por curl ou pelo
 * console pula esta rota inteira, e nada no caminho obriga a passá-la. O
 * mesmo vale para `isPasswordValid` (`lib/password-policy.ts`, que já
 * registra isso no próprio cabeçalho). Achado M-1 da auditoria de AppSec de
 * 2026-08-28, que apontou que esta rota herdou o furo da política de
 * composição sem herdar o aviso.
 *
 * Quem de fato recusa senha vazada seria o "Prevent use of leaked passwords"
 * do Supabase Auth -- confirmado DESLIGADO em produção pelo advisor em 28/08
 * (`auth_leaked_password_protection`), porque exige plano Pro
 * (`docs/melhorias.md` #8). Enquanto o upgrade não acontece, esta checagem é
 * a única que existe, e ela cobre o caminho honesto: a pessoa que digita uma
 * senha ruim de boa-fé. Não cobre quem quer contorná-la.
 *
 * O caminho administrativo é diferente e continua sendo portão de verdade:
 * `cadastros/usuarios/actions.ts` chama `senhaVazada()` dentro de uma Server
 * Action, antes de escrever com `service_role` -- lá não há como pular.
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
