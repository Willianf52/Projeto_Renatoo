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

/**
 * Segundos ate o "Reenviar e-mail" liberar, no web e no app (pedido do dono,
 * 23/10/2026, com um e-mail que demorava a chegar no Hotmail): o intervalo
 * minimo do Supabase entre dois pedidos do mesmo e-mail. Antes disso o pedido
 * e recusado, e a tela diria "reenviado" sem nada sair.
 */
export const INTERVALO_DE_REENVIO_EM_SEGUNDOS = 60;

/** O texto do botao de reenvio: travado com a contagem, ou livre. */
export function rotuloDoReenvio(segundosRestantes: number, enviando: boolean): string {
  if (enviando) return "Reenviando...";
  return segundosRestantes > 0 ? `Reenviar em ${segundosRestantes} s` : "Reenviar e-mail";
}
