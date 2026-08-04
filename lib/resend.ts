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
