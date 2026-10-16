import { paraCsv } from "@/lib/csv";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { analiticoPorChecklist, COLUNAS_DO_ANALITICO, extrairFiltros, getChecklists, linhasDoAnalitico } from "../../../dados";

/** "Exportar para Excel": CSV com os mesmos filtros da tela. */
export async function GET(request: Request) {
  // Tela so do GESTOR (`layout.tsx`); rota de API nao passa pelo layout.
  if (!(await podeAdministrarUsuarios())) {
    return new Response("Sem permissão.", { status: 403 });
  }
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams), new Date());
  const linhas = linhasDoAnalitico(analiticoPorChecklist(await getChecklists(filtros)));

  return new Response(paraCsv(COLUNAS_DO_ANALITICO, linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="analitico-por-checklist.csv"',
    },
  });
}
