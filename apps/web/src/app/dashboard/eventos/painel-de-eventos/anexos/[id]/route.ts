import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { eImagem, tipoPorExtensao } from "../../andamentos";
import { getAnexo } from "../../queries";
import { idNaUrl } from "@/lib/id-na-url";

const BUCKET = "ocorrencias";

/**
 * Entrega um anexo de ocorrencia (0064) pela PROPRIA origem, sob a sessao de
 * quem pede -- o mesmo desenho e os mesmos motivos de
 * `checklistlab/historico-de-checklist/midia.ts`: sem URL assinada para vazar,
 * e a policy do bucket reavaliada a cada requisicao.
 *
 * O CONTENT-TYPE SAI DA EXTENSAO DO CAMINHO, nunca do objeto: o tipo viaja
 * como argumento de quem enviou, e servir o que ele declarou executaria HTML
 * no origin do painel, com a sessao da gestao junto. Imagem aparece na aba;
 * PDF, zip e planilha viram download, que e o que o `nosniff` global exige.
 * "Nao existe", "nao e sua" e "tipo recusado" respondem a mesma coisa.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNumerico = idNaUrl(id);
  if (idNumerico === null) return naoEncontrado();

  const anexo = await getAnexo(idNumerico);
  if (!anexo) return naoEncontrado();

  const tipo = tipoPorExtensao(anexo.caminho);
  if (!tipo) {
    erro(gerarIdDeRequisicao(), `Anexo de ocorrência com extensão fora da lista recusado: ${anexo.caminho}`);
    return naoEncontrado();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(anexo.caminho);
  if (error || !data) return naoEncontrado();

  const nome = encodeURIComponent(anexo.nome);
  return new Response(data, {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `${eImagem(tipo) ? "inline" : "attachment"}; filename*=UTF-8''${nome}`,
      // Dado pessoal: nada de cache compartilhado.
      "Cache-Control": "private, max-age=60",
    },
  });
}

function naoEncontrado(): Response {
  return new Response("Não encontrado", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
