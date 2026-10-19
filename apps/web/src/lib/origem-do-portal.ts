/**
 * O endereco do portal que vai nos links dos e-mails ("Ver no portal").
 *
 * Antes era `new URL(request.url).origin`: o endereco de QUEM chamou a rota.
 * Quem chama o webhook e o banco, pelo endereco guardado no Vault desde 21/09
 * (o `...vercel.app`), e a Vercel chama o agendamento pelo dela -- entao os
 * e-mails saiam com o dominio antigo mesmo depois do `portalupservicos.com.br`
 * (achado no ensaio geral de 19/10). O link caia em outra sessao de login.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` e variavel de sistema da Vercel: o dominio
 * de producao do projeto (o proprio, quando existe, e nao o `.vercel.app`),
 * sem protocolo. Fora da Vercel (local, testes) ela nao existe e vale o
 * endereco de quem chamou, como antes.
 */
export function origemDoPortal(
  urlDaRequisicao: string,
  dominioDeProducao: string | undefined = process.env.VERCEL_PROJECT_PRODUCTION_URL,
): string {
  const dominio = dominioDeProducao?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  // So nome de host (com porta, no maximo): qualquer outra coisa e
  // configuracao estranha, e o link nao pode apontar para ela.
  if (dominio && /^[a-z0-9.-]+(:\d+)?$/i.test(dominio)) {
    return `https://${dominio}`;
  }
  return new URL(urlDaRequisicao).origin;
}
