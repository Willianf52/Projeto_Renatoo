import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@projeto-renatoo/shared";

/**
 * Cliente com a service_role: ignora todas as policies de RLS.
 *
 * Existe por causa das migrations 0003/0004, que dao policy de SELECT as
 * tabelas operacionais e nenhuma de escrita -- a decisao registrada la e que
 * "a importacao dos lotes ocorre no servidor com service_role, nunca a partir
 * do navegador". Este arquivo e o "no servidor" daquela frase.
 *
 * `server-only` no topo nao e decoracao: se algum import acidental puxar este
 * modulo para um Client Component, o build falha em vez de embarcar a chave
 * que da acesso irrestrito ao banco num bundle publico.
 *
 * A chave e lida sob demanda, e nao no `lib/env.ts` junto das demais: aquelas
 * sao validadas na carga do modulo e faltam em nenhum ambiente: a service_role
 * so e necessaria para a rota de importacao. Validada la, um projeto sem
 * importacao configurada nao subiria.
 */
export function createAdminClient() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) {
    throw new Error(
      "Variável de ambiente ausente: SUPABASE_SERVICE_ROLE_KEY. Veja .env.example.",
    );
  }

  return createSupabaseClient<Database>(env.supabaseUrl, chave, {
    auth: {
      // Nao ha usuario nem navegador aqui: sem sessao para persistir e sem
      // token para renovar. Ligado, o cliente tentaria gravar sessao num
      // storage que nao existe no servidor.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
