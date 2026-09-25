import { File, Paths } from "expo-file-system";
import {
  caminhoDeMidiaDaVisita,
  esquemaDeChecklistDeVisita,
  type RespostaDeChecklist,
  type TipoDeVisita,
} from "@projeto-renatoo/shared";

import { capturarErro, capturarFalhaDeCampo } from "./observabilidade";
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
  /** O checklist desta visita ja estava no banco -- ver o ramo do 23505. */
  | { ok: true; jaFinalizada: true }
  | { ok: false; erro: string };

/**
 * O que ja subiu para o Storage nesta tela, por origem local -> caminho no
 * bucket.
 *
 * REENVIO NAO SOBE DE NOVO. Sem isto, cada toque em "Finalizar" depois de uma
 * falha (a quarta foto caiu no meio, o RPC voltou erro de rede) subia a
 * assinatura e TODAS as fotos outra vez, com sufixo novo: o inspetor gastava a
 * rede de campo inteira a cada tentativa, justamente quando ela esta ruim, e
 * cada tentativa deixava um lote de orfaos no bucket. Quem guarda o mapa e a
 * tela (uma ref), porque ele vale enquanto o formulario estiver aberto -- a
 * origem local (uri da foto, base64 da assinatura) so tem sentido ali.
 */
export type MidiaJaEnviada = Map<string, string>;

export async function enviarChecklist(
  envio: EnvioDeChecklist,
  jaEnviadas: MidiaJaEnviada = new Map(),
): Promise<ResultadoDoEnvio> {
  try {
    // A chave da assinatura e o proprio traco: colhida de novo, e outra
    // imagem e sobe outra vez; a mesma, reaproveita.
    const origemDaAssinatura = `assinatura:${envio.assinatura}`;
    let assinaturaPath = jaEnviadas.get(origemDaAssinatura);

    if (assinaturaPath === undefined) {
      const caminho = caminhoDeMidiaDaVisita(envio.visitaId, `assinatura-${sufixo()}`, "png");
      const bytesDaAssinatura = await bytesDoBase64(envio.assinatura);
      const falhaNaAssinatura = await subir(caminho, bytesDaAssinatura, "image/png");
      if (falhaNaAssinatura) return { ok: false, erro: falhaNaAssinatura };
      jaEnviadas.set(origemDaAssinatura, caminho);
      assinaturaPath = caminho;
    }

    const fotos: string[] = [];

    for (const uri of envio.fotos) {
      const origem = `foto:${uri}`;
      let caminho = jaEnviadas.get(origem);

      if (caminho === undefined) {
        caminho = caminhoDeMidiaDaVisita(envio.visitaId, `foto-${sufixo()}`, "jpg");
        const falha = await subir(caminho, await new File(uri).arrayBuffer(), "image/jpeg");
        if (falha) return { ok: false, erro: falha };
        jaEnviadas.set(origem, caminho);
      }

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
      // String vazia e nao `null` na consultoria: o gerador de tipos marca
      // todo argumento sem default como obrigatorio e nao-nulo, entao `null`
      // aqui nao passa no `tsc` mesmo sendo aceito pelo Postgres. O
      // `nullif(btrim(coalesce(p_motivo, '')), '')` dentro de
      // `registrar_checklist` existe justamente para colapsar os dois no
      // mesmo `null` antes do insert -- e o check do banco continua sendo
      // quem recusa uma CONSULTORIA que chegar com motivo de verdade.
      p_motivo: dados.tipo === "CORRETIVA" ? dados.motivo : "",
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
      // pareceu falhar mas chegou (a resposta se perdeu na rede). Devolver
      // erro aqui prendia o inspetor na tela, com um aviso vermelho sobre um
      // trabalho que ja estava feito e nenhum jeito de sair dali alem de
      // voltar na mao. Nao ha nada a refazer: o desfecho e o do sucesso.
      if (error.code === "23505") {
        return { ok: true, jaFinalizada: true };
      }

      // Recusa do RPC que NAO e a unique conhecida: policy, check do banco,
      // contrato fora de sincronia. Vale como aviso agregado -- se aparecer
      // em varios aparelhos ao mesmo tempo, o problema nao esta no aparelho.
      capturarFalhaDeCampo("checklist", String(envio.visitaId), error.message);

      return { ok: false, erro: "Não foi possível enviar o checklist." };
    }

    return { ok: true, checklistId: Number(data) };
  } catch (excecao) {
    // Rejeicao da camada de rede ou de leitura de arquivo -- o `error` do
    // PostgREST ja foi tratado acima. Sem este ramo a tela ficaria com o botao
    // em "enviando" para sempre, que e o mesmo bug do spinner eterno que
    // `TelaDeInspecoes` documenta.
    //
    // Era daqui que NADA saia. Este `catch` cobre a assinatura, as fotos, o
    // disco e a rede -- o checklist inteiro --, e ate agora transformava
    // qualquer um desses em uma frase de tela e mais nada: sem stack, sem
    // aparelho, sem o que aconteceu. Era o ponto cego mais caro do app.
    capturarErro(excecao, { onde: "enviarChecklist", visita: String(envio.visitaId) });

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
