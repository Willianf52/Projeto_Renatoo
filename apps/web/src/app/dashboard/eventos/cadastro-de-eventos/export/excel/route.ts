import { paraCsv } from "@/lib/csv";
import { podeConfigurarEventos } from "@/lib/permissoes";
import { COLUNAS, extrairFiltros, getEventos, paraLinhaDeExportacao } from "../../queries";

/**
 * "Exportar para Excel": CSV com o mesmo filtro da tela. E tambem o modelo do
 * Importar Eventos (`importacao.ts`), que acha as colunas pelo cabecalho.
 * E-mails so saem para o GESTOR: e o RLS de `eventos_notificacoes` (0072).
 */
export async function GET(request: Request) {
  // Tela so do GESTOR (`layout.tsx`); rota de API nao passa pelo layout.
  if (!(await podeConfigurarEventos())) {
    return new Response("Sem permissão.", { status: 403 });
  }
  const filtros = extrairFiltros(Object.fromEntries(new URL(request.url).searchParams));
  const eventos = await getEventos(filtros);

  return new Response(paraCsv(COLUNAS, eventos.map(paraLinhaDeExportacao)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cadastro-de-eventos.csv"',
    },
  });
}
