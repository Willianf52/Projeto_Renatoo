/**
 * Piso de versao do app de campo.
 *
 * O PROBLEMA QUE ISTO RESOLVE. A migration 0036 abriu escrita direta em
 * `visitas`/`leituras` para o cargo INSPETOR, e a 0042 deu ao app um RPC
 * (`registrar_checklist`) com contrato proprio. Um aparelho que ficou para
 * tras -- inspetor que nunca atualizou, APK instalado a mao meses atras --
 * continua escrevendo com o contrato antigo, e o banco aceita enquanto as
 * colunas existirem. O estrago nao aparece como erro: aparece como dado
 * incompleto num relatorio, meses depois.
 *
 * POR QUE O PISO VEM DO SERVIDOR, E NAO DE UMA ENV DO BUNDLE. Uma
 * `EXPO_PUBLIC_VERSAO_MINIMA` seria embutida em tempo de build: o aparelho
 * velho carregaria o piso velho junto, e se aprovaria sozinho. O piso
 * precisa vir de fora do aparelho para valer alguma coisa -- dai a consulta
 * a `/api/app/versao-minima` no painel, que le a env do servidor e pode
 * subir sem tocar em nenhum APK.
 *
 * FALHA ABERTA, E ESTA E A DECISAO MAIS IMPORTANTE DO ARQUIVO. Sem rede, com
 * o painel fora do ar ou com resposta ilegivel, `consultarVersaoMinima`
 * devolve `null` e o app SEGUE. Um portao que fecha quando nao consegue
 * perguntar transformaria uma indisponibilidade do painel em 15 inspetores
 * parados no meio da ronda, que e um estrago maior do que o que ele previne.
 * O app de campo foi construido para funcionar offline; o portao nao pode ser
 * a peca que desfaz isso.
 */

/** Prazo curto: isto roda no caminho do login, com o inspetor esperando. */
const PRAZO_MS = 4_000;

/**
 * Compara duas versoes no formato `maior.menor.correcao`.
 *
 * Devolve negativo se `a` < `b`, zero se iguais, positivo se `a` > `b`.
 * Comparacao numerica por segmento, e nao de texto: `"1.10.0" > "1.9.0"` e
 * verdade em numero e mentira em ordem alfabetica, e e exatamente o degrau em
 * que um piso escrito a mao costuma falhar.
 *
 * Segmento ausente conta como zero (`"1.2"` equivale a `"1.2.0"`); segmento
 * nao numerico tambem, o que faz um sufixo de pre-release (`"1.2.3-beta"`)
 * ser tratado como a propria `1.2.3`. Suficiente para um piso: ninguem
 * publica pre-release para inspetor.
 */
export function compararVersoes(a: string, b: string): number {
  const partesA = segmentos(a);
  const partesB = segmentos(b);
  const total = Math.max(partesA.length, partesB.length);

  for (let i = 0; i < total; i += 1) {
    const diferenca = (partesA[i] ?? 0) - (partesB[i] ?? 0);
    if (diferenca !== 0) return diferenca;
  }

  return 0;
}

function segmentos(versao: string): number[] {
  return versao
    .trim()
    .split(".")
    .map((parte) => {
      const numero = Number.parseInt(parte, 10);
      return Number.isNaN(numero) ? 0 : numero;
    });
}

/**
 * O app instalado esta abaixo do piso?
 *
 * `minima` nulo significa "nao deu para perguntar" -- ver a falha aberta no
 * cabecalho. Nunca bloqueia nesse caso.
 */
export function precisaAtualizar(instalada: string, minima: string | null): boolean {
  if (!minima) return false;

  return compararVersoes(instalada, minima) < 0;
}

/**
 * Pergunta o piso ao painel.
 *
 * `urlDoPortal` e a mesma env que a tela de login ja usa para o link de
 * recuperar senha (`EXPO_PUBLIC_URL_DO_PORTAL`). Ausente, nao ha a quem
 * perguntar e o portao fica desligado -- coerente com a falha aberta, e com
 * o fato de que um app apontado para nenhum painel e um app de
 * desenvolvimento.
 *
 * `fetchImpl` existe para o teste: injetar um duble e mais honesto do que
 * mexer no `globalThis.fetch` do processo inteiro.
 */
export async function consultarVersaoMinima(
  urlDoPortal: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!urlDoPortal) return null;

  try {
    const resposta = await fetchImpl(`${urlDoPortal.replace(/\/+$/, "")}/api/app/versao-minima`, {
      signal: AbortSignal.timeout(PRAZO_MS),
    });

    if (!resposta.ok) return null;

    const corpo: unknown = await resposta.json();

    if (
      typeof corpo === "object" &&
      corpo !== null &&
      "minima" in corpo &&
      typeof (corpo as { minima: unknown }).minima === "string"
    ) {
      return (corpo as { minima: string }).minima;
    }

    return null;
  } catch {
    // Rede fora, prazo estourado, JSON quebrado: todos caem aqui, e todos
    // significam a mesma coisa para quem chama -- nao deu para perguntar.
    return null;
  }
}
