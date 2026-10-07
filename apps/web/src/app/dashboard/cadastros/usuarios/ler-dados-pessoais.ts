import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { DADOS_PESSOAIS_VAZIOS, formatarCpf, formatarTelefone, type DadosPessoais } from "./dados-pessoais";

/**
 * CPF, RE, telefone e celular (migration 0068), ja formatados para o
 * formulario. Com a service_role: a tabela nao tem policy para ninguem logado
 * -- nem o GESTOR le pela API. QUEM CHAMA confere `podeAdministrarUsuarios()`
 * antes (a pagina de edicao faz isso); nao ha RLS atras desta leitura.
 *
 * Fora de `queries.ts` de proposito: aquele arquivo le com a sessao de quem
 * pede, e e importado por mais lugares -- a service_role fica so aqui.
 */
export async function getDadosPessoais(profileId: string): Promise<DadosPessoais> {
  const { data, error } = await createAdminClient()
    .from("dados_pessoais_dos_usuarios")
    .select("cpf, re, telefone, celular")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ...DADOS_PESSOAIS_VAZIOS };

  return {
    cpf: formatarCpf(data.cpf),
    re: data.re ?? "",
    telefone: formatarTelefone(data.telefone),
    celular: formatarTelefone(data.celular),
  };
}
