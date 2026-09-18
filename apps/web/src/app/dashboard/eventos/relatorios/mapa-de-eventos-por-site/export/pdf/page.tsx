import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  colunasDeExportacao,
  extrairFiltros,
  getMapaDeEventosPorSite,
  LIMITE_DIAS,
  paraLinhasDeExportacao,
  type SearchParams,
} from "../../queries";

export default async function ExportarMapaDeEventosPorSitePdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filtros = extrairFiltros(await searchParams);
  const mapa = await getMapaDeEventosPorSite(filtros);

  return (
    // O corte aqui e de DIAS (colunas), nao de registros -- por isso vai no
    // titulo, e nao no aviso de `truncado`, que fala em "registros".
    <TabelaImpressao
      titulo={`Mapa de Eventos por Site${mapa?.diasExcedidos ? ` (primeiros ${LIMITE_DIAS} dias do período)` : ""}`}
      colunas={colunasDeExportacao(mapa?.dias ?? [])}
      linhas={mapa && mapa.dias.length > 0 ? paraLinhasDeExportacao(mapa.raiz) : []}
      truncado={false}
      limite={0}
    />
  );
}
