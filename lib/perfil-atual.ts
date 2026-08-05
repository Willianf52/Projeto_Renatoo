import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Identidade e perfil de quem esta na sessao, resolvidos uma vez por requisicao.
 *
 * Existe porque a alternativa se provou ruim na pratica: cada tela que
 * precisava do usuario abria seu proprio `getUser()` + `select` em `profiles`,
 * e o custo crescia calado a cada tela nova -- eram tres consultas a mesma
 * linha numa navegacao so antes de `pode_administrar_cadastros()` e
 * `pode_ver_toda_operacao()` passarem a ser chamadas por RPC.
 *
 * O `cache()` do React memoiza por requisicao, nao entre requisicoes: dois
 * componentes do mesmo render compartilham a resposta, e a requisicao seguinte
 * comeca do zero. E o que se quer para dado de sessao -- `unstable_cache` nao
 * serve aqui nem tecnicamente (createClient() le cookies) nem semanticamente
 * (guardaria o perfil de um usuario para servir a outro).
 *
 * PARA DECIDIR PERMISSAO, NAO USE ISTO. Quem responde "pode?" sao as funcoes
 * `security definer` do banco, chamadas por RPC -- ver `pode_administrar_cadastros()`
 * em `grupo-de-sites/queries.ts`. Ler `cargo` daqui e reimplementar a regra em
 * TS recria a duplicacao entre aplicacao e SQL que aquelas chamadas
 * eliminaram. O que esta aqui serve para exibir nome e cargo na tela.
 *
 * O middleware nao participa desta deduplicacao: ele roda numa invocacao
 * separada do render, antes dele, e nenhum cache de requisicao atravessa as
 * duas. A leitura de la tem outro proposito de qualquer forma -- e o portao que
 * derruba a sessao de quem foi desativado, nao dado de exibicao.
 */

export type PerfilAtual = {
  nome_completo: string | null;
  cargo: string;
};

/** Usuario autenticado, ou null sem sessao. */
export const getUsuarioAtual = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
});

/**
 * Linha de `profiles` do usuario da sessao, ou null se nao houver sessao,
 * perfil ou leitura possivel.
 *
 * maybeSingle (nao single): o middleware ja bloqueia usuario sem perfil antes
 * de chegar aqui, entao este caso nao devia acontecer -- mas, se acontecer
 * (rota nova fora do matcher, policy quebrada), single() lancaria erro so por
 * ter zero linhas, misturando esse sinal com falha de verdade.
 *
 * Os dois casos de falha sao registrados aqui, e nao em quem chama: um
 * autenticado sempre enxerga o proprio perfil pela policy de RLS, entao falhar
 * indica policy quebrada ou perfil ausente. Sem o log, o problema fica
 * escondido atras do valor padrao que a tela exibe.
 */
export const getPerfilAtual = cache(async (): Promise<PerfilAtual | null> => {
  const user = await getUsuarioAtual();
  if (!user) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("nome_completo, cargo")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Falha ao carregar o perfil do usuário:", error.message);
    return null;
  }

  if (!data) {
    console.error(`Usuário ${user.id} autenticado sem perfil em profiles.`);
    return null;
  }

  return data;
});
