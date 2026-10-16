import { paraCsv } from "@/lib/csv";
import { podeConfigurarEventos } from "@/lib/permissoes";
import { extrairFiltros, getAnalitico, paraLinhasDeExportacao, TABLE_COLUMNS } from "../../queries";

/**
 * "Exportar para Excel": CSV com os mesmos filtros da tela. Sem periodo, so o
 * cabecalho -- a mesma resposta da tela ("Selecione um período").
 */
export async function GET(request: Request) {
  // Tela so do GESTOR (`layout.tsx`); rota de API nao passa pelo layout.
  if (!(await podeConfigurarEventos())) {
    return new Response("Sem permissão.", { status: 403 });
  }
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  const linhas = await getAnalitico(filtros, new Date());

  return new Response(paraCsv(TABLE_COLUMNS, linhas ? paraLinhasDeExportacao(linhas) : []), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="analitico-de-eventos.csv"',
    },
  });
}
