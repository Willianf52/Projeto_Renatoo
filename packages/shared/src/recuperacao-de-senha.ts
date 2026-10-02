/**
 * "Perdeu sua Senha?" no web e no app: quando a resposta pode deixar de ser
 * a confirmacao unica (02/10/2026).
 *
 * A regra geral continua -- com ou sem conta, a mesma frase, para a tela nao
 * virar um verificador de quem tem cadastro. A excecao e o limite de envio
 * do PROJETO (`over_email_send_rate_limit`, ~2 e-mails por hora no envio
 * padrao do Supabase): ele vale para todo mundo, entao avisar nao diz nada
 * sobre o e-mail digitado. Sem o aviso, a pessoa via "enviado", esperava um
 * e-mail que nunca chegaria e pedia de novo.
 *
 * O limite POR USUARIO (`over_request_rate_limit`, o intervalo minimo entre
 * pedidos do mesmo e-mail) fica de fora de proposito: ele so dispara para
 * e-mail que existe, e avisar entregaria justamente essa informacao.
 */
export const AVISO_DE_LIMITE_DE_EMAIL =
  "Muitos pedidos de recuperação agora. Tente de novo em alguns minutos.";

export function eLimiteDeEnvioDoProjeto(erro: { code?: string } | null | undefined): boolean {
  return erro?.code === "over_email_send_rate_limit";
}
