/**
 * Pede ao portal o link do PDF de um checklist (botao "Baixar PDF", 18/11/2026).
 *
 * O PDF e montado no portal, o mesmo do Historico e do aviso por e-mail. O
 * app manda o proprio token; o portal confere pelo RLS que a pessoa enxerga o
 * checklist e devolve um link assinado que vale poucos minutos, que o
 * navegador do celular abre sem login (ver `apps/web/src/lib/link-do-pdf.ts`).
 *
 * Sem `react-native` aqui, de proposito: este modulo e testado no vitest.
 * Quem abre o link e `abrir-pdf.ts`.
 */

const PRAZO_MS = 20_000;

export type ResultadoDoLink = { ok: true; url: string } | { ok: false; erro: string };

const SEM_INTERNET = "Não foi possível falar com o portal. Verifique a internet e tente de novo.";

export async function pedirLinkDoPdf(
  urlDoPortal: string | undefined,
  checklistId: number,
  token: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoDoLink> {
  if (!urlDoPortal) return { ok: false, erro: "O endereço do portal não está configurado neste app." };
  if (!token) return { ok: false, erro: "Sua sessão expirou. Entre de novo no app." };

  try {
    const resposta = await fetchImpl(
      `${urlDoPortal.replace(/\/+$/, "")}/api/app/checklists/${checklistId}/link-do-pdf`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(PRAZO_MS),
      },
    );

    if (resposta.status === 401) return { ok: false, erro: "Sua sessão expirou. Entre de novo no app." };
    if (resposta.status === 404) return { ok: false, erro: "Este checklist não foi encontrado no portal." };
    if (resposta.status === 429) return { ok: false, erro: "Muitas tentativas. Aguarde um minuto e tente de novo." };
    if (!resposta.ok) return { ok: false, erro: "Não foi possível gerar o PDF agora. Tente de novo." };

    const corpo: unknown = await resposta.json();
    const url = typeof corpo === "object" && corpo !== null ? (corpo as { url?: unknown }).url : undefined;
    // So abre endereco do proprio portal: um corpo estranho nao vira um link
    // qualquer aberto no celular.
    if (typeof url !== "string" || !url.startsWith(urlDoPortal.replace(/\/+$/, "") + "/api/app/pdf/")) {
      return { ok: false, erro: "Não foi possível gerar o PDF agora. Tente de novo." };
    }
    return { ok: true, url };
  } catch {
    // Sem rede, prazo estourado ou JSON quebrado: para o inspetor e tudo
    // "nao deu agora".
    return { ok: false, erro: SEM_INTERNET };
  }
}
