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
      titulo={filtros.mes ? `Mapa de Eventos — ${filtros.mes.split("-").reverse().join("/")}` : "Mapa de Eventos"}
      colunas={TABLE_COLUMNS}
      linhas={mapa ? paraLinhasDeExportacao(mapa) : []}
      rodape={mapa ? linhaDeTotal(mapa) : undefined}
      truncado={false}
      limite={0}
    />
  );
}
