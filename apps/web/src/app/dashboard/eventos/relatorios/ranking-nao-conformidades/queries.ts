import { periodoEntreDatas } from "@/lib/data-hora";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { filtrosParaRpc } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import {
  extrairFiltros,
  formatarData,
  getOpcoesFiltros,
  primeiro,
  type Filtros,
  type LinhaDoBanco,
  type Opcao,
  type OpcoesFiltros,
  type SearchParams,
} from "../graficos-de-eventos/queries";

/**
 * Ranking das Nao Conformidades (item 3 do plano da #164): um Pareto por TIPO
 * DE EVENTO -- colunas com a quantidade, em ordem decrescente, e a linha com o
 * percentual de cada uma, como o `vlab_rel_ranking_nao_conformidades.php` do
 * sistema de referencia.
 *
 * Mesma fonte do Registro de Eventos e dos Graficos (`relatorio_registro_de_
 * eventos`, 0055/0063), que desde a 0063 conta as ocorrencias abertas pelo
 * checklist. Sem migration, e o total bate com o do Painel de Eventos.
 *
 * Os filtros de periodo, evento, site, usuario, atividade e grupos sao os
 * mesmos da tela de Graficos; "Status" e "Checklists" ficam sem opcao -- as
 * ocorrencias so nascem "Aguardando" ate o item 5, e `registro_de_eventos` nao
 * recorta por checklist.
 */
export { extrairFiltros, formatarData, getOpcoesFiltros, primeiro };
export type { Filtros, Opcao, OpcoesFiltros, SearchParams };

export type ItemDoRanking = {
  eventoId: number;
  eventoNome: string;
  quantidade: number;
  /** Participacao do item no total, em pontos percentuais. */
  percentual: number;
};

export type Ranking = {
  itens: ItemDoRanking[];
  /** "Total Geral" do subtitulo da referencia. */
  total: number;
};

/**
 * Linhas Site x Evento -> um item por evento, do maior para o menor.
 *
 * Empate cai no nome (pt-BR) e depois no id, para a ordem nao depender de como
 * o banco devolveu as linhas -- num Pareto, a ordem E o relatorio.
 *
 * O percentual e individual (quantidade / total), como a linha da referencia:
 * RH 207 de 789 = 26,24. Pura, para ser testada sem mockar o Supabase.
 */
export function montarRanking(doBanco: LinhaDoBanco[]): Ranking {
  const porEvento = new Map<number, { eventoNome: string; quantidade: number }>();
  for (const linha of doBanco) {
    const atual = porEvento.get(linha.evento_id);
    if (atual) atual.quantidade += linha.quantidade;
    else porEvento.set(linha.evento_id, { eventoNome: linha.evento_nome, quantidade: linha.quantidade });
  }

  const total = Array.from(porEvento.values()).reduce((soma, item) => soma + item.quantidade, 0);

  const itens = Array.from(porEvento, ([eventoId, item]) => ({
    eventoId,
    eventoNome: item.eventoNome,
    quantidade: item.quantidade,
    percentual: total > 0 ? Math.round((item.quantidade / total) * 10_000) / 100 : 0,
  })).sort(
    (a, b) =>
      b.quantidade - a.quantidade ||
      a.eventoNome.localeCompare(b.eventoNome, "pt-BR") ||
      a.eventoId - b.eventoId,
  );

  return { itens, total };
}

/** `null` enquanto o periodo nao esta completo, como as demais telas. */
export async function getRanking(filtros: Filtros): Promise<Ranking | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const supabase = await createClient();
  const { inicio, fim } = periodoEntreDatas(filtros.dataInicial, filtros.dataFinal);

  const p_filtros = filtrosParaRpc({
    evento: filtros.evento,
    site: filtros.sites,
    funcionario: filtros.usuario,
    atividade: filtros.atividade,
    grupo_site: filtros.grupoSite,
    grupo_usuario: filtros.grupoUsuario,
  });

  const { linhas, atingiuTeto } = await buscarEmPaginas<LinhaDoBanco>((de, ate) =>
    supabase
      .rpc("relatorio_registro_de_eventos", { p_inicio: inicio, p_fim: fim, p_por_data_insercao: false, p_filtros })
      .order("site_id", { ascending: true })
      .order("evento_id", { ascending: true })
      .range(de, ate),
  );

  if (atingiuTeto) {
    erro(
      gerarIdDeRequisicao(),
      "Ranking das Não Conformidades: teto de agregação atingido; o período exibido está incompleto.",
    );
  }

  return montarRanking(linhas);
}

/** Colunas e linhas do CSV do menu do grafico. */
export function paraPlanilha(ranking: Ranking): { colunas: string[]; linhas: string[][] } {
  return {
    colunas: ["Posição", "Evento", "Quantidade", "Percentual"],
    linhas: ranking.itens.map((item, i) => [
      String(i + 1),
      item.eventoNome,
      String(item.quantidade),
      `${item.percentual.toFixed(2).replace(".", ",")}%`,
    ]),
  };
}
