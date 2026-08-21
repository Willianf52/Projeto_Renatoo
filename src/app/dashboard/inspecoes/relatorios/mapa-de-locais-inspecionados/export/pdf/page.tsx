import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  colunasDeExportacao,
  extrairFiltros,
  getMapaDeLocaisInspecionados,
  paraLinhaDeExportacao,
  type SearchParams,
} from "../../queries";

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

  // Contagem incompleta e um problema diferente de dias cortados, e cada um
  // tem a sua linha: o arquivo circula sem a tela ao lado para explicar.
  if (mapa?.truncado) {
    dados.push(["…", "Contagens incompletas — reduza o período para ver os números corretos", ...Array(colunas.length - 2).fill("")]);
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
