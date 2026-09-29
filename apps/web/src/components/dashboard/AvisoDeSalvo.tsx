import { ToastOnMount } from "./ToastOnMount";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Parametro que a Server Action poe na URL de volta depois de criar ou editar:
 * `redirect(\`\${LISTAGEM}?salvo=1\`)`.
 */
const PARAMETRO_DE_SALVO = "salvo";

/**
 * O "salvo com sucesso" das listagens de cadastro.
 *
 * Nasceu dentro de Grupo de Usuarios, a unica tela que confirmava o
 * salvamento; as outras cinco (Grupo de Sites, QR Code, Site / Planta,
 * Usuarios, Perguntas) voltavam para a lista em silencio, e quem salvava nao
 * tinha como saber se tinha dado certo sem procurar a linha. Compartilhado
 * para as seis dizerem a mesma coisa do mesmo jeito.
 *
 * O sinal viaja pela URL porque a Server Action roda no servidor e o toast e
 * estado de cliente (ver `ToastOnMount`). `cleanHref` preserva os outros
 * parametros (busca, pagina) e so tira o `salvo`, para um refresh nao repetir
 * o aviso.
 *
 * Vai dentro de um `<Suspense fallback={null}>`: pode legitimamente nao
 * renderizar nada, e um esqueleto no lugar dele seria um buraco que some.
 */
export async function AvisoDeSalvo({
  searchParams,
  listagem,
  mensagem,
}: {
  searchParams: Promise<SearchParams>;
  /** Caminho da listagem, para o `cleanHref` quando nao sobra parametro. */
  listagem: string;
  mensagem: string;
}) {
  const params = await searchParams;
  if (primeiro(params[PARAMETRO_DE_SALVO]) !== "1") return null;

  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (chave === PARAMETRO_DE_SALVO) continue;
    const v = primeiro(valor);
    if (v) query.set(chave, v);
  }
  const texto = query.toString();
  const cleanHref = texto ? `${listagem}?${texto}` : listagem;

  return <ToastOnMount message={mensagem} cleanHref={cleanHref} />;
}

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}
