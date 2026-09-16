import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  colunasDeExportacao,
  extrairFiltros,
  getMapaDeLocaisInspecionados,
  paraLinhaDeExportacao,
  type SearchParams,
} from "../../queries";

/**
 * Pagina de impressao: o botao da listagem a abre em aba nova (`target="_blank"`)
 * e `ImprimirAoAbrir` dispara o dialogo de impressao assim que ela monta. Nao
 * existe navegacao client-side ate aqui para ser instantanea, entao esperar a
 * consulta antes de renderizar e o comportamento certo -- um `<Suspense>` so
 * mostraria um esqueleto piscando antes do dialogo. `false` declara isso ao
 * Cache Components em vez de deixar o aviso de rota bloqueante no overlay.
 */
export const instant = false;

export default async function ExportarMapaDeLocaisInspecionadosPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const mapa = await getMapaDeLocaisInspecionados(filtros);
  const dias = mapa?.dias ?? [];
  const colunas = colunasDeExportacao(dias);
  const dados = (mapa?.linhas ?? []).map((linha) => paraLinhaDeExportacao(linha, dias));

  if (mapa?.diasExcedidos) {
    dados.push(["…", "Resultado truncado — ajuste o período para reduzir o total", ...Array(colunas.length - 2).fill("")]);
  }

  return (
    <TabelaImpressao
      titulo="Mapa de Quantidade de Locais Inspecionados"
      colunas={colunas}
      linhas={dados}
      truncado={false}
      limite={0}
    />
  );
}
