import { createClient } from "@/lib/supabase/server";
import { quantidadeDeDatas } from "./regras";

/**
 * Leitura da "Criar Agenda" (0084). O RLS so deixa a gestao ler; quem nao
 * ve, recebe a lista vazia.
 */

export type Opcao = { value: string; label: string };

export type AgendaDaLista = {
  id: number;
  nome: string;
  modeloId: number;
  checklist: string;
  dataInicial: string;
  dataFinal: string;
  recorrencia: string;
  toleranciaDias: number;
  responsavelId: string | null;
  responsavel: string;
  grupoUsuarioId: number | null;
  grupo: string;
  ativo: boolean;
  sites: { id: number; nome: string }[];
  /** Datas da recorrencia vezes os sites: os agendamentos da agenda. */
  agendamentos: number;
};

type AgendaDoBanco = {
  id: number;
  nome: string;
  modelo_id: number;
  data_inicial: string;
  data_final: string;
  recorrencia: string;
  tolerancia_dias: number;
  responsavel_id: string | null;
  grupo_usuario_id: number | null;
  ativo: boolean;
  modelos_checklist: { nome: string } | null;
  grupos_usuarios: { nome: string } | null;
  agenda_sites: { site_id: number; sites: { nome: string } | null }[];
};

export type Situacao = "ativos" | "inativos" | "todos";

export async function listarAgendas(filtros: { situacao: Situacao; busca?: string }): Promise<AgendaDaLista[]> {
  const supabase = await createClient();
  let consulta = supabase
    .from("agendas")
    .select(
      `id, nome, modelo_id, data_inicial, data_final, recorrencia, tolerancia_dias, responsavel_id,
       grupo_usuario_id, ativo, modelos_checklist ( nome ), grupos_usuarios ( nome ),
       agenda_sites ( site_id, sites ( nome ) )`,
    )
    .order("nome");
  if (filtros.situacao === "ativos") consulta = consulta.eq("ativo", true);
  if (filtros.situacao === "inativos") consulta = consulta.eq("ativo", false);
  const { data, error } = await consulta;
  if (error) throw error;

  const linhas = (data ?? []) as unknown as AgendaDoBanco[];
  const pessoas = [...new Set(linhas.map((a) => a.responsavel_id).filter((v): v is string => Boolean(v)))];
  const nomes = new Map<string, string>();
  if (pessoas.length > 0) {
    const { data: perfis } = await supabase.from("profiles").select("id, nome_completo").in("id", pessoas);
    for (const p of perfis ?? []) nomes.set(p.id, p.nome_completo ?? "");
  }

  const termo = filtros.busca?.toLowerCase();
  return linhas
    .map((a) => ({
      id: a.id,
      nome: a.nome,
      modeloId: a.modelo_id,
      checklist: a.modelos_checklist?.nome ?? "",
      dataInicial: a.data_inicial,
      dataFinal: a.data_final,
      recorrencia: a.recorrencia,
      toleranciaDias: a.tolerancia_dias,
      responsavelId: a.responsavel_id,
      responsavel: a.responsavel_id ? (nomes.get(a.responsavel_id) ?? "") : "",
      grupoUsuarioId: a.grupo_usuario_id,
      grupo: a.grupos_usuarios?.nome ?? "",
      ativo: a.ativo,
      sites: a.agenda_sites
        .map((s) => ({ id: s.site_id, nome: s.sites?.nome ?? `Site ${s.site_id}` }))
        .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR")),
      agendamentos: quantidadeDeDatas(a.data_inicial, a.data_final, a.recorrencia) * a.agenda_sites.length,
    }))
    .filter((a) => !termo || a.nome.toLowerCase().includes(termo) || a.checklist.toLowerCase().includes(termo));
}

export async function buscarAgenda(id: number): Promise<AgendaDaLista | null> {
  const todas = await listarAgendas({ situacao: "todos" });
  return todas.find((a) => a.id === id) ?? null;
}

export type OpcoesDaAgenda = { modelos: Opcao[]; sites: Opcao[]; usuarios: Opcao[]; grupos: Opcao[] };

export async function getOpcoesDaAgenda(): Promise<OpcoesDaAgenda> {
  const supabase = await createClient();
  const [modelos, sites, usuarios, grupos] = await Promise.all([
    supabase.from("modelos_checklist").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
  ]);
  return {
    modelos: (modelos.data ?? []).map((m) => ({ value: String(m.id), label: m.nome })),
    sites: ((sites.data ?? []) as unknown as { id: number; nome: string; grupos_sites: { nome: string } | null }[]).map(
      (s) => ({ value: String(s.id), label: s.grupos_sites?.nome ? `${s.grupos_sites.nome} - ${s.nome}` : s.nome }),
    ),
    usuarios: (usuarios.data ?? []).map((u) => ({ value: u.id, label: u.nome_completo ?? "" })),
    grupos: (grupos.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
  };
}
