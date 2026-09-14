import { dataValida, periodoEntreDatas } from "@/lib/data-hora";
import { filtrosParaRpc } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export type Filtros = {
  dataInicial?: string;
  dataFinal?: string;
  checkpoint?: string;
  funcionario?: string;
  grupoUsuario?: string;
  tipo?: string;
};

export function extrairFiltros(params: SearchParams): Filtros {
  return {
    dataInicial: dataValida(primeiro(params.data_inicial)),
    dataFinal: dataValida(primeiro(params.data_final)),
    checkpoint: primeiro(params.checkpoint),
    funcionario: primeiro(params.funcionario),
    grupoUsuario: primeiro(params.grupo_usuario),
    tipo: primeiro(params.tipo),
  };
}

export type Opcao = { value: string; label: string };

export type OpcoesFiltros = {
  checkpoints: Opcao[];
  funcionarios: Opcao[];
  gruposUsuarios: Opcao[];
  tipos: Opcao[];
};

function toOptions<T extends Record<string, unknown>>(
  rows: T[] | null,
  idKey: keyof T,
  labelKey: keyof T,
): Opcao[] {
  return (rows ?? []).map((row) => ({
    value: String(row[idKey]),
    label: String(row[labelKey]),
  }));
}

/** Sem cache manual (mesmo motivo de registro-de-rondas/queries.ts):
 * `funcionarios` e `gruposUsuarios` sao recortados por RLS conforme quem
 * pede. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();

  const [checkpoints, funcionarios, gruposUsuarios, tipos] = await Promise.all([
    supabase.from("qr_codes").select("id, codigo").eq("ativo", true).order("codigo"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
    supabase.from("tipos_servico").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  return {
    checkpoints: toOptions(checkpoints.data, "id", "codigo"),
    funcionarios: toOptions(funcionarios.data, "id", "nome_completo"),
    gruposUsuarios: toOptions(gruposUsuarios.data, "id", "nome"),
    tipos: toOptions(tipos.data, "id", "nome"),
  };
}

export type ItemRanking = {
  funcionarioId: string;
  nome: string;
  quantidade: number;
};

export type RankingDeInspecoes = {
  itens: ItemRanking[];
  total: number;
};

/** Uma linha de `relatorio_ranking_de_inspecoes` (migration 0049). */
export type RankingDoBanco = { funcionario_id: string; nome: string; quantidade: number };

/**
 * Contagens do banco -> ranking da tela: maior quantidade primeiro, empate
 * desempatado por nome em pt-BR, e o Total de Inspecoes.
 *
 * A contagem de visitas DISTINTAS (uma visita com Inicio e Termino conta uma
 * vez) mora no banco desde a 0049. Pura, para ser testada sem mockar o
 * Supabase.
 */
export function ordenarRanking(linhas: RankingDoBanco[]): RankingDeInspecoes {
  const itens = linhas
    .map((linha) => ({ funcionarioId: linha.funcionario_id, nome: linha.nome, quantidade: linha.quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, "pt-BR"));

  return { itens, total: itens.reduce((soma, item) => soma + item.quantidade, 0) };
}

/**
 * null quando o periodo (Data Inicial/Final) nao foi informado -- mesmo gate
 * de `horas-por-usuario` e `mapa-de-locais-inspecionados`.
 *
 * Antes deste gate a tela abria varrendo `leituras` desde o primeiro registro
 * e exibia um ranking "de sempre" que ninguem pediu. Com a contagem no banco
 * o custo caiu, mas a pergunta continua sem sentido sem periodo -- o gate
 * fica.
 */
export async function getRankingDeInspecoes(filtros: Filtros): Promise<RankingDeInspecoes | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const supabase = await createClient();
  const { inicio, fim } = periodoEntreDatas(filtros.dataInicial, filtros.dataFinal);

  // Uma linha por funcionario: nunca chega perto do `max_rows`, sem paginacao.
  const { data, error } = await supabase.rpc("relatorio_ranking_de_inspecoes", {
    p_inicio: inicio,
    p_fim: fim,
    p_filtros: filtrosParaRpc({
      checkpoint: filtros.checkpoint,
      funcionario: filtros.funcionario,
      tipo_servico: filtros.tipo,
      grupo_usuario: filtros.grupoUsuario,
    }),
  });

  if (error) throw error;

  return ordenarRanking((data ?? []) as RankingDoBanco[]);
}
