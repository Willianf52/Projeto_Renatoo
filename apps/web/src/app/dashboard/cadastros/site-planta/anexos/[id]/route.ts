import { eImagem, tipoPorExtensao } from "@/app/dashboard/eventos/painel-de-eventos/andamentos";
import { idNaUrl } from "@/lib/id-na-url";
import { createClient } from "@/lib/supabase/server";

/**
 * Entrega um anexo do Site/Planta (0089) pela propria origem, sob a sessao de
 * quem pede -- o mesmo desenho dos anexos das ocorrencias: o tipo sai da
 * extensao do caminho (nunca do objeto), imagem abre na aba e o resto baixa.
 * "Nao existe" e "nao e seu" respondem a mesma coisa.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idNaUrl((await params).id);
  if (id === null) return naoEncontrado();

  const supabase = await createClient();
  const { data: anexo } = await supabase
    .from("site_anexos")
    .select("storage_path, nome_original")
    .eq("id", id)
    .maybeSingle();
  if (!anexo) return naoEncontrado();

  const tipo = tipoPorExtensao(anexo.storage_path);
  if (!tipo) return naoEncontrado();

  const { data, error } = await supabase.storage.from("sites").download(anexo.storage_path);
  if (error || !data) return naoEncontrado();

  return new Response(data, {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `${eImagem(tipo) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(anexo.nome_original)}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}

function naoEncontrado(): Response {
  return new Response("Não encontrado", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
