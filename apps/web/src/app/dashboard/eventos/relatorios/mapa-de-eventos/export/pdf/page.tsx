import { TabelaImpressao } from "@/components/dashboard/TabelaImpressao";
import {
  extrairFiltros,
  getMapaDeEventos,
  linhaDeTotal,
  paraLinhasDeExportacao,
  TABLE_COLUMNS,
  type SearchParams,
} from "../../queries";

export default async function ExportarMapaDeEventosPdfPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filtros = extrairFiltros(await searchParams);
  const mapa = await getMapaDeEventos(filtros);

  return (
    <TabelaImpressao
      titulo={`Mapa de Eventos — ${filtros.mes.split("-").reverse().join("/")}`}
      colunas={TABLE_COLUMNS}
      linhas={paraLinhasDeExportacao(mapa)}
      rodape={linhaDeTotal(mapa)}
      truncado={false}
      limite={0}
    />
  );
}
