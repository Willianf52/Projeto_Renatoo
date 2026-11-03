import { EditarTipo } from "../../../../eventos/_tipos/telas";

export default function EditarPagina({ params }: { params: Promise<{ id: string }> }) {
  return <EditarTipo tipo="alerta" params={params} />;
}
