import { createClient } from "@/lib/supabase/server";

/**
 * O logotipo do cliente (bucket privado `cliente`, 0085), com a sessao de
 * quem pede: a policy do bucket decide quem le. Sem logotipo, 404.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: cliente } = await supabase.from("cliente").select("logotipo_path").maybeSingle();
  if (!cliente?.logotipo_path) return new Response(null, { status: 404 });

  const { data, error } = await supabase.storage.from("cliente").download(cliente.logotipo_path);
  if (error || !data) return new Response(null, { status: 404 });

  return new Response(await data.arrayBuffer(), {
    headers: {
      "Content-Type": cliente.logotipo_path.endsWith(".png") ? "image/png" : "image/jpeg",
      "Cache-Control": "private, no-store",
    },
  });
}
