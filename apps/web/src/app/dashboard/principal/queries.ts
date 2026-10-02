import { mesAnterior, montarGrade, type AtalhoFixado } from "@/lib/atalhos";
import { createClient } from "@/lib/supabase/server";
import { TELAS_DO_MENU } from "@/components/dashboard/telas-do-menu";

export type AtalhosDaPessoa = {
  /** As rotas da grade, na ordem da tela. */
  grade: string[];
  fixados: AtalhoFixado[];
  /** A leitura falhou: a grade sai na ordem padrao, e a tela avisa. */
  falhou: boolean;
};

/**
 * Os atalhos de quem esta logado. As duas leituras passam pelo RLS da 0062:
 * cada pessoa so ve os proprios fixados e o proprio uso.
 */
export async function lerAtalhos(): Promise<AtalhosDaPessoa> {
  const supabase = await createClient();
  // Depois do `createClient` (que le cookies): sob Cache Components, `new
  // Date()` so pode rodar depois de a rota ja ser dinamica.
  const { inicio, fim } = mesAnterior(new Date());

  const [fixadosLidos, usoLido] = await Promise.all([
    supabase.from("atalhos_fixados").select("rota, posicao"),
    supabase.rpc("uso_das_minhas_telas", { p_desde: inicio.toISOString(), p_ate: fim.toISOString() }),
  ]);

  const fixados = fixadosLidos.data ?? [];
  const hrefs = TELAS_DO_MENU.map((tela) => tela.href);

  return {
    grade: montarGrade(hrefs, fixados, usoLido.data ?? []),
    fixados,
    falhou: Boolean(fixadosLidos.error || usoLido.error),
  };
}
