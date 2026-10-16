import { EditarTipo } from "../../../_tipos/telas";

export default function EditarTiposDeClassificacaoPage({ params }: { params: Promise<{ id: string }> }) {
  return <EditarTipo tipo="classificacao" params={params} />;
}
