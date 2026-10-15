import { ListaDeTipos } from "../_tipos/telas";

export default function TiposDeClassificacaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ListaDeTipos tipo="classificacao" searchParams={searchParams} />;
}
