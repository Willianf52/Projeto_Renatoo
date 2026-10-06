import "server-only";
import { Resend } from "resend";

// Server-only por definicao: nunca importado por componente "use client",
// entao process.env.RESEND_API_KEY nao precisa (nem pode) ser NEXT_PUBLIC_.
function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}. Confira o .env.local.`);
  }
  return value;
}

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(requireServerEnv("RESEND_API_KEY"));
  }
  return resendClient;
}

/**
 * Sem dominio proprio verificado no Resend, "onboarding@resend.dev" so entrega
 * para o e-mail dono da conta Resend -- suficiente para validar o fluxo agora.
 * Trocar por um remetente do dominio da empresa quando o dominio for
 * verificado em Resend > Domains.
 */
const REMETENTE = "Up Serviços <onboarding@resend.dev>";

/**
 * Remetente dos e-mails das ocorrencias, que vao para gente de fora (contatos
 * dos sites). `EMAIL_REMETENTE` (ex.: "Up Serviços <eventos@dominio>") so
 * deve ser configurada depois do dominio verificado na Resend. Sem ela o envio
 * fica em MODO DE TESTE: remetente de teste, e so o dono da conta Resend
 * (`ALERTA_OPERACAO_EMAIL`) recebe -- o resto espera na fila (migration 0065).
 */
export function configuracaoDoRemetente(): { remetente: string; somente: string[] | null } {
  const remetente = process.env.EMAIL_REMETENTE?.trim();
  if (remetente) return { remetente, somente: null };
  const dono = process.env.ALERTA_OPERACAO_EMAIL?.trim().toLowerCase();
  return { remetente: REMETENTE, somente: dono ? [dono] : [] };
}

/**
 * Um e-mail de ocorrencia. `chave` vira a chave de idempotencia na Resend: um
 * reenvio da mesma linha da fila (a funcao caiu depois de enviar e antes de
 * marcar) nao chega duas vezes.
 */
export async function enviarEmailDeOcorrencia(mensagem: {
  remetente: string;
  para: string;
  assunto: string;
  texto: string;
  chave: string;
}): Promise<string | null> {
  const resend = getResendClient();
  const { data, error } = await resend.emails.send(
    { from: mensagem.remetente, to: mensagem.para, subject: mensagem.assunto, text: mensagem.texto },
    { idempotencyKey: mensagem.chave },
  );
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

export async function enviarAvisoSenhaAlterada(destinatario: string) {
  const resend = getResendClient();

  const { error } = await resend.emails.send({
    from: REMETENTE,
    to: destinatario,
    subject: "Sua senha foi alterada",
    text:
      "A senha da sua conta no Portal Operacional Up Serviços foi alterada agora.\n\n" +
      "Se foi você, pode ignorar este e-mail.\n\n" +
      "Se não foi você, procure o administrador do sistema imediatamente -- alguém " +
      "com acesso à sua sessão trocou sua senha.",
  });

  if (error) {
    throw new Error(`Falha ao enviar aviso de troca de senha: ${error.message}`);
  }
}

/**
 * Alerta operacional (falha de lote de importação, silêncio prolongado) --
 * ver `api/importar/coletas/route.ts` e `api/cron/verificar-importacoes/route.ts`.
 *
 * Vai para `ALERTA_OPERACAO_EMAIL`, não para quem quer que seja: sem domínio
 * verificado no Resend (ver o comentário de `REMETENTE` acima), a entrega só
 * funciona se esse endereço for o mesmo da conta Resend. Trocar por um
 * endereço de equipe (e destinatário livre) quando o domínio for verificado.
 */
export async function enviarAlertaOperacional(assunto: string, corpo: string) {
  const resend = getResendClient();
  const destinatario = requireServerEnv("ALERTA_OPERACAO_EMAIL");

  const { error } = await resend.emails.send({
    from: REMETENTE,
    to: destinatario,
    subject: assunto,
    text: corpo,
  });

  if (error) {
    throw new Error(`Falha ao enviar alerta operacional: ${error.message}`);
  }
}
