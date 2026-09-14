import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { mesAtual, periodoDoMes } from "@/lib/data-hora";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export type Filtros = {
  /** "yyyy-mm". Sem valor -> mes atual (ver extrairFiltros). */
  mes: string;
  site?: string;
};

/** Ver `mesAtual` em lib/data-hora.ts: o fuso precisa ser explicito, senao o
 * servidor (UTC na Vercel) vira o mes tres horas antes de Brasilia. */
const MES_ATUAL = () => mesAtual();

/** Igual as demais telas: mes fora do formato yyyy-mm (ou com mes fora de
 * 01-12, tipo "2026-13") cai no mes atual em vez de virar uma consulta que
 * nunca bate com nada. */
function mesValido(valor: string | undefined): valor is string {
  if (!valor) return false;
  const encontrado = /^\d{4}-(\d{2})$/.exec(valor);
  if (!encontrado) return false;
  const mes = Number(encontrado[1]);
  return mes >= 1 && mes <= 12;
}

export function extrairFiltros(params: SearchParams): Filtros {
  const mes = primeiro(params.mes);
  return {
    mes: mesValido(mes) ? mes : MES_ATUAL(),
    site: primeiro(params.site),
  };
}

export type Opcao = { value: string; label: string };

/** Sites para o select do filtro, com o grupo no rotulo -- mesmo padrao de
 * "Grupo - Site" usado nos demais selects de site do app. */
type SiteBruto = {
  id: number;
  nome: string;
  grupos_sites: { nome: string } | null;
};

export async function getOpcoesSites(): Promise<Opcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sites")
    .select("id, nome, grupos_sites ( nome )")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    erro(gerarIdDeRequisicao(), "Falha ao carregar sites para o filtro de visitas de supervisão:", error.message);
  }

  return ((data ?? []) as unknown as SiteBruto[]).map((site) => ({
    value: String(site.id),
    label: site.grupos_sites?.nome ? `${site.grupos_sites.nome} - ${site.nome}` : site.nome,
  }));
}

export type VisitaDeSupervisao = {
  visitaId: number;
  /** Leitura mais antiga da visita (tipicamente a de "Inicio"). */
  dataHora: string | null;
  funcionario: string;
  local: string;
  temLocalizacao: boolean;
  motivoVisita: string;
  observacao: string;
};

export type HistoricoDeSupervisao = {
  meta: number | null;
  realizado: number;
  visitas: VisitaDeSupervisao[];
};

/** Uma linha de `relatorio_visitas_de_supervisao` (migration 0049). */
export type VisitaDoBanco = {
  visita_id: number;
  data_hora: string;
  funcionario: string;
  local: string;
  tem_localizacao: boolean;
  motivo_visita: string;
  observacao: string;
};

/** Linha do banco -> linha da tela. O agrupamento por visita (data da leitura
 * mais antiga; localizacao e observacao de qualquer leitura que as tenha) mora
 * no banco desde a 0049. */
export function paraVisitaDeSupervisao(linha: VisitaDoBanco): VisitaDeSupervisao {
  return {
    visitaId: linha.visita_id,
    dataHora: linha.data_hora,
    funcionario: linha.funcionario,
    local: linha.local,
    temLocalizacao: linha.tem_localizacao,
    motivoVisita: linha.motivo_visita,
    observacao: linha.observacao,
  };
}

/**
 * `site` obrigatorio: Meta e Realizado sao por site (metas_visitas.site_id),
 * entao sem site escolhido nao ha o que calcular -- ver a checagem em
 * page.tsx antes de chamar isto.
 */
export async function getHistoricoDeSupervisao(filtros: Filtros): Promise<HistoricoDeSupervisao> {
  const supabase = await createClient();

  const { inicio, fim } = periodoDoMes(filtros.mes);
  const competencia = `${filtros.mes}-01`;
  const site = Number(filtros.site);

  // Sem isto, uma falha de consulta (RLS inesperado, instabilidade de rede)
  // e indistinguivel de "realmente nao ha visita" -- a tela mostraria
  // "Nenhuma visita encontrada" nos dois casos, sem ninguem saber qual foi.
  const idRequisicao = gerarIdDeRequisicao();

  const [visitas, metaResultado] = await Promise.all([
    // Uma linha por visita de um site num mes: paginado mesmo assim, porque o
    // corte do `max_rows` e silencioso. Mais recentes primeiro, como a tela.
    buscarEmPaginas<VisitaDoBanco>((de, ate) =>
      supabase
        .rpc("relatorio_visitas_de_supervisao", { p_site: site, p_inicio: inicio, p_fim: fim })
        .order("data_hora", { ascending: false })
        .order("visita_id", { ascending: false })
        .range(de, ate),
    ).catch((falha: { message?: string }) => {
      erro(idRequisicao, "Falha ao carregar visitas para o histórico de visitas de supervisão:", falha?.message);
      return { linhas: [] as VisitaDoBanco[], atingiuTeto: false };
    }),
    // Visivel so para gestao (RLS da 0014): um CLIENTE simplesmente nao
    // recebe linha nenhuma aqui, e "meta: null" -> "-" e exatamente o
    // comportamento certo para quem nao tem acesso a meta contratada.
    supabase
      .from("metas_visitas")
      .select("quantidade_esperada")
      .eq("site_id", site)
      .eq("competencia", competencia)
      .maybeSingle(),
  ]);

  if (metaResultado.error) {
    erro(idRequisicao, "Falha ao carregar meta de visitas:", metaResultado.error.message);
  }

  return {
    meta: metaResultado.data?.quantidade_esperada ?? null,
    realizado: visitas.linhas.length,
    visitas: visitas.linhas.map(paraVisitaDeSupervisao),
  };
}
