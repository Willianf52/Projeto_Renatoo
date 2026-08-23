/**
 * Chamada pelo navegador em `nova-senha/page.tsx` e `trocar-senha/page.tsx`,
 * antes de `supabase.auth.updateUser`. A rota (`api/senha/verificar-vazamento`)
 * é quem fala com o HaveIBeenPwned -- ver o raciocínio lá.
 *
 * Falha aberta de propósito (rede indisponível, rota fora do ar, resposta
 * inesperada): é uma checagem a mais, não a política de composição, que já
 * rodou antes desta função ser chamada. Bloquear a troca de senha por causa
 * dela seria trocar uma checagem extra por uma indisponibilidade nova.
 */
export async function verificarSenhaVazada(senha: string): Promise<boolean> {
  try {
    const resposta = await fetch("/api/senha/verificar-vazamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha }),
      signal: AbortSignal.timeout(3000),
    });
    if (!resposta.ok) return false;

    const dados = (await resposta.json()) as { vazada?: boolean };
    return dados.vazada === true;
  } catch {
    return false;
  }
}
