import { mesAnterior, montarGrade, type AtalhoFixado } from "@/lib/atalhos";
import { createClient } from "@/lib/supabase/server";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { telasDoMenu } from "@/components/dashboard/telas-do-menu";

export type AtalhosDaPessoa = {
  /** As rotas da grade, na ordem da tela. */
  grade: string[];
  fixados: AtalhoFixado[];
  /** A leitura falhou: a grade sai na ordem padrao, e a tela avisa. */
  falhou: boolean;
  /** Quem nao e GESTOR nao ve as telas `somenteGestor`, nem para fixar. */
  ehGestor: boolean;
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

  const [fixadosLidos, usoLido, ehGestor] = await Promise.all([
    supabase.from("atalhos_fixados").select("rota, posicao"),
    supabase.rpc("uso_das_minhas_telas", { p_desde: inicio.toISOString(), p_ate: fim.toISOString() }),
    podeAdministrarUsuarios(),
  ]);

  // Fixado de tela que a pessoa nao ve (sobra de antes do recorte) sai da
  // grade, igual a fixado de tela removida do menu.
  const hrefs = telasDoMenu(ehGestor).map((tela) => tela.href);
  const fixados = (fixadosLidos.data ?? []).filter((fixado) => hrefs.includes(fixado.rota));

  return {
    grade: montarGrade(hrefs, fixados, usoLido.data ?? []),
    fixados,
    falhou: Boolean(fixadosLidos.error || usoLido.error),
    ehGestor,
  };
}
