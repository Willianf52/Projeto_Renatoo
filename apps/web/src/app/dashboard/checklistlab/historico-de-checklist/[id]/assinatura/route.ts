import { responderComMidia } from "../../midia";
import { getCaminhoDaAssinatura, idValido } from "../../queries";

/** A assinatura do responsável no local, colhida pelo app de campo (0042). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNumerico = idValido(id);
  if (idNumerico === null) return responderComMidia(null);

  return responderComMidia(await getCaminhoDaAssinatura(idNumerico));
}
