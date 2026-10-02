import { isAuthRetryableFetchError } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";

/**
 * "Esqueceu a senha?" dentro do app (pedido do dono, 02/10/2026). Antes era so
 * um link que abria o portal no navegador.
 *
 * O link do e-mail termina na `/nova-senha` do
 * portal, onde a senha nova e escolhida com a politica de senha que ja mora
 * la (`apps/web/src/app/nova-senha`). Refazer essa tela no app seria uma
 * segunda politica para desencontrar da primeira, e o link do e-mail abre no
 * navegador de qualquer jeito.
 *
 * MESMA RESPOSTA COM OU SEM CONTA, como no painel: dizer "e-mail nao
 * cadastrado" transformaria a tela num verificador de quem tem conta. A unica
 * excecao e falta de rede, que nao revela nada e o inspetor precisa saber.
 */

/** O mesmo `EMAIL_REGEX` do `FormField.tsx` do painel. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ResultadoDoPedido = { ok: true } | { ok: false; erro: string };

export function erroDoEmail(email: string): string | null {
  const valor = email.trim();
  if (!valor) return "Informe o seu e-mail.";
  if (!EMAIL_REGEX.test(valor)) return "E-mail inválido.";
  return null;
}

export async function pedirNovaSenha(
  email: string,
  urlDoPortal: string | undefined,
): Promise<ResultadoDoPedido> {
  const invalido = erroDoEmail(email);
  if (invalido) return { ok: false, erro: invalido };

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      // `/auth/sessao`, e nao `/auth/callback`: o pedido sai daqui no fluxo
      // implicito, com os tokens no fragmento do link, e so essa pagina do
      // portal os le (ver `apps/web/src/lib/sessao-do-link.ts`). Sem o
      // endereco do portal, o Supabase usa a Site URL do projeto.
      redirectTo: urlDoPortal ? `${urlDoPortal}/auth/sessao?next=/nova-senha` : undefined,
    });

    if (error && isAuthRetryableFetchError(error)) {
      return { ok: false, erro: "Sem conexão. Verifique o sinal e tente de novo." };
    }
  } catch {
    return { ok: false, erro: "Sem conexão. Verifique o sinal e tente de novo." };
  }

  return { ok: true };
}
