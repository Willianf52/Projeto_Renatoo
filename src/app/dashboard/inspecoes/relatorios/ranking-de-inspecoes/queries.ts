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
    dataInicial: primeiro(params.data_inicial),
    dataFinal: primeiro(params.data_final),
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

type LeituraBruta = {
  visita_id: number;
  visitas: {
    funcionario_id: string | null;
    profiles: { nome_completo: string } | null;
  } | null;
};

/** Fuso da operacao (Brasilia), mesmo criterio das demais telas. */
const FUSO_OPERACIONAL = "-03:00";

function combinarDataHora(data: string | undefined, horaPadrao: string): string | null {
  if (!data) return null;
  return `${data}T${horaPadrao}${FUSO_OPERACIONAL}`;
}

function montarSelect(precisaTipo: boolean, precisaGrupoUsuario: boolean): string {
  return `
    visita_id,
    visitas!inner (
      funcionario_id,
      profiles ( nome_completo )
      ${precisaTipo ? ", sites!inner ( tipo_servico_id )" : ""}
      ${precisaGrupoUsuario ? ", profiles!inner ( grupos_usuarios_membros!inner ( grupo_id ) )" : ""}
    )
  `;
}

/**
 * `query: any` pelo mesmo motivo de aplicarFiltrosDeVisita em
 * registro-de-rondas/queries.ts: o cliente aqui nao carrega o generic
 * `Database`.
 */
function aplicarFiltros(query: any, filtros: Filtros) {
  let q = query;

  if (filtros.checkpoint) q = q.eq("qr_code_id", filtros.checkpoint);
  if (filtros.funcionario) q = q.eq("visitas.funcionario_id", filtros.funcionario);
  if (filtros.tipo) q = q.eq("visitas.sites.tipo_servico_id", filtros.tipo);
  if (filtros.grupoUsuario) {
    q = q.eq("visitas.profiles.grupos_usuarios_membros.grupo_id", filtros.grupoUsuario);
  }

  const inicio = combinarDataHora(filtros.dataInicial, "00:00:00");
  const fim = combinarDataHora(filtros.dataFinal, "23:59:59");
  if (inicio) q = q.gte("data_hora", inicio);
  if (fim) q = q.lte("data_hora", fim);

  return q;
}

/**
 * Conta visitas distintas por funcionario -- uma visita normalmente tem duas
 * leituras (Inicio e Termino, migration 0004), e a mesma visita nao pode
 * contar duas vezes so por ter mais de uma leitura dentro do periodo.
 * Exportada pura para ser testada com leituras fabricadas, sem mockar o
 * Supabase -- mesmo padrao de agruparEmLinhas em registro-de-rondas.
 */
export function contarPorFuncionario(leituras: LeituraBruta[]): RankingDeInspecoes {
  const visitasPorFuncionario = new Map<string, { nome: string; visitas: Set<number> }>();

  for (const leitura of leituras) {
    const funcionarioId = leitura.visitas?.funcionario_id;
    if (!funcionarioId) continue;

    const atual = visitasPorFuncionario.get(funcionarioId) ?? {
      nome: leitura.visitas?.profiles?.nome_completo ?? "",
      visitas: new Set<number>(),
    };
    atual.visitas.add(leitura.visita_id);
    visitasPorFuncionario.set(funcionarioId, atual);
  }

  const itens = Array.from(visitasPorFuncionario.entries())
    .map(([funcionarioId, { nome, visitas }]) => ({ funcionarioId, nome, quantidade: visitas.size }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, "pt-BR"));

  return { itens, total: itens.reduce((soma, item) => soma + item.quantidade, 0) };
}

export async function getRankingDeInspecoes(filtros: Filtros): Promise<RankingDeInspecoes> {
  const supabase = await createClient();

  const precisaTipo = Boolean(filtros.tipo);
  const precisaGrupoUsuario = Boolean(filtros.grupoUsuario);

  const query = aplicarFiltros(
    supabase.from("leituras").select(montarSelect(precisaTipo, precisaGrupoUsuario)),
    filtros,
  );

  const { data, error } = await query;
  if (error) throw error;

  return contarPorFuncionario((data ?? []) as unknown as LeituraBruta[]);
}
