import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import { createClient } from "@/lib/supabase/server";
import { aplicarPermissoesWeb, type EventoParaRegistro } from "./regras";

export type Opcao = { value: string; label: string };

export type OpcoesDoRegistro = {
  sites: Opcao[];
  eventos: EventoParaRegistro[];
  classificacoes: Opcao[];
};

/** Sem cache: `sites` e recortado por RLS conforme quem pede. */
export async function getOpcoesDoRegistro(): Promise<OpcoesDoRegistro> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [sites, eventos, vinculos, classificacoes, permissoes, membros] = await Promise.all([
    buscarEmPaginas<{ id: number; nome: string; grupo_site_id: number; grupos_sites: { nome: string } | null }>((de, ate) =>
      supabase
        .from("sites")
        .select("id, nome, grupo_site_id, grupos_sites ( nome )")
        .eq("ativo", true)
        .order("id")
        .range(de, ate),
    ),
    supabase.from("eventos").select("id, nome, superior_id").eq("ativo", true).order("nome"),
    buscarEmPaginas<{ evento_id: number; site_id: number }>((de, ate) =>
      supabase.from("eventos_sites").select("evento_id, site_id").order("evento_id").order("site_id").range(de, ate),
    ),
    supabase.from("tipos_de_classificacao").select("id, nome").eq("ativo", true).order("nome"),
    // Permissoes de visualizacao do canal WEB (0089).
    supabase.from("evento_permissoes").select("evento_id, grupo_site_id, grupo_usuario_id").eq("canal", "WEB"),
    user
      ? supabase.from("grupos_usuarios_membros").select("grupo_id").eq("profile_id", user.id)
      : Promise.resolve({ data: [] as { grupo_id: number }[] }),
  ]);

  const sitesDoEvento = new Map<number, number[]>();
  for (const v of vinculos.linhas) sitesDoEvento.set(v.evento_id, [...(sitesDoEvento.get(v.evento_id) ?? []), v.site_id]);

  return {
    sites: sites.linhas
      .map((s) => ({ value: String(s.id), label: s.grupos_sites?.nome ? `${s.grupos_sites.nome} - ${s.nome}` : s.nome }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    eventos: aplicarPermissoesWeb(
      (eventos.data ?? []).map((e) => ({
        id: e.id,
        nome: e.nome,
        superiorId: e.superior_id,
        sites: sitesDoEvento.get(e.id) ?? [],
      })),
      (permissoes.data ?? []).map((p) => ({
        eventoId: p.evento_id,
        grupoSiteId: p.grupo_site_id,
        grupoUsuarioId: p.grupo_usuario_id,
      })),
      new Set((membros.data ?? []).map((m) => m.grupo_id)),
      new Map(sites.linhas.map((s) => [s.id, s.grupo_site_id])),
    ),
    classificacoes: (classificacoes.data ?? []).map((c) => ({ value: String(c.id), label: c.nome })),
  };
}
