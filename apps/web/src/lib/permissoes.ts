import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { erro, gerarIdDeRequisicao } from "@/lib/log";

/**
 * Permissoes consultadas pela interface para decidir entre mostrar uma acao e
 * mostra-la desabilitada. Quem autoriza de verdade e o RLS, no banco.
 *
 * Morava em `grupo-de-sites/queries.ts`, que era a unica tela a precisar
 * disto. Com a tela de Site / Planta usando a mesma regra, subiu para `lib/`
 * pelo mesmo motivo que `escaparLike` virou `lib/postgrest-escape.ts`: a
 * alternativa era a segunda tela importar de dentro da pasta da primeira.
 */

/**
 * Chama `pode_administrar_cadastros()` (migration 0009) direto via RPC, em vez
 * de reimplementar a regra em TS a partir de `cargo`/`ativo`. Antes disto a
 * lista de cargos vivia duplicada em TS e em SQL, sem nada impedindo as duas
 * de divergirem. A funcao e `security definer`, estavel e ja tem
 * `grant execute` para `authenticated`, entao chamar direto e uma fonte so e
 * um round-trip em vez de dois (`getUser()` + `select`).
 */
export async function podeAdministrarCadastros(): Promise<boolean> {
  return consultarPermissao("pode_administrar_cadastros", "administrar cadastros");
}

/**
 * Chama `pode_administrar_usuarios()` (migration 0013). Regua mais estreita
 * que a de cadastros -- so GESTOR -- porque escrever `cargo` e conceder nivel
 * de acesso; o raciocinio inteiro esta no cabecalho daquela migration.
 *
 * Aqui a checagem NAO e so cosmetica, ao contrario das demais desta lista: a
 * escrita de usuario acontece com service_role, que ignora o RLS. Nao ha
 * portao no banco atras deste -- ele e o portao. Ver
 * `usuarios/actions.ts`.
 */
export async function podeAdministrarUsuarios(): Promise<boolean> {
  return consultarPermissao("pode_administrar_usuarios", "administrar usuários");
}

/**
 * Chama `pode_administrar_grupos_usuarios()` (migration 0016): conjuncao de
 * administrar cadastro com enxergar a operacao inteira. O conteudo desse
 * cadastro e a lista de pessoas -- o raciocinio completo esta no cabecalho da
 * migration.
 */
export async function podeAdministrarGruposDeUsuarios(): Promise<boolean> {
  return consultarPermissao("pode_administrar_grupos_usuarios", "administrar grupos de usuários");
}

type FuncaoDePermissao =
  | "pode_administrar_cadastros"
  | "pode_administrar_usuarios"
  | "pode_administrar_grupos_usuarios";

/**
 * Memoizado por requisicao com `cache()` do React, mesmo mecanismo e mesmo
 * motivo de `getPerfilAtual` (lib/perfil-atual.ts).
 *
 * Passou a importar quando as telas foram fatiadas em fronteiras de
 * `<Suspense>` para o Cache Components: a barra de acoes e a coluna "Ações"
 * da tabela precisam da MESMA permissao, mas vivem em fronteiras diferentes,
 * e cada uma chamaria o RPC por conta propria. Com a memoizacao, as duas
 * dividem a resposta e o numero de round-trips continua o de antes do
 * fatiamento.
 *
 * Por requisicao, nao entre requisicoes -- e o que se quer para permissao: a
 * chave e o cargo de quem esta na sessao, e a requisicao seguinte comeca do
 * zero. Guardar entre requisicoes serviria a permissao de um usuario a outro.
 */
const consultarPermissao = cache(async function consultarPermissao(
  funcao: FuncaoDePermissao,
  descricao: string,
): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(funcao);

  if (error) {
    // Falha de leitura nao vira acesso liberado: uma queda de rede aqui nega
    // por padrao.
    erro(gerarIdDeRequisicao(), `Falha ao verificar permissão de ${descricao}:`, error.message);
    return false;
  }

  return Boolean(data);
});
