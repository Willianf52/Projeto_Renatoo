import { createClient } from "@/lib/supabase/server";

/**
 * Metas de visita por pessoa, lugar e periodo (0105/0106). O progresso vem de
 * `progresso_das_metas`, security invoker: conta so o que quem pede enxerga.
 */

export type Opcao = { value: string; label: string };

export type LinhaDeMeta = {
  id: number;
  usuarioNome: string;
  siteNome: string;
  periodo: string;
  meta: number;
  feitas: number;
  inicio: string | null;
  fim: string | null;
  ativo: boolean;
};

const ORDEM_DO_PERIODO: Record<string, number> = { DIARIA: 0, SEMANAL: 1, QUINZENAL: 2, MENSAL: 3 };

export async function getMetas(): Promise<LinhaDeMeta[]> {
  const supabase = await createClient();
  const [metas, progresso] = await Promise.all([
    supabase.from("metas_de_visita").select("id, usuario_id, site_id, periodo, quantidade, ativo"),
    supabase.rpc("progresso_das_metas"),
  ]);
  if (metas.error) throw new Error(`Metas: falha ao listar: ${metas.error.message}`);

  const lista = metas.data ?? [];
  const porMeta = new Map((progresso.data ?? []).map((p) => [p.meta_id, p]));

  const pessoas = [...new Set(lista.map((m) => m.usuario_id))];
  const sites = [...new Set(lista.map((m) => m.site_id))];
  const [nomesDePessoas, nomesDeSites] = await Promise.all([
    pessoas.length ? supabase.from("profiles").select("id, nome_completo").in("id", pessoas) : Promise.resolve({ data: [] }),
    sites.length ? supabase.from("sites").select("id, nome").in("id", sites) : Promise.resolve({ data: [] }),
  ]);
  const pessoa = new Map((nomesDePessoas.data ?? []).map((p) => [p.id, p.nome_completo ?? ""]));
  const site = new Map((nomesDeSites.data ?? []).map((s) => [s.id, s.nome]));

  return lista
    .map((m) => {
      const p = porMeta.get(m.id);
      return {
        id: m.id,
        usuarioNome: pessoa.get(m.usuario_id) ?? "",
        siteNome: site.get(m.site_id) ?? "",
        periodo: m.periodo,
        meta: m.quantidade,
        feitas: p?.feitas ?? 0,
        inicio: p?.inicio ?? null,
        fim: p?.fim ?? null,
        ativo: m.ativo,
      };
    })
    .sort(
      (a, b) =>
        a.usuarioNome.localeCompare(b.usuarioNome, "pt-BR") ||
        a.siteNome.localeCompare(b.siteNome, "pt-BR") ||
        (ORDEM_DO_PERIODO[a.periodo] ?? 9) - (ORDEM_DO_PERIODO[b.periodo] ?? 9),
    );
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
