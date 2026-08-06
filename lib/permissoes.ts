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
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("pode_administrar_cadastros");

  if (error) {
    // Falha de leitura nao vira acesso liberado: uma queda de rede aqui nega
    // por padrao.
    erro(
      gerarIdDeRequisicao(),
      "Falha ao verificar permissão de administrar cadastros:",
      error.message,
    );
    return false;
  }

  return Boolean(data);
}
