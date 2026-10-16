import { EditarTipo } from "../../../_tipos/telas";

export default function EditarTiposDeAnalisePage({ params }: { params: Promise<{ id: string }> }) {
  return <EditarTipo tipo="analise" params={params} />;
}
