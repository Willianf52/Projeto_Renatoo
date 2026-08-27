import { File, Paths } from "expo-file-system";
import {
  caminhoDeMidiaDaVisita,
  esquemaDeChecklistDeVisita,
  type RespostaDeChecklist,
  type TipoDeVisita,
} from "@projeto-renatoo/shared";

import { supabase } from "./supabase";

/**
 * Envio do checklist: sobe a midia para o Storage e grava as linhas.
 *
 * Fora de componente e sem `setState`, como `lerVisitas` em
 * `TelaDeInspecoes` -- devolve o que aconteceu e deixa a tela decidir o que
 * pintar.
 *
 * A ORDEM IMPORTA. A midia sobe **antes** das linhas porque `assinatura_path`
 * e `not null`: nao ha linha para apontar para um arquivo que ainda nao
 * existe. O custo dessa ordem e o arquivo orfao quando o insert falha depois
 * do upload -- aceito de proposito, porque a alternativa (linha primeiro,
 * arquivo depois) deixaria no banco um checklist apontando para um PNG que
 * nunca chegou, e o painel abriria a inspecao com um quadrado quebrado no
 * lugar da assinatura. Orfao no bucket e lixo; linha apontando para o vazio e
 * dado errado.
 *
 * As tres linhas (checklist, fotos, respostas) vao numa chamada so, pelo RPC
 * `registrar_checklist` da migration 0042 -- ver la por que tres chamadas
 * separadas do PostgREST nao serviam.
 */

const BUCKET = "checklists";

export type EnvioDeChecklist = {
  visitaId: number;
  tipo: TipoDeVisita;
  /** Obrigatorio na CORRETIVA, ausente na CONSULTORIA. */
  motivo?: string;
  /** Preenchido so na CONSULTORIA. */
  respostas?: RespostaDeChecklist[];
  /** URIs locais devolvidas pelo seletor de imagem. */
  fotos: string[];
  /** PNG em base64, sem o prefixo `data:`. */
  assinatura: string;
};

export type ResultadoDoEnvio =
  | { ok: true; checklistId: number }
  | { ok: false; erro: string };

export async function enviarChecklist(envio: EnvioDeChecklist): Promise<ResultadoDoEnvio> {
  try {
    const assinaturaPath = caminhoDeMidiaDaVisita(envio.visitaId, `assinatura-${sufixo()}`, "png");

    const bytesDaAssinatura = await bytesDoBase64(envio.assinatura);
    const falhaNaAssinatura = await subir(assinaturaPath, bytesDaAssinatura, "image/png");
    if (falhaNaAssinatura) return { ok: false, erro: falhaNaAssinatura };

    const fotos: string[] = [];

    for (const uri of envio.fotos) {
      const caminho = caminhoDeMidiaDaVisita(envio.visitaId, `foto-${sufixo()}`, "jpg");
      const falha = await subir(caminho, await new File(uri).arrayBuffer(), "image/jpeg");
      if (falha) return { ok: false, erro: falha };
      fotos.push(caminho);
    }

    // A validacao autoritativa roda aqui, com os caminhos ja reais: o esquema
    // do shared e o mesmo que o painel usa, e e ele que garante que uma
    // CORRETIVA sem motivo (ou uma CONSULTORIA com um) nao chega ao banco.
    const checklist = esquemaDeChecklistDeVisita.safeParse(
      envio.tipo === "CORRETIVA"
        ? {
            visitaId: envio.visitaId,
            tipo: "CORRETIVA",
            motivo: envio.motivo,
            fotos,
            assinaturaPath,
          }
        : {
            visitaId: envio.visitaId,
            tipo: "CONSULTORIA",
            respostas: envio.respostas ?? [],
            fotos,
            assinaturaPath,
          },
    );

    if (!checklist.success) {
      return { ok: false, erro: checklist.error.issues[0].message };
    }

    const dados = checklist.data;

    const { data, error } = await supabase.rpc("registrar_checklist", {
      p_visita_id: dados.visitaId,
      p_tipo: dados.tipo,
      p_motivo: dados.tipo === "CORRETIVA" ? dados.motivo : null,
      p_assinatura_path: dados.assinaturaPath,
      p_fotos: dados.fotos,
      p_respostas:
        dados.tipo === "CONSULTORIA"
          ? dados.respostas.map((resposta) => ({
              pergunta_id: resposta.perguntaId,
              resposta: resposta.resposta,
              observacao: resposta.observacao,
            }))
          : [],
    });

    if (error) {
      // 23505 e a unique de `visita_id`: a visita ja foi fechada. Acontece
      // quando o inspetor toca em Enviar de novo depois de um envio que
      // pareceu falhar mas chegou -- e o caso que a constraint existe para
      // cobrir, entao a tela diz isso em vez de "erro ao enviar".
      if (error.code === "23505") {
        return { ok: false, erro: "Esta visita já foi finalizada." };
      }

      return { ok: false, erro: "Não foi possível enviar o checklist." };
    }

    return { ok: true, checklistId: Number(data) };
  } catch {
    // Rejeicao da camada de rede ou de leitura de arquivo -- o `error` do
    // PostgREST ja foi tratado acima. Sem este ramo a tela ficaria com o botao
    // em "enviando" para sempre, que e o mesmo bug do spinner eterno que
    // `TelaDeInspecoes` documenta.
    return { ok: false, erro: "Não foi possível enviar o checklist." };
  }
}

async function subir(
  caminho: string,
  conteudo: ArrayBuffer,
  contentType: string,
): Promise<string | null> {
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, conteudo, {
    contentType,
    // Sem `upsert`: o caminho carrega um sufixo aleatorio, entao colidir
    // significa que algo esta errado -- e sobrescrever esconderia isso.
    upsert: false,
  });

  if (!error) return null;

  return "Não foi possível enviar as imagens. Verifique o sinal e tente de novo.";
}

/**
 * Base64 para bytes sem depender de `atob`.
 *
 * O React Native nao garante `atob` global, e um polyfill so para isto seria
 * mais uma dependencia. O arquivo de cache faz a decodificacao do lado nativo
 * -- e um ida e volta ao disco, mas so uma vez por assinatura.
 */
async function bytesDoBase64(base64: string): Promise<ArrayBuffer> {
  const arquivo = new File(Paths.cache, `assinatura-${sufixo()}.png`);

  arquivo.create({ overwrite: true });
  arquivo.write(base64, { encoding: "base64" });

  try {
    return await arquivo.arrayBuffer();
  } finally {
    // O cache do app nao e limpo sozinho enquanto houver espaco; sem isto,
    // uma assinatura de cada visita fica no aparelho para sempre.
    arquivo.delete();
  }
}

/** Sufixo unico por arquivo -- `storage_path` e unique na 0042. */
function sufixo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
