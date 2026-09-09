import "server-only";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "checklists";

/**
 * Os dois tipos que a 0046 deixou entrar no bucket. Repetidos aqui de
 * proposito, e nao lidos do banco: sao a lista do que este servidor aceita
 * DEVOLVER, que e uma decisao independente do que o Storage aceita receber --
 * se um dia o bucket passar a aceitar PDF, a tela nao deve comecar a servir
 * PDF sozinha.
 */
const TIPOS_ACEITOS = new Set(["image/png", "image/jpeg"]);

/**
 * Entrega uma imagem do bucket privado `checklists` pela PROPRIA origem.
 *
 * POR QUE NAO `createSignedUrl`. A URL assinada e um portador: quem a copia
 * do HTML abre a foto de fora da sessao, sem passar por RLS nenhum, ate
 * expirar -- e assinatura de pessoa fisica e foto de instalacao de cliente sao
 * dado pessoal (`docs/lgpd-privacidade.md`), o mesmo motivo de o bucket ser
 * privado na 0042. Servida daqui, cada byte passa pela sessao de quem pediu:
 * a policy "Leitura da midia de checklist no escopo" e reavaliada a cada
 * requisicao, e nao ha token nenhum no HTML para vazar.
 *
 * O CUSTO, dito por inteiro: a CSP deste app so autoriza imagem de `'self'`,
 * `data:` e `blob:` (`lib/security-headers.ts`). URL assinada exigiria abrir
 * `img-src` para a origem do Supabase; servir daqui nao mexe na politica.
 *
 * O CONTENT-TYPE E FORCADO, e este e o ponto mais delicado. A 0046 registra
 * que o `contentType` do objeto viaja como argumento do cliente: um inspetor
 * que monte a chamada por fora do app grava o que quiser na pasta da propria
 * visita. La o risco era HTML executando no origin do Supabase; aqui seria
 * PIOR -- executaria no origin do painel, com a sessao do gestor junto. Por
 * isso o tipo devolvido nunca e o do objeto: e o do allowlist, e o que nao
 * estiver nele vira 404 em vez de resposta.
 */
export async function responderComMidia(caminho: string | null): Promise<Response> {
  // Caminho ausente e caminho inexistente devolvem a mesma coisa: distinguir
  // os dois transformaria a rota num oraculo de "existe foto neste checklist"
  // para quem so consegue adivinhar ids.
  if (!caminho) return naoEncontrado();

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho);

  if (error || !data) return naoEncontrado();

  if (!TIPOS_ACEITOS.has(data.type)) {
    // Nao e ruido: um objeto fora do allowlist no bucket significa que algo
    // gravou por fora do app de campo, que e exatamente o cenario da 0046.
    erro(
      gerarIdDeRequisicao(),
      `Mídia de checklist com tipo inesperado (${data.type || "sem tipo"}) recusada: ${caminho}`,
    );
    return naoEncontrado();
  }

  return new Response(data, {
    headers: {
      "Content-Type": data.type,
      // `inline` para a imagem aparecer na tela em vez de baixar. Seguro
      // porque o tipo ja passou pelo allowlist acima e o `nosniff` global
      // (lib/security-headers.ts) impede o navegador de adivinhar outro.
      "Content-Disposition": "inline",
      // `private`: e dado pessoal, entao nao pode ficar em cache
      // compartilhado. O max-age curto evita rebaixar cada rolagem da galeria
      // a um download novo sem manter a imagem no disco de quem olhou depois
      // que o acesso for revogado.
      "Cache-Control": "private, max-age=60",
    },
  });
}

/** Mesma resposta para "nao existe", "nao e sua" e "tipo recusado". */
function naoEncontrado(): Response {
  return new Response("Não encontrado", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
