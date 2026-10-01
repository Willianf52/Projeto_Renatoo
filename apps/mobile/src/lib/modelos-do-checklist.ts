import {
  modelosDoGrupo,
  tipoDeResposta,
  type ModeloResumido,
  type TipoDeResposta,
} from "@projeto-renatoo/shared";

import { supabase } from "./supabase";

/**
 * De onde vem a lista de perguntas de uma CONSULTORIA (migration 0061).
 *
 * Fora de componente e sem `setState`, como `lerPerguntas` era -- ver a nota
 * em `SessaoProvider` sobre render em cascata. Devolve o que aconteceu e a
 * tela decide o que pintar.
 *
 * O modelo sai do GRUPO do site: e o vinculo que o levantamento do sistema de
 * referencia mostrou (todo modelo cobre os sites de um grupo). A regra de
 * "grupo sem modelo usa o padrao" e `modelosDoGrupo`, do shared -- a mesma
 * que o painel mostra na listagem de modelos.
 */

export type PerguntaDoModelo = {
  id: number;
  ordem: number;
  texto: string;
  tipoResposta: TipoDeResposta;
};

export type ResultadoDosModelos = { ok: true; modelos: ModeloResumido[] } | { ok: false; erro: string };

const ERRO_DE_MODELOS = "Não foi possível carregar o checklist deste site.";

/**
 * `siteId` quando o checklist veio do "Ver sites" (a visita ainda nao
 * existe); `visitaId` quando veio de uma visita ja gravada, e o site sai dela.
 *
 * As tres leituras vao juntas, e nao grupo primeiro: as ligacoes sao poucas
 * (uma por grupo com modelo), e trazer todas custa menos que esperar uma ida
 * e volta a mais pela rede movel so para filtrar no servidor.
 */
export async function lerModelosDoSite(alvo: {
  visitaId: number | null;
  siteId: number | null;
}): Promise<ResultadoDosModelos> {
  try {
    const [grupo, modelos, ligacoes] = await Promise.all([
      lerGrupoDoSite(alvo),
      supabase.from("modelos_checklist").select("id, nome, padrao, ativo"),
      supabase.from("modelos_checklist_grupos").select("modelo_id, grupo_site_id"),
    ]);

    if (grupo === null || modelos.error || ligacoes.error) return { ok: false, erro: ERRO_DE_MODELOS };

    const doSite = modelosDoGrupo(grupo, modelos.data ?? [], ligacoes.data ?? []);

    // Nem o padrao veio: nao e "site sem checklist" (o padrao existe sempre,
    // 0061), e leitura que nao trouxe o que devia.
    if (doSite.length === 0) return { ok: false, erro: ERRO_DE_MODELOS };

    return { ok: true, modelos: doSite };
  } catch {
    // Rejeicao da camada de rede; o `error` do PostgREST ja foi tratado acima.
    return { ok: false, erro: ERRO_DE_MODELOS };
  }
}

async function lerGrupoDoSite(alvo: { visitaId: number | null; siteId: number | null }): Promise<number | null> {
  if (alvo.siteId !== null) {
    const { data, error } = await supabase
      .from("sites")
      .select("grupo_site_id")
      .eq("id", alvo.siteId)
      .maybeSingle();

    return error || !data ? null : data.grupo_site_id;
  }

  if (alvo.visitaId !== null) {
    const { data, error } = await supabase
      .from("visitas")
      .select("sites ( grupo_site_id )")
      .eq("id", alvo.visitaId)
      .maybeSingle();

    return error || !data?.sites ? null : data.sites.grupo_site_id;
  }

  return null;
}

/**
 * As perguntas ativas de um modelo, na `ordem` -- a sequencia de tela que a
 * 0042 declara, agora dentro do modelo (a 0061 fez a ordem unica por modelo).
 */
export async function lerPerguntasDoModelo(
  modeloId: number,
): Promise<{ perguntas: PerguntaDoModelo[]; erro: string | null }> {
  const { data, error } = await supabase
    .from("perguntas_checklist")
    .select("id, ordem, texto, tipo_resposta")
    .eq("modelo_id", modeloId)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) {
    return { perguntas: [], erro: "Não foi possível carregar as perguntas do checklist." };
  }

  return {
    perguntas: (data ?? []).map((pergunta) => ({
      id: pergunta.id,
      ordem: pergunta.ordem,
      texto: pergunta.texto,
      tipoResposta: tipoDeResposta(pergunta.tipo_resposta),
    })),
    erro: null,
  };
}
