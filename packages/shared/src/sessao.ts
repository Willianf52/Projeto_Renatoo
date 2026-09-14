/**
 * Prazo maximo de uma sessao: 30 dias desde o ultimo login com senha.
 *
 * POR QUE NA APLICACAO, e nao no Supabase. O Supabase tem `timebox` e
 * `inactivity_timeout` (`[auth.sessions]` do config.toml), que o proprio
 * servidor aplicaria -- mas so no plano Pro, e o projeto fica no Free (decisao
 * de 14/09/2026). Sem limite nenhum, a sessao durava enquanto o refresh token
 * fosse sendo renovado: o cookie do painel tinha `maxAge` de 400 dias, e um
 * celular perdido ficava logado indefinidamente.
 *
 * POR QUE 30 DIAS: o inspetor digita a senha uma vez por mes, em vez de todo
 * dia em campo, e um aparelho perdido ou uma sessao exfiltrada deixa de valer
 * para sempre. Decisao de 14/09/2026 (varredura de AppSec de 31/08, item B-2).
 *
 * O LIMITE E DE CLIENTE, e isso precisa ficar escrito: quem tem o refresh
 * token e chama a API do Supabase direto, sem passar pelo painel nem pelo app,
 * continua renovando. O que esta regra fecha e o uso normal -- painel e app --,
 * que e onde uma sessao esquecida de fato e usada.
 *
 * Mora no pacote compartilhado porque painel (middleware) e app de campo
 * (SessaoProvider) aplicam a mesma regra; duas copias divergiriam.
 */
export const DIAS_MAXIMOS_DE_SESSAO = 30;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * `ultimoLoginEm` e o `last_sign_in_at` do usuario do Supabase Auth: muda no
 * login com senha e na entrada por link de recuperacao, nao na renovacao de
 * token -- e exatamente "desde quando a senha nao e digitada".
 *
 * Ausente ou ilegivel devolve `false`: sem o carimbo nao ha como medir, e
 * trancar a pessoa para fora por um campo que faltou seria pior que nao
 * aplicar o prazo naquela requisicao.
 */
export function sessaoVencida(
  ultimoLoginEm: string | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!ultimoLoginEm) return false;

  const instante = Date.parse(ultimoLoginEm);
  if (Number.isNaN(instante)) return false;

  return agora.getTime() - instante > DIAS_MAXIMOS_DE_SESSAO * MS_POR_DIA;
}
