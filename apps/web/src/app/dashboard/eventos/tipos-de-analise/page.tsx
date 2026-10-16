import { ListaDeTipos } from "../_tipos/telas";

export default function TiposDeAnalisePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ListaDeTipos tipo="analise" searchParams={searchParams} />;
}
