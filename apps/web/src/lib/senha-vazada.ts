import { createHash } from "node:crypto";

/**
 * Compensa o "Prevent use of leaked passwords" do Supabase Auth, indisponível
 * no plano Free do projeto (docs/melhorias.md #8, achado do advisor
 * `security`). Enquanto o upgrade de plano não acontece, esta checagem roda
 * na aplicação, no mesmo ponto em que `isPasswordValid` já recusa senha fora
 * da política de composição.
 *
 * Sem `server-only` no topo (diferente de `lib/supabase/admin.ts`): não há
 * segredo aqui para proteger de um bundle de cliente, só uma chamada de rede.
 * Chamada a partir de Server Action (`usuarios/actions.ts`) e de Route
 * Handler (`api/senha/verificar-vazamento`), nunca do navegador direto -- a
 * garantia de execução no servidor vem de onde a função é chamada, não do
 * módulo em si. Mesmo raciocínio documentado em `webhook-user-updated.ts`
 * para poder ser testada sem carregar um módulo `server-only`.
 *
 * k-anonymity da API do HaveIBeenPwned: só os 5 primeiros caracteres do
 * SHA-1 da senha saem desta função. O serviço devolve todos os sufixos que
 * compartilham o prefixo (algumas centenas de linhas) e a comparação do
 * sufixo completo acontece aqui -- a senha em si, e o hash completo, nunca
 * atravessam a rede.
 */
export async function senhaVazada(senha: string): Promise<boolean> {
  const hash = createHash("sha1").update(senha).digest("hex").toUpperCase();
  const prefixo = hash.slice(0, 5);
  const sufixo = hash.slice(5);

  let resposta: Response;
  try {
    resposta = await fetch(`https://api.pwnedpasswords.com/range/${prefixo}`, {
      // Cabecalho documentado da propria API: devolve um numero minimo de
      // linhas "de enchimento" mesmo para prefixos raros, para o tamanho da
      // resposta nao vazar o quao comum e o prefixo consultado.
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Falha de rede/timeout nao deve bloquear cadastro ou troca de senha --
    // e uma checagem a mais, nao a defesa principal (essa e a politica de
    // composicao, que ja rodou antes de chegar aqui).
    return false;
  }

  if (!resposta.ok) return false;

  const corpo = await resposta.text();
  return corpo
    .split("\n")
    .some((linha) => linha.trim().split(":")[0] === sufixo);
}
