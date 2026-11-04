import { responderComMidia } from "../../../midia";
import { getCaminhoDaAssinatura, idValido } from "../../../queries";

/**
 * Uma das assinaturas do checklist, pela ordem em que foi colhida (1, 2...).
 * A rota sem `[ordem]` (`../route.ts`) continua servindo a primeira.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; ordem: string }> },
) {
  const { id, ordem } = await params;
  const idNumerico = idValido(id);
  const ordemNumerica = idValido(ordem);
  if (idNumerico === null || ordemNumerica === null) return responderComMidia(null);

  return responderComMidia(await getCaminhoDaAssinatura(idNumerico, ordemNumerica));
}
