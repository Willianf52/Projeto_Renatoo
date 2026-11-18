import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@projeto-renatoo/shared";
import { env } from "@/lib/env";
import { idNaUrl } from "@/lib/id-na-url";
import { limitarTaxa } from "@/lib/limite-compartilhado";
import { assinarLinkDoPdf, chaveDoLink } from "@/lib/link-do-pdf";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { identificarChamador } from "@/lib/rate-limit";

/**
 * O app de campo pede aqui o link do PDF de um checklist (botao "Baixar PDF",
 * 18/11/2026). Ver o raciocinio em `lib/link-do-pdf.ts`.
 *
 * QUEM PODE e o RLS que diz: a consulta ao checklist roda com o token de quem
 * pede (cliente anon + Authorization), entao so sai link de checklist que a
 * pessoa ja enxerga no app. Quem nao enxerga recebe 404, sem dizer se o
 * checklist existe.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const idRequisicao = gerarIdDeRequisicao();

  const limite = await limitarTaxa(`link-do-pdf:${identificarChamador(request)}`, 30, 60_000);
  if (!limite.permitido) {
    return NextResponse.json(
      { error: "muitas requisições, tente novamente mais tarde" },
      { status: 429, headers: { "Retry-After": String(limite.tenteNovamenteEmSegundos) } },
    );
  }

  const id = idNaUrl((await params).id);
  if (id === null) return NextResponse.json({ error: "checklist inválido" }, { status: 404 });

  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice("Bearer ".length).trim() : "";
  if (!token) return NextResponse.json({ error: "sessão ausente" }, { status: 401 });

  const supabase = createSupabaseClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: usuario, error: erroDeSessao } = await supabase.auth.getUser(token);
  if (erroDeSessao || !usuario.user) return NextResponse.json({ error: "sessão inválida" }, { status: 401 });

  const { data: checklist, error } = await supabase.from("checklists_visita").select("id").eq("id", id).maybeSingle();
  if (error) {
    erro(idRequisicao, "Link do PDF: falha ao conferir o checklist.", error);
    return NextResponse.json({ error: "não foi possível conferir o checklist" }, { status: 500 });
  }
  if (!checklist) return NextResponse.json({ error: "checklist não encontrado" }, { status: 404 });

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) {
    erro(idRequisicao, "Link do PDF: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
    return NextResponse.json({ error: "recurso não configurado no servidor" }, { status: 500 });
  }

  const url = `${request.nextUrl.origin}/api/app/pdf/${assinarLinkDoPdf(checklist.id, chaveDoLink(serviceRole))}`;
  return NextResponse.json({ url }, { headers: { "Cache-Control": "private, no-store" } });
}
