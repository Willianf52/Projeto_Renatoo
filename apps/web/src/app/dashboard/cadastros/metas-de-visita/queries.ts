import { createClient } from "@/lib/supabase/server";

/**
 * Metas semanais de visita por inspetor e lugar (0105). O progresso vem de
 * `progresso_das_metas_semanais`, security invoker: conta so o que quem pede
 * enxerga.
 */

export type Opcao = { value: string; label: string };

export type LinhaDeMeta = {
  id: number;
  usuarioNome: string;
  siteNome: string;
  meta: number;
  feitas: number;
  ativo: boolean;
};

export type MetasDaSemana = { semanaInicio: string | null; linhas: LinhaDeMeta[] };

export async function getMetasDaSemana(): Promise<MetasDaSemana> {
  const supabase = await createClient();
  const [metas, progresso] = await Promise.all([
    supabase.from("metas_semanais").select("id, usuario_id, site_id, visitas_por_semana, ativo"),
    supabase.rpc("progresso_das_metas_semanais"),
  ]);
  if (metas.error) throw new Error(`Metas: falha ao listar: ${metas.error.message}`);

  const lista = metas.data ?? [];
  const feitasPorMeta = new Map((progresso.data ?? []).map((p) => [p.meta_id, p.feitas]));
  const semanaInicio = progresso.data?.[0]?.semana_inicio ?? null;

  const pessoas = [...new Set(lista.map((m) => m.usuario_id))];
  const sites = [...new Set(lista.map((m) => m.site_id))];
  const [nomesDePessoas, nomesDeSites] = await Promise.all([
    pessoas.length ? supabase.from("profiles").select("id, nome_completo").in("id", pessoas) : Promise.resolve({ data: [] }),
    sites.length ? supabase.from("sites").select("id, nome").in("id", sites) : Promise.resolve({ data: [] }),
  ]);
  const pessoa = new Map((nomesDePessoas.data ?? []).map((p) => [p.id, p.nome_completo ?? ""]));
  const site = new Map((nomesDeSites.data ?? []).map((s) => [s.id, s.nome]));

  const linhas = lista
    .map((m) => ({
      id: m.id,
      usuarioNome: pessoa.get(m.usuario_id) ?? "",
      siteNome: site.get(m.site_id) ?? "",
      meta: m.visitas_por_semana,
      feitas: feitasPorMeta.get(m.id) ?? 0,
      ativo: m.ativo,
    }))
    .sort((a, b) => a.usuarioNome.localeCompare(b.usuarioNome, "pt-BR") || a.siteNome.localeCompare(b.siteNome, "pt-BR"));

  return { semanaInicio, linhas };
}

export async function getOpcoesDoFormulario(): Promise<{ usuarios: Opcao[]; sites: Opcao[] }> {
  const supabase = await createClient();
  const [usuarios, sites] = await Promise.all([
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).neq("cargo", "CLIENTE").order("nome_completo"),
    supabase.from("sites").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  return {
    usuarios: (usuarios.data ?? []).map((p) => ({ value: p.id, label: p.nome_completo ?? "(sem nome)" })),
    sites: (sites.data ?? []).map((s) => ({ value: String(s.id), label: s.nome })),
  };
}
