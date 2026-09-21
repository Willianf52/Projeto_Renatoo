import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import { extrairFiltros, getInspecoesComInicioEFim, paraLinhaDeExportacao, TABLE_COLUMNS, type SearchParams } from "../../queries";

/**
 * Pagina de impressao: o botao da listagem a abre em aba nova (`target="_blank"`)
 * e `ImprimirAoAbrir` dispara o dialogo de impressao assim que ela monta. Nao
 * existe navegacao client-side ate aqui para ser instantanea, entao esperar a
 * consulta antes de renderizar e o comportamento certo -- um `<Suspense>` so
 * mostraria um esqueleto piscando antes do dialogo. `false` declara isso ao
 * Cache Components em vez de deixar o aviso de rota bloqueante no overlay.
 */
export const instant = false;

export default async function ExportarInspecoesInicioFimVisitaPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const resultado = await getInspecoesComInicioEFim(filtros);
  const dados = (resultado?.linhas ?? []).map(paraLinhaDeExportacao);
  if (resultado?.truncado) {
    dados.push(["…", "Resultado truncado — ajuste o período para reduzir o total", ...Array(TABLE_COLUMNS.length - 2).fill("")]);
  }

  return (
    <TabelaImpressao
      titulo="Relatório de Inspeções com Início e Fim de Visita"
      colunas={TABLE_COLUMNS}
      linhas={dados}
      truncado={false}
      limite={0}
    />
  );
}
