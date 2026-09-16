import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import { extrairFiltros, getHorasPorUsuario, paraLinhaDeExportacao, TABLE_COLUMNS, type SearchParams } from "../../queries";

/**
 * Pagina de impressao: o botao da listagem a abre em aba nova (`target="_blank"`)
 * e `ImprimirAoAbrir` dispara o dialogo de impressao assim que ela monta. Nao
 * existe navegacao client-side ate aqui para ser instantanea, entao esperar a
 * consulta antes de renderizar e o comportamento certo -- um `<Suspense>` so
 * mostraria um esqueleto piscando antes do dialogo. `false` declara isso ao
 * Cache Components em vez de deixar o aviso de rota bloqueante no overlay.
 */
export const instant = false;

export default async function ExportarHorasPorUsuarioPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  // Sem aviso de truncado desde a 0049: as horas sao somadas inteiras no banco.
  const dados = ((await getHorasPorUsuario(filtros)) ?? []).map(paraLinhaDeExportacao);

  return <TabelaImpressao titulo="Quantidade de Horas por Usuário" colunas={TABLE_COLUMNS} linhas={dados} truncado={false} limite={0} />;
}
