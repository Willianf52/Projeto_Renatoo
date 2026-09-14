import { responderComMidia } from "../../../midia";
import { getCaminhoDaFoto, idValido } from "../../../queries";

/** Uma foto do checklist. O `[id]` na URL nao e enfeite -- ver
 * `getCaminhoDaFoto` para o porque de a consulta exigir os dois. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fotoId: string }> },
) {
  const { id, fotoId } = await params;
  const idNumerico = idValido(id);
  const fotoNumerico = idValido(fotoId);
  if (idNumerico === null || fotoNumerico === null) return responderComMidia(null);

  return responderComMidia(await getCaminhoDaFoto(idNumerico, fotoNumerico));
}
