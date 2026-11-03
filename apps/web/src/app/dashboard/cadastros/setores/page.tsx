import { ListaDeTipos } from "../../eventos/_tipos/telas";

export default function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ListaDeTipos tipo="setor" searchParams={searchParams} />;
}
