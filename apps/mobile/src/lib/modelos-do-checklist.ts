import {
  modelosDoGrupo,
  tipoDeResposta,
  type ModeloResumido,
  type TipoDeResposta,
} from "@projeto-renatoo/shared";

import { lerCopiaDoChecklist, modelosNaCopia, perguntasNaCopia } from "./checklist-guardado";
import { comPrazo, ESGOTADO, PRAZO_ANTES_DA_COPIA_MS } from "./com-prazo";
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
 * Ate quando vale "estamos sem sinal": os modelos acabaram de sair da copia,
 * entao as perguntas, logo em seguida, vao direto nela -- sem esperar outro
 * prazo inteiro do servidor. Um minuto: o bastante para a mesma tela.
 */
let semSinalAte = 0;
const JANELA_SEM_SINAL_MS = 60_000;

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
  const leitura = lerModelosDoServidor(alvo);
  if (alvo.siteId === null) return leitura;

  const doServidor = await comPrazo(leitura, PRAZO_ANTES_DA_COPIA_MS);
  if (doServidor !== ESGOTADO && doServidor.ok) return doServidor;

  // Sem sinal (falhou ou nao respondeu no prazo): a copia baixada com o
  // catalogo de QR, ver `checklist-guardado.ts`. Sem copia, espera o servidor.
  const copia = await lerCopiaDoChecklist();
  const daCopia = copia ? modelosNaCopia(copia, alvo.siteId) : [];
  if (daCopia.length > 0) {
    semSinalAte = Date.now() + JANELA_SEM_SINAL_MS;
    return { ok: true, modelos: daCopia };
  }
  return doServidor === ESGOTADO ? leitura : doServidor;
}

async function lerModelosDoServidor(alvo: {
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
type PerguntasLidas = { perguntas: PerguntaDoModelo[]; erro: string | null };

export async function lerPerguntasDoModelo(modeloId: number): Promise<PerguntasLidas> {
  const leitura = lerPerguntasDoServidor(modeloId);
  const prazo = Date.now() < semSinalAte ? 0 : PRAZO_ANTES_DA_COPIA_MS;
  const doServidor = await comPrazo(leitura, prazo);
  if (doServidor !== ESGOTADO && doServidor.erro === null) return doServidor;

  // Mesma copia do `lerModelosDoSite`: sem sinal, as perguntas guardadas.
  const copia = await lerCopiaDoChecklist();
  const daCopia = copia ? perguntasNaCopia(copia, modeloId) : [];
  if (daCopia.length > 0) return { perguntas: daCopia, erro: null };
  return doServidor === ESGOTADO ? leitura : doServidor;
}

async function lerPerguntasDoServidor(modeloId: number): Promise<PerguntasLidas> {
  const erro = "Não foi possível carregar as perguntas do checklist.";
  let resposta: { data: { id: number; ordem: number; texto: string; tipo_resposta: string }[] | null; error: unknown };
  try {
    resposta = await supabase
      .from("perguntas_checklist")
      .select("id, ordem, texto, tipo_resposta")
      .eq("modelo_id", modeloId)
      .eq("ativo", true)
      .order("ordem", { ascending: true });
  } catch {
    resposta = { data: null, error: true };
  }
  const { data, error } = resposta;

  if (error) {
    return { perguntas: [], erro };
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
