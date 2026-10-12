import { modelosDoGrupo, tipoDeResposta, type LigacaoDeModelo, type ModeloResumido } from "@projeto-renatoo/shared";

import { abrirFila } from "../campo/fila";
import { supabase } from "./supabase";
import type { PerguntaDoModelo } from "./modelos-do-checklist";

/**
 * Copia do checklist no aparelho: que grupo cada site tem, os modelos, as
 * ligacoes modelo-grupo e as perguntas ativas de cada modelo.
 *
 * POR QUE EXISTE (teste no emulador, 12/10/2026): sem sinal desde a entrada, o
 * "Ver sites" ja mostrava o site (catalogo de QR), mas o checklist parava em
 * "Nao foi possivel carregar o checklist deste site" -- as perguntas so vinham
 * do servidor. O inspetor que chegasse a um subsolo sem ter aberto o checklist
 * antes nao conseguia trabalhar.
 *
 * E baixada junto com o catalogo de QR (ao abrir a leitura com rede) e no
 * "Sincronizar" da tela inicial; falha sem sinal nao apaga a anterior. So e
 * lida quando a leitura do servidor falha -- com rede, vale sempre o servidor.
 * Nada aqui e segredo: o RLS ja deixa este inspetor ler cada linha copiada.
 */

export type CopiaDoChecklist = {
  /** id do site -> id do grupo. Chave texto: e o que o JSON devolve. */
  gruposDosSites: Record<string, number>;
  modelos: ModeloResumido[];
  ligacoes: LigacaoDeModelo[];
  /** id do modelo -> perguntas ativas, na ordem. */
  perguntas: Record<string, PerguntaDoModelo[]>;
};

const CHAVE = "checklist_guardado";
const TAMANHO_DA_PAGINA = 500;

/** Os modelos de um site pela copia, com a mesma regra do servidor (`modelosDoGrupo`). */
export function modelosNaCopia(copia: CopiaDoChecklist, siteId: number): ModeloResumido[] {
  const grupo = copia.gruposDosSites[String(siteId)];
  if (grupo === undefined) return [];
  return modelosDoGrupo(grupo, copia.modelos, copia.ligacoes);
}

export function perguntasNaCopia(copia: CopiaDoChecklist, modeloId: number): PerguntaDoModelo[] {
  return copia.perguntas[String(modeloId)] ?? [];
}

/** Confere a forma do que voltou do disco; copia estranha vale como ausente. */
export function copiaValida(valor: unknown): CopiaDoChecklist | null {
  if (typeof valor !== "object" || valor === null) return null;
  const { gruposDosSites, modelos, ligacoes, perguntas } = valor as Record<string, unknown>;
  if (typeof gruposDosSites !== "object" || gruposDosSites === null) return null;
  if (!Array.isArray(modelos) || !Array.isArray(ligacoes)) return null;
  if (typeof perguntas !== "object" || perguntas === null) return null;
  return valor as CopiaDoChecklist;
}

/** Junta as linhas da tabela em perguntas por modelo, ja na ordem. */
export function agruparPerguntas(
  linhas: readonly { id: number; modelo_id: number; ordem: number; texto: string; tipo_resposta: string }[],
): Record<string, PerguntaDoModelo[]> {
  const porModelo: Record<string, PerguntaDoModelo[]> = {};
  for (const linha of [...linhas].sort((a, b) => a.ordem - b.ordem)) {
    (porModelo[String(linha.modelo_id)] ??= []).push({
      id: linha.id,
      ordem: linha.ordem,
      texto: linha.texto,
      tipoResposta: tipoDeResposta(linha.tipo_resposta),
    });
  }
  return porModelo;
}

async function todasAsPaginas<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += TAMANHO_DA_PAGINA) {
    const { data, error } = await pagina(de, de + TAMANHO_DA_PAGINA - 1);
    if (error) throw error;
    todas.push(...(data ?? []));
    if ((data ?? []).length < TAMANHO_DA_PAGINA) return todas;
  }
}

/** Baixa tudo e troca a copia de uma vez. Rejeita sem sinal; a anterior fica. */
export async function atualizarCopiaDoChecklist(): Promise<void> {
  const [sites, modelos, ligacoes, perguntas] = await Promise.all([
    todasAsPaginas((de, ate) => supabase.from("sites").select("id, grupo_site_id").order("id").range(de, ate)),
    todasAsPaginas((de, ate) =>
      supabase.from("modelos_checklist").select("id, nome, padrao, ativo").order("id").range(de, ate),
    ),
    todasAsPaginas((de, ate) =>
      supabase
        .from("modelos_checklist_grupos")
        .select("modelo_id, grupo_site_id")
        .order("modelo_id")
        .order("grupo_site_id")
        .range(de, ate),
    ),
    todasAsPaginas((de, ate) =>
      supabase
        .from("perguntas_checklist")
        .select("id, modelo_id, ordem, texto, tipo_resposta")
        .eq("ativo", true)
        .order("id")
        .range(de, ate),
    ),
  ]);

  const copia: CopiaDoChecklist = {
    gruposDosSites: Object.fromEntries(sites.map((site) => [String(site.id), site.grupo_site_id])),
    modelos,
    ligacoes,
    perguntas: agruparPerguntas(perguntas),
  };

  const banco = await abrirFila();
  await banco.runAsync(
    "insert into meta (chave, valor) values (?, ?) on conflict (chave) do update set valor = excluded.valor",
    CHAVE,
    JSON.stringify(copia),
  );
}

export async function lerCopiaDoChecklist(): Promise<CopiaDoChecklist | null> {
  try {
    const banco = await abrirFila();
    const linha = await banco.getFirstAsync<{ valor: string }>("select valor from meta where chave = ?", CHAVE);
    return linha ? copiaValida(JSON.parse(linha.valor)) : null;
  } catch {
    return null;
  }
}
