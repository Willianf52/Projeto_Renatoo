import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SeletorDeImagem from "expo-image-picker";
import {
  alturaDeControle,
  LIMITE_MOTIVO,
  MAXIMO_DE_FOTOS,
  MAXIMO_DE_FOTOS_POR_PERGUNTA,
  respostasDoTipo,
  rotuloDaResposta,
  ROTULO_DO_TIPO,
  type ModeloResumido,
  type RespostaDoChecklist,
  type TipoDeVisita,
} from "@projeto-renatoo/shared";

import { useSessao } from "../auth/SessaoProvider";
import {
  pendenciasDoChecklist,
  progressoDasPerguntas,
  textoDoResumo,
  type Pendencia,
} from "../campo/pendencias-do-checklist";
import { descartarRascunho, esquecerFoto, guardarFoto, lerRascunho, salvarRascunho } from "../campo/rascunho";
import { criarVisitaPeloSite, type SiteParaVisita } from "../campo/visita-pelo-site";
import { AreaDeAssinatura, type ControleDaAssinatura } from "../componentes/AreaDeAssinatura";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { Cartao } from "../componentes/Cartao";
import { EsqueletoDaLista } from "../componentes/Esqueleto";
import { enviarChecklist, type MidiaJaEnviada } from "../lib/envio-de-checklist";
import { lerModelosDoSite, lerPerguntasDoModelo, type PerguntaDoModelo } from "../lib/modelos-do-checklist";
import { capturarErro } from "../lib/observabilidade";
import { reduzirFoto } from "../lib/reduzir-foto";
import { colunaDeLeitura, cores, espaco, raio, texto, tipografia } from "../tema";

/** De onde e uma foto: do checklist inteiro (`null`) ou de uma pergunta. */
type DonoDaFoto = number | null;

/** Secoes do formulario para onde a rolagem pode levar. */
type Secao = "motivo" | "perguntas" | "fotos" | "assinatura";

/**
 * Janela do "Desfazer" depois de remover uma foto. Cinco segundos: o bastante
 * para perceber o toque errado e voltar o dedo, curto o bastante para a faixa
 * nao ficar ocupando a secao de fotos.
 */
const DURACAO_DO_DESFAZER = 5000;

/**
 * Fechamento de uma visita em campo.
 *
 * A tela e um formulario **progressivo**: nasce mostrando so a escolha do
 * tipo, e o resto aparece depois que o inspetor escolhe. Nao e enfeite -- as
 * duas opcoes pedem coisas diferentes (motivo de um lado, dez perguntas do
 * outro), e mostrar os dois conjuntos de campos ao mesmo tempo obrigaria a
 * pessoa a descobrir qual metade ignorar, em pe, com o aparelho na mao.
 *
 * Foto e assinatura ficam fora do galho condicional porque os dois caminhos
 * pedem os dois -- e o que `comumDoChecklist` no esquema do shared ja diz.
 */
export function TelaDeChecklist({
  visitaId,
  site,
  numeroColeta,
  tipo,
  aoConcluir,
}: {
  /**
   * `null` quando o checklist veio do "Ver sites": a visita so e criada no
   * envio (ver `campo/visita-pelo-site.ts`), e ate la `site` diz onde.
   */
  visitaId: number | null;
  site?: SiteParaVisita;
  numeroColeta: string;
  /**
   * Escolhido na tela anterior (`TelaDeTipoDeVisita`), e nao aqui: e o fluxo
   * do material que a supervisao distribuiu. Chega como prop, e nao como
   * estado, porque trocar de tipo no meio do preenchimento nao e "mudar um
   * campo" -- e comecar outro formulario. Voltar e escolher de novo deixa isso
   * explicito, em vez de esvaziar respostas por baixo do dedo.
   */
  tipo: TipoDeVisita;
  aoConcluir: () => void;
}) {
  const { sessao } = useSessao();
  const funcionarioId = sessao?.user.id ?? null;

  /**
   * Chave do rascunho e da pasta das fotos. Sem visita ainda, e o id do site
   * negativado -- ids de visita sao positivos, entao as duas nunca colidem, e
   * voltar ao mesmo site pelo "Ver sites" recupera o que ficou preenchido.
   */
  const chave = visitaId ?? -(site?.id ?? 0);

  /** A visita do envio: a da rota, ou a criada no primeiro "Finalizar". */
  const visitaCriada = useRef<number | null>(visitaId);

  const [motivo, setMotivo] = useState("");

  /**
   * Os modelos do grupo do site (0061). `null` e "ainda nao buscados". Quase
   * sempre vem um so, e a tela segue direto para as perguntas; com mais de um
   * (o "geral + limpeza"), o inspetor escolhe no topo.
   */
  const [modelos, setModelos] = useState<ModeloResumido[] | null>(null);
  /** O escolhido pelo inspetor, ou o que voltou do rascunho. */
  const [modeloEscolhido, setModeloEscolhido] = useState<number | null>(null);

  // As perguntas carregadas, junto do modelo de onde vieram: trocar de modelo
  // torna a lista velha invalida sem precisar de effect para limpa-la -- a
  // comparacao abaixo ja a descarta. `null` e "ainda nao buscadas", `[]` e
  // "buscadas e nao ha nenhuma" -- um mostra esqueleto, o outro diz que o
  // checklist esta vazio.
  const [carregadas, setCarregadas] = useState<{ modeloId: number; perguntas: PerguntaDoModelo[] } | null>(null);
  const [erroDePerguntas, setErroDePerguntas] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Record<number, RespostaDoChecklist>>({});
  const [fotos, setFotos] = useState<string[]>([]);
  const [fotosDePergunta, setFotosDePergunta] = useState<Record<number, string[]>>({});
  const [temAssinatura, setTemAssinatura] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Rolagem do formulario travada enquanto o dedo esta no quadro de
  // assinatura -- sem isso, no iPhone, a pagina subia no meio do traco.
  const [assinando, setAssinando] = useState(false);

  const assinatura = useRef<ControleDaAssinatura>(null);
  const bordas = useSafeAreaInsets();

  /**
   * Levar o inspetor ate o que falta. O "Finalizar" fica no rodape e a
   * pendencia pode estar dez perguntas acima: antes, o aviso aparecia no topo
   * da tela, fora da vista, e o toque parecia nao ter feito nada.
   *
   * As posicoes vem do `onLayout` de cada secao (filhas diretas do conteudo
   * rolavel, entao o `y` ja e o do conteudo). Pergunta mede relativo a secao
   * de perguntas, dai a soma em `rolarAte`.
   */
  const rolagem = useRef<ScrollView>(null);
  const campoDoMotivo = useRef<TextInput>(null);
  const posicaoDaSecao = useRef<Partial<Record<Secao, number>>>({});
  const posicaoDaPergunta = useRef<Record<number, number>>({});

  /**
   * Pendencia da ultima tentativa de envio, para pintar o item na tela. So o
   * alvo: se o inspetor resolve o item, a condicao de destaque (derivada do
   * estado atual, la embaixo) deixa de valer sozinha, sem limpar nada aqui.
   */
  const [destaque, setDestaque] = useState<Pendencia["alvo"] | null>(null);

  /** Foto aberta em tela cheia. Tocar na miniatura abre; nao remove mais. */
  const [fotoAberta, setFotoAberta] = useState<{ uri: string; dono: DonoDaFoto } | null>(null);

  /**
   * Remocao com "Desfazer". O arquivo so e apagado do disco (`esquecerFoto`)
   * quando a janela fecha -- apagar na hora tornaria o desfazer impossivel.
   * Ref para o timer e o endereco; estado so para a faixa aparecer.
   */
  const remocaoPendente = useRef<{
    uri: string;
    dono: DonoDaFoto;
    indice: number;
    espera: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [temRemocaoPendente, setTemRemocaoPendente] = useState(false);

  /**
   * Guarda contra dois envios em voo ao mesmo tempo -- a mesma peca que
   * `revalidacaoEmVoo` em `useCicloDeVidaDaSessao`, e pelo mesmo motivo.
   *
   * REF E NAO O `enviando`: `enviando` e estado, e so vira `true` depois do
   * `await` da captura da assinatura (o `toDataURL` nativo rasteriza o SVG e
   * demora). Ate la o botao seguia ativo, e dois toques nessa janela viravam
   * dois envios completos: as fotos subiam duas vezes e o segundo batia na
   * unique `checklists_visita_visita_unica` (migration 0042) -- depois de
   * gastar a rede de campo inteira de novo e deixar o dobro de orfaos no
   * bucket. Uma ref e lida no mesmo tique do toque, antes de qualquer render.
   */
  const envioEmVoo = useRef(false);

  /** O que ja subiu ao Storage -- ver `MidiaJaEnviada` em `envio-de-checklist.ts`. */
  const midiaJaEnviada = useRef<MidiaJaEnviada>(new Map());

  /**
   * Falso ate o rascunho ser lido. Sem esta trava, o salvamento abaixo rodaria
   * no primeiro render com o formulario ainda vazio e sobrescreveria no disco
   * justamente o rascunho que se quer restaurar.
   */
  const [rascunhoLido, setRascunhoLido] = useState(false);

  useEffect(() => {
    if (!funcionarioId) return;
    let ativo = true;

    lerRascunho(chave, funcionarioId)
      .then((rascunho) => {
        if (!ativo || !rascunho) return;
        setMotivo(rascunho.motivo);
        setRespostas(rascunho.respostas);
        setFotos(rascunho.fotos);
        setModeloEscolhido(rascunho.modeloId);
        setFotosDePergunta(rascunho.fotosDePergunta);
      })
      .catch((falha) => {
        // Rascunho ilegivel nao impede de preencher: a tela abre vazia, como
        // abria antes de o rascunho existir.
        capturarErro(falha, { onde: "lerRascunho", visita: String(chave) });
      })
      .finally(() => {
        if (ativo) setRascunhoLido(true);
      });

    return () => {
      ativo = false;
    };
  }, [chave, funcionarioId]);

  /**
   * Grava a cada mudanca, com um respiro de meio segundo: digitar o motivo
   * nao pode virar uma escrita em disco por tecla. Falha de gravacao nao
   * interrompe o preenchimento -- o rascunho e rede de seguranca, nao etapa.
   */
  useEffect(() => {
    if (!rascunhoLido || !funcionarioId) return;

    const espera = setTimeout(() => {
      salvarRascunho(chave, funcionarioId, {
        motivo,
        respostas,
        fotos,
        modeloId: modeloEscolhido,
        fotosDePergunta,
      }).catch((falha) => {
        capturarErro(falha, { onde: "salvarRascunho", visita: String(chave) });
      });
    }, 500);

    return () => clearTimeout(espera);
  }, [rascunhoLido, funcionarioId, chave, motivo, respostas, fotos, modeloEscolhido, fotosDePergunta]);

  /**
   * Os modelos so sao buscados na CONSULTORIA, e nao na abertura da tela: numa
   * corretiva essa consulta nunca serviria para nada, e o app roda em rede
   * movel de canteiro de obra.
   */
  const idDoSite = site?.id ?? null;

  useEffect(() => {
    if (tipo !== "CONSULTORIA" || modelos !== null) return;

    // Mesma guarda do `SessaoProvider`: resposta que chega depois de a tela
    // sair nao pode pintar nada.
    let ativo = true;

    // `void`: `lerModelosDoSite` nao rejeita (tem o proprio `catch`). Lista
    // vazia com erro: a tela mostra o aviso e nao fica em esqueleto para sempre.
    void lerModelosDoSite({ visitaId, siteId: idDoSite }).then((resultado) => {
      if (!ativo) return;
      setModelos(resultado.ok ? resultado.modelos : []);
      setErroDePerguntas(resultado.ok ? null : resultado.erro);
    });

    return () => {
      ativo = false;
    };
  }, [tipo, modelos, visitaId, idDoSite]);

  /**
   * O modelo que vale. O do rascunho so se ainda estiver entre os do grupo --
   * modelo desativado depois de o rascunho nascer nao pode voltar a tela. Com
   * um modelo so, ele mesmo, sem perguntar nada ao inspetor.
   */
  const modeloEfetivo =
    modelos === null
      ? null
      : modelos.some((modelo) => modelo.id === modeloEscolhido)
        ? modeloEscolhido
        : modelos.length === 1
          ? modelos[0].id
          : null;

  useEffect(() => {
    if (modeloEfetivo === null || carregadas?.modeloId === modeloEfetivo) return;

    let ativo = true;

    lerPerguntasDoModelo(modeloEfetivo)
      .then((resultado) => {
        if (!ativo) return;
        setCarregadas({ modeloId: modeloEfetivo, perguntas: resultado.perguntas });
        setErroDePerguntas(resultado.erro);
      })
      .catch(() => {
        // `lerPerguntasDoModelo` ja traduz erro do PostgREST; o que falta e a
        // rejeicao da camada de rede. Sem este ramo o esqueleto fica na tela
        // para sempre -- o mesmo spinner eterno que `TelaDeInspecoes` documenta.
        if (!ativo) return;
        setCarregadas({ modeloId: modeloEfetivo, perguntas: [] });
        setErroDePerguntas("Não foi possível carregar as perguntas do checklist.");
      });

    return () => {
      ativo = false;
    };
  }, [modeloEfetivo, carregadas]);

  // Derivados, e nao estados a sincronizar: lista de outro modelo vale como
  // "ainda nao buscada".
  const perguntas =
    modeloEfetivo !== null && carregadas?.modeloId === modeloEfetivo ? carregadas.perguntas : null;
  const escolhaDeModeloPendente =
    tipo === "CONSULTORIA" && modelos !== null && modelos.length > 1 && modeloEfetivo === null;
  const carregandoPerguntas =
    tipo === "CONSULTORIA" &&
    erroDePerguntas === null &&
    (modelos === null || (modeloEfetivo !== null && perguntas === null));

  /** Fotos de pergunta que contam: so as das perguntas do modelo na tela. */
  const fotosDasPerguntas = useMemo(
    () => (perguntas ?? []).flatMap((pergunta) => (fotosDePergunta[pergunta.id] ?? []).map((uri) => ({ perguntaId: pergunta.id, uri }))),
    [perguntas, fotosDePergunta],
  );

  const estadoDoChecklist = useMemo(
    () => ({
      tipo,
      motivo,
      perguntas,
      respostas,
      escolhaDeModeloPendente,
      // Gerais e de pergunta, somadas: qualquer uma comprova a visita.
      quantidadeDeFotos: fotos.length + (tipo === "CONSULTORIA" ? fotosDasPerguntas.length : 0),
      temAssinatura,
    }),
    [tipo, motivo, perguntas, respostas, escolhaDeModeloPendente, fotos.length, fotosDasPerguntas.length, temAssinatura],
  );
  const pendencias = useMemo(() => pendenciasDoChecklist(estadoDoChecklist), [estadoDoChecklist]);
  const progresso = progressoDasPerguntas(estadoDoChecklist);

  const rolarAte = useCallback((pendencia: Pendencia) => {
    const secao = posicaoDaSecao.current[pendencia.alvo];
    if (secao === undefined) return;

    const dentroDaSecao =
      pendencia.alvo === "perguntas" && pendencia.perguntaId !== null
        ? (posicaoDaPergunta.current[pendencia.perguntaId] ?? 0)
        : 0;

    rolagem.current?.scrollTo({
      // Um respiro acima do item: colado na borda de cima, o cartao parece
      // cortado e o inspetor nao ve de onde a tela veio.
      y: Math.max(0, secao + dentroDaSecao - espaco.confortavel),
      animated: true,
    });

    // O motivo e digitado: alem de mostrar o campo, ja deixa o teclado pronto.
    if (pendencia.alvo === "motivo") campoDoMotivo.current?.focus();
  }, []);

  /** Fecha a janela do "Desfazer" e apaga o arquivo de vez. */
  const confirmarRemocao = useCallback(() => {
    const pendente = remocaoPendente.current;
    if (!pendente) return;

    clearTimeout(pendente.espera);
    remocaoPendente.current = null;
    setTemRemocaoPendente(false);
    esquecerFoto(chave, pendente.uri);
  }, [chave]);

  const removerFoto = useCallback(
    (uri: string, dono: DonoDaFoto) => {
      const lista = dono === null ? fotos : (fotosDePergunta[dono] ?? []);
      const indice = lista.indexOf(uri);
      if (indice === -1) return;

      // Um desfazer por vez: a remocao anterior, se ainda estava na janela,
      // passa a valer agora.
      confirmarRemocao();

      setFotoAberta(null);
      if (dono === null) {
        setFotos((atuais) => atuais.filter((foto) => foto !== uri));
      } else {
        setFotosDePergunta((atuais) =>
          comFotos(atuais, dono, (atuais[dono] ?? []).filter((foto) => foto !== uri)),
        );
      }
      remocaoPendente.current = {
        uri,
        dono,
        indice,
        espera: setTimeout(confirmarRemocao, DURACAO_DO_DESFAZER),
      };
      setTemRemocaoPendente(true);
    },
    [confirmarRemocao, fotos, fotosDePergunta],
  );

  const desfazerRemocao = useCallback(() => {
    const pendente = remocaoPendente.current;
    if (!pendente) return;

    const { dono } = pendente;
    const lista = dono === null ? fotos : (fotosDePergunta[dono] ?? []);
    const teto = dono === null ? MAXIMO_DE_FOTOS : MAXIMO_DE_FOTOS_POR_PERGUNTA;

    // Outra foto ocupou a vaga dentro da janela: nao ha onde devolver esta, e
    // passar do teto quebraria o `esquemaDeChecklistDeVisita` so no envio.
    if (lista.length >= teto) {
      confirmarRemocao();
      return;
    }

    clearTimeout(pendente.espera);
    remocaoPendente.current = null;
    setTemRemocaoPendente(false);

    const restaurar = (atuais: string[]) => {
      const restauradas = [...atuais];
      restauradas.splice(Math.min(pendente.indice, restauradas.length), 0, pendente.uri);
      return restauradas;
    };

    if (dono === null) setFotos(restaurar);
    else setFotosDePergunta((atuais) => comFotos(atuais, dono, restaurar(atuais[dono] ?? [])));
  }, [confirmarRemocao, fotos, fotosDePergunta]);

  // Saindo da tela dentro da janela, a remocao vale: o inspetor tocou em
  // remover e nao desfez.
  useEffect(() => confirmarRemocao, [confirmarRemocao]);

  /** `dono` nulo: foto do checklist inteiro; um id: foto daquela pergunta. */
  const anexarFoto = useCallback(async (dono: DonoDaFoto) => {
    try {
      // `requestCameraPermissionsAsync` a cada toque, e nao uma vez na
      // abertura: a permissao pode ser revogada pelas configuracoes do sistema
      // com o app aberto, e pedir no momento do uso e o que o inspetor entende
      // -- ele acabou de tocar em "Tirar foto".
      const permissao = await SeletorDeImagem.requestCameraPermissionsAsync();

      if (!permissao.granted) {
        setDestaque(null);
        setErro("Autorize o acesso à câmera para anexar a foto.");
        return;
      }

      const resultado = await SeletorDeImagem.launchCameraAsync({
        mediaTypes: ["images"],
        // A foto e prova de campo, nao material de catalogo: 0.6 corta o
        // arquivo a uma fracao sem perder o que a imagem precisa mostrar, e e
        // a diferenca entre o envio terminar ou nao numa rede fraca.
        quality: 0.6,
      });

      if (resultado.canceled) return;

      // Reduz (ver `reduzirFoto`) e copia para fora do cache antes de entrar
      // na tela -- ver `guardarFoto`. Nessa ordem: o rascunho guarda a versao
      // que vai ser enviada, e nao a de 12 MP.
      const guardadas = await Promise.all(
        resultado.assets.map(async (a) => guardarFoto(chave, await reduzirFoto(a.uri))),
      );

      setErro(null);
      if (dono === null) {
        setFotos((atuais) => [...atuais, ...guardadas].slice(0, MAXIMO_DE_FOTOS));
      } else {
        setFotosDePergunta((atuais) =>
          comFotos(atuais, dono, [...(atuais[dono] ?? []), ...guardadas].slice(0, MAXIMO_DE_FOTOS_POR_PERGUNTA)),
        );
      }
    } catch {
      // As duas chamadas acima REJEITAM de verdade -- camera indisponivel,
      // outro seletor ja aberto. A funcao e descartada com `void` no botao,
      // entao sem este ramo a rejeicao sumia sem deixar rastro: o inspetor
      // tocava em "Tirar foto" e a tela nao reagia nem explicava, que e o
      // formato de falha mais caro para quem esta em campo.
      setDestaque(null);
      setErro("Não foi possível abrir a câmera. Tente de novo.");
    }
  }, [chave]);

  const enviar = useCallback(async () => {
    if (envioEmVoo.current) return;

    envioEmVoo.current = true;

    try {
      setErro(null);
      setDestaque(null);

      // Checagens locais antes de gastar rede: subir cinco fotos para depois
      // descobrir que falta a assinatura e o pior desfecho possivel aqui. A
      // primeira pendencia e a de cima na tela -- e para la que a rolagem vai.
      const [pendencia] = pendencias;

      if (pendencia) {
        setErro(pendencia.mensagem);
        setDestaque(pendencia.alvo);
        rolarAte(pendencia);
        return;
      }

      const lista = perguntas ?? [];
      const traco = await assinatura.current?.capturar();

      if (!traco) {
        // Com `temAssinatura` verdadeiro (senao a pendencia acima teria
        // parado), o `null` e falha de rasterizacao, nao traco faltando:
        // mandar o inspetor "colher a assinatura" seria pedir o que ele ja fez.
        setErro("Não foi possível gerar a assinatura. Toque em Finalizar de novo.");
        return;
      }

      setEnviando(true);

      // Depois das checagens locais e antes da primeira foto: o caminho da
      // midia no Storage leva o id da visita. Guardado na ref, um segundo
      // "Finalizar" depois de falha no envio reusa a mesma visita.
      if (visitaCriada.current === null) {
        if (!site || !funcionarioId) {
          setErro("Não foi possível registrar a visita. Tente de novo.");
          return;
        }
        const criada = await criarVisitaPeloSite(site, funcionarioId, numeroColeta);
        if (!criada.ok) {
          setErro(criada.erro);
          return;
        }
        visitaCriada.current = criada.visitaId;
      }

      const resultado = await enviarChecklist({
        visitaId: visitaCriada.current,
        tipo,
        motivo: tipo === "CORRETIVA" ? motivo : undefined,
        modeloId: tipo === "CONSULTORIA" ? (modeloEfetivo ?? undefined) : undefined,
        fotosDePergunta: tipo === "CONSULTORIA" ? fotosDasPerguntas : undefined,
        respostas:
          tipo === "CONSULTORIA"
            ? lista.map((pergunta) => ({
                perguntaId: pergunta.id,
                resposta: respostas[pergunta.id],
                observacao: null,
              }))
            : undefined,
        fotos,
        assinatura: traco,
      }, midiaJaEnviada.current);

      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }

      // O checklist ja esta no banco: o rascunho perdeu o motivo de existir.
      // Falhar aqui nao desfaz o envio, entao so registra e segue.
      await descartarRascunho(chave).catch((falha) => {
        capturarErro(falha, { onde: "descartarRascunho", visita: String(chave) });
      });

      aoConcluir();
    } catch {
      // `enviarChecklist` nao rejeita, mas a captura da assinatura e o resto
      // deste bloco sao chamados com `void` pelo botao: uma rejeicao aqui
      // sumiria calada e o inspetor ficaria sem resposta nenhuma na tela.
      setErro("Não foi possível enviar o checklist.");
    } finally {
      // No `finally`, e nao so depois do envio: qualquer saida deste bloco
      // precisa soltar o botao, ou ele fica em "enviando" para sempre.
      setEnviando(false);
      envioEmVoo.current = false;
    }
  }, [aoConcluir, chave, fotos, fotosDasPerguntas, funcionarioId, modeloEfetivo, motivo, numeroColeta, pendencias, perguntas, respostas, rolarAte, site, tipo]);

  // Chamada de dentro de uma arrow no `onLayout`, e nao devolvendo o handler
  // pronto: uma fabrica chamada no render "passa a ref" durante o render, que
  // e o que o `react-hooks/refs` do React Compiler recusa.
  const medirSecao = useCallback((secao: Secao, evento: LayoutChangeEvent) => {
    posicaoDaSecao.current[secao] = evento.nativeEvent.layout.y;
  }, []);

  /** Pintar o item so enquanto ele continua pendente. */
  const destacar = (alvo: Pendencia["alvo"]) =>
    destaque === alvo && pendencias.some((pendencia) => pendencia.alvo === alvo);

  // Erro de pendencia some quando a pendencia e resolvida, e o rodape volta a
  // mostrar o resumo. Erro sem alvo (rede, camera) fica ate a proxima acao.
  const erroVisivel =
    erro && (destaque === null || pendencias.some((pendencia) => pendencia.alvo === destaque))
      ? erro
      : null;

  return (
    <KeyboardAvoidingView
      style={estilos.raiz}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={rolagem}
        style={estilos.rolagem}
        contentContainerStyle={estilos.conteudo}
        scrollEnabled={!assinando}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={estilos.titulo}>Coleta {numeroColeta}</Text>
        <Text style={estilos.subtitulo}>{ROTULO_DO_TIPO[tipo]}</Text>

        {tipo === "CORRETIVA" ? (
          <View style={estilos.secao} onLayout={(evento) => medirSecao("motivo", evento)}>
            <Campo
              ref={campoDoMotivo}
              rotulo="Motivo da visita"
              valor={motivo}
              aoMudar={setMotivo}
              erro={destacar("motivo") ? "Informe o motivo da visita." : undefined}
              placeholder="Descreva o que motivou a visita"
              // O mesmo teto que o `esquemaDeChecklistDeVisita` aplica, aqui
              // no campo -- como o `LIMITE_EMAIL` no login, e pela mesma razao,
              // que neste caminho custa mais caro: o `safeParse` do envio roda
              // DEPOIS de a assinatura e todas as fotos ja terem subido
              // (`envio-de-checklist.ts`). Sem o limite na digitacao, um texto
              // colado longo demais so falhava no fim, com a rede de campo ja
              // gasta e os arquivos orfaos no bucket.
              maxLength={LIMITE_MOTIVO}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        ) : null}

        {tipo === "CONSULTORIA" ? (
          <View style={estilos.secao} onLayout={(evento) => medirSecao("perguntas", evento)}>
            {erroDePerguntas ? <Aviso mensagem={erroDePerguntas} /> : null}

            {/* So quando o grupo tem mais de um modelo -- com um, a tela segue
                direto. Fica visivel depois da escolha para permitir trocar:
                as respostas ficam guardadas por pergunta, entao voltar ao
                primeiro modelo nao perde o que foi marcado nele. */}
            {modelos !== null && modelos.length > 1 ? (
              <View style={estilos.escolhaDoModelo}>
                <Text style={[estilos.rotulo, escolhaDeModeloPendente && destacar("perguntas") && estilos.rotuloPendente]}>
                  Qual checklist?
                </Text>
                <View accessibilityRole="radiogroup" accessibilityLabel="Qual checklist?" style={estilos.modelos}>
                  {modelos.map((modelo) => {
                    const escolhido = modelo.id === modeloEfetivo;

                    return (
                      <Pressable
                        key={modelo.id}
                        onPress={() => setModeloEscolhido(modelo.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: escolhido }}
                        style={({ pressed }) => [
                          estilos.resposta,
                          estilos.modelo,
                          escolhido && ESTILO_DA_ESCOLHA.SIM.opcao,
                          pressed && estilos.opcaoPressionada,
                        ]}
                      >
                        <Text style={[estilos.respostaTexto, escolhido && ESTILO_DA_ESCOLHA.SIM.texto]}>
                          {modelo.nome}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {carregandoPerguntas ? (
              <EsqueletoDaLista />
            ) : (
              (perguntas ?? []).map((pergunta) => (
                <View
                  key={pergunta.id}
                  onLayout={(evento) => {
                    posicaoDaPergunta.current[pergunta.id] = evento.nativeEvent.layout.y;
                  }}
                >
                  <Cartao
                    estilo={[
                      estilos.pergunta,
                      destacar("perguntas") && !respostas[pergunta.id] && estilos.perguntaPendente,
                    ]}
                  >
                    <Text style={estilos.perguntaTexto}>
                      {pergunta.ordem}. {pergunta.texto}
                    </Text>

                    <View
                      style={estilos.respostas}
                      accessibilityRole="radiogroup"
                      accessibilityLabel={pergunta.texto}
                    >
                      {respostasDoTipo(pergunta.tipoResposta).map((valor) => {
                        const escolhida = respostas[pergunta.id] === valor;
                        // Sim/Nao nao e conformidade: "Sim" em "Duvidas com o
                        // RH?" nao e acerto nem falha, entao os dois ficam na
                        // cor neutra, e nao no verde/vermelho de Conforme.
                        const estilo = pergunta.tipoResposta === "SN" ? ESTILO_DA_ESCOLHA.NA : ESTILO_DA_ESCOLHA[valor];

                        return (
                          <Pressable
                            key={valor}
                            onPress={() =>
                              setRespostas((atuais) => ({ ...atuais, [pergunta.id]: valor }))
                            }
                            accessibilityRole="radio"
                            accessibilityState={{ selected: escolhida }}
                            style={({ pressed }) => [
                              estilos.resposta,
                              escolhida && estilo.opcao,
                              pressed && estilos.opcaoPressionada,
                            ]}
                          >
                            <Text style={[estilos.respostaTexto, escolhida && estilo.texto]}>
                              {rotuloDaResposta(pergunta.tipoResposta, valor)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <FotosDaPergunta
                      fotos={fotosDePergunta[pergunta.id] ?? []}
                      aoAbrir={(uri) => setFotoAberta({ uri, dono: pergunta.id })}
                      aoRemover={(uri) => removerFoto(uri, pergunta.id)}
                      aoTirar={() => {
                        void anexarFoto(pergunta.id);
                      }}
                    />
                  </Cartao>
                </View>
              ))
            )}
          </View>
        ) : null}

        <View style={estilos.secao} onLayout={(evento) => medirSecao("fotos", evento)}>
          <View style={estilos.cabecalhoDaSecao}>
            <Text style={[estilos.rotulo, destacar("fotos") && estilos.rotuloPendente]}>
              {/* Na consultoria, "gerais": ha tambem a foto de cada pergunta. */}
              {tipo === "CONSULTORIA" ? "Fotos gerais" : "Fotos"} ({fotos.length}/{MAXIMO_DE_FOTOS})
            </Text>
          </View>

          {fotos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.tiras}>
              {fotos.map((uri, indice) => (
                // Miniatura e "remover" sao irmaos, e nao um dentro do outro:
                // um Pressable acessivel engole os filhos para o leitor de
                // tela, e o "remover" deixaria de ser alcancavel.
                <View key={uri} style={estilos.tira}>
                  <Pressable
                    onPress={() => setFotoAberta({ uri, dono: null })}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Ver foto ${indice + 1} de ${fotos.length}`}
                  >
                    <Image source={{ uri }} alt="Foto anexada à visita" style={estilos.miniatura} />
                  </Pressable>
                  <Pressable
                    onPress={() => removerFoto(uri, null)}
                    // O circulo tem 22 de desenho; o alvo de toque vai a 44
                    // pelo `hitSlop`, sem crescer por cima da foto.
                    hitSlop={11}
                    accessibilityRole="button"
                    accessibilityLabel={`Remover foto ${indice + 1}`}
                    style={estilos.remover}
                  >
                    <Text style={estilos.removerTexto}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <Botao
            titulo="Tirar foto"
            variante="secundaria"
            tamanho="medio"
            larguraTotal
            desabilitado={fotos.length >= MAXIMO_DE_FOTOS}
            aoPressionar={() => {
              void anexarFoto(null);
            }}
          />
        </View>

        <View style={estilos.secao} onLayout={(evento) => medirSecao("assinatura", evento)}>
          <AreaDeAssinatura
            rotulo="Assinatura do responsável"
            aoMudar={setTemAssinatura}
            aoAssinar={setAssinando}
            ref={assinatura}
          />
        </View>
      </ScrollView>

      {/* Rodape fixo: o "Finalizar" fica sempre na zona do polegar, e o que
          falta fica escrito ao lado dele -- antes, numa consultoria de dez
          perguntas, o inspetor so descobria a pendencia rolando ate o fim. */}
      <View style={[estilos.rodape, { paddingBottom: espaco.interno + bordas.bottom }]}>
        {/* Miolo na coluna de leitura: a barra vai de borda a borda, mas
            botao e resumo ficam alinhados com o formulario em cima. */}
        <View style={estilos.rodapeMiolo}>
          {progresso ? (
            <View style={estilos.progresso}>
              <View
                style={estilos.trilho}
                accessibilityRole="progressbar"
                accessibilityLabel="Perguntas respondidas"
                accessibilityValue={{ min: 0, max: progresso.total, now: progresso.respondidas }}
              >
                <View
                  style={[
                    estilos.preenchimento,
                    { width: `${(progresso.respondidas / progresso.total) * 100}%` },
                  ]}
                />
              </View>
              <Text style={estilos.contagem}>
                {progresso.respondidas}/{progresso.total}
              </Text>
            </View>
          ) : null}

          {/* O "Desfazer" mora aqui, no lugar da linha de resumo e com a mesma
              altura, e nao na secao de fotos: la, quando a janela fechava, o
              "Tirar foto" subia para onde ele estava e o toque atrasado abria a
              camera. Aqui, sumir nao move nada -- o toque atrasado cai no texto
              do resumo, que nao faz nada. */}
          {temRemocaoPendente ? (
            <View style={estilos.desfazer} accessibilityLiveRegion="polite">
              <Text style={estilos.resumo}>Foto removida.</Text>
              <Pressable
                onPress={desfazerRemocao}
                hitSlop={espaco.entreItens}
                accessibilityRole="button"
                accessibilityLabel="Desfazer remoção da foto"
              >
                <Text style={estilos.desfazerAcao}>Desfazer</Text>
              </Pressable>
            </View>
          ) : erroVisivel ? (
            <Aviso mensagem={erroVisivel} />
          ) : (
            <Text
              style={[estilos.resumo, pendencias.length === 0 && estilos.resumoPronto]}
              accessibilityLiveRegion="polite"
            >
              {textoDoResumo(pendencias)}
            </Text>
          )}

          <Botao
            titulo="Finalizar visita"
            larguraTotal
            carregando={enviando}
            // Nao desabilitado por campo faltando, de proposito: um botao
            // inerte nao diz *o que* falta. Ele envia e a validacao acima
            // aponta a pendencia -- que e o comportamento do formulario de
            // login do painel.
            aoPressionar={() => {
              void enviar();
            }}
          />
        </View>
      </View>

      <Modal
        visible={fotoAberta !== null}
        animationType="fade"
        onRequestClose={() => setFotoAberta(null)}
        statusBarTranslucent
      >
        <View
          style={[
            estilos.visualizacao,
            { paddingTop: bordas.top + espaco.interno, paddingBottom: bordas.bottom + espaco.interno },
          ]}
        >
          {fotoAberta ? (
            <Image
              source={{ uri: fotoAberta.uri }}
              alt="Foto anexada à visita, em tela cheia"
              style={estilos.fotoInteira}
              resizeMode="contain"
            />
          ) : null}
          <View style={estilos.acoesDaFoto}>
            <Botao
              titulo="Fechar"
              variante="secundaria"
              aoPressionar={() => setFotoAberta(null)}
              estilo={estilos.acaoDaFoto}
            />
            <Botao
              titulo="Remover"
              variante="perigo"
              aoPressionar={() => {
                if (fotoAberta) removerFoto(fotoAberta.uri, fotoAberta.dono);
              }}
              estilo={estilos.acaoDaFoto}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/**
 * Fotos de uma pergunta, dentro do cartao dela (0061): miniaturas e um botao
 * pequeno de camera. Pequeno de proposito -- o cartao e da resposta, e a foto
 * e opcional; um CTA do tamanho do "Tirar foto" geral disputaria a atencao
 * com os botoes de resposta, que sao obrigatorios.
 */
function FotosDaPergunta({
  fotos,
  aoAbrir,
  aoRemover,
  aoTirar,
}: {
  fotos: string[];
  aoAbrir: (uri: string) => void;
  aoRemover: (uri: string) => void;
  aoTirar: () => void;
}) {
  const cheia = fotos.length >= MAXIMO_DE_FOTOS_POR_PERGUNTA;

  return (
    <View style={estilos.fotosDaPergunta}>
      {fotos.map((uri, indice) => (
        // Irmaos, e nao um dentro do outro -- mesma razao das fotos gerais.
        <View key={uri}>
          <Pressable
            onPress={() => aoAbrir(uri)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Ver foto ${indice + 1} da pergunta`}
          >
            <Image source={{ uri }} alt="Foto da pergunta" style={estilos.miniaturaDaPergunta} />
          </Pressable>
          <Pressable
            onPress={() => aoRemover(uri)}
            hitSlop={11}
            accessibilityRole="button"
            accessibilityLabel={`Remover foto ${indice + 1} da pergunta`}
            style={estilos.remover}
          >
            <Text style={estilos.removerTexto}>✕</Text>
          </Pressable>
        </View>
      ))}

      {cheia ? null : (
        <Pressable
          onPress={aoTirar}
          accessibilityRole="button"
          accessibilityLabel="Tirar foto desta pergunta"
          style={({ pressed }) => [estilos.tirarFotoDaPergunta, pressed && estilos.opcaoPressionada]}
        >
          <Text style={estilos.tirarFotoDaPerguntaTexto}>
            {fotos.length === 0 ? "+ Foto" : `+ Foto (${fotos.length}/${MAXIMO_DE_FOTOS_POR_PERGUNTA})`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Troca a lista de uma pergunta no mapa. Lista vazia sai do mapa: pergunta
 * sem foto e pergunta ausente, e o rascunho nao guarda chave que nao diz nada.
 */
function comFotos(mapa: Record<number, string[]>, perguntaId: number, lista: string[]): Record<number, string[]> {
  const novo = { ...mapa };
  if (lista.length === 0) delete novo[perguntaId];
  else novo[perguntaId] = lista;
  return novo;
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  rolagem: { flex: 1 },
  conteudo: { ...colunaDeLeitura, padding: espaco.interno, paddingBottom: espaco.secao },
  titulo: texto(tipografia.titulo, { cor: cores.texto }),
  subtitulo: {
    ...texto(tipografia.apoio, { cor: cores.textoFraco }),
    marginTop: espaco.rotulo,
    marginBottom: espaco.confortavel,
  },
  // Cor da escolha em `ESTILO_DA_ESCOLHA`, no fim do arquivo.
  opcaoPressionada: { opacity: 0.7 },

  secao: { marginTop: espaco.entreCampos, gap: espaco.entreItens },
  cabecalhoDaSecao: { flexDirection: "row", justifyContent: "space-between" },
  rotulo: texto(tipografia.rotulo, { cor: cores.textoFraco, caixaAlta: true }),
  rotuloPendente: { color: cores.erroTextoDeCampo },

  // `marginBottom` no cartao, e nao `gap` na secao: o cartao agora vive dentro
  // de uma View que mede a posicao dele para a rolagem.
  pergunta: { gap: espaco.entreItens, marginBottom: espaco.entreItens },
  // A mesma borda de campo com erro (`Campo.entradaComErro`).
  perguntaPendente: { borderColor: cores.erroBorda },
  perguntaTexto: texto(tipografia.apoio, { cor: cores.texto }),
  respostas: { flexDirection: "row", gap: espaco.minimo, marginTop: espaco.entreItens },
  // O controle mais tocado da tela: altura do CTA (`alturaDeControle.padrao`,
  // 52) e texto de botao denso. Antes era ~34 de altura com texto de 12 --
  // abaixo do minimo de toque do Android (48), em uso com luva e ao sol.
  resposta: {
    flex: 1,
    minHeight: alturaDeControle.padrao,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: espaco.minimo,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.medio,
  },
  respostaTexto: { ...texto(tipografia.botaoDenso, { cor: cores.textoFraco }), textAlign: "center" },

  // Os modelos em coluna, e nao lado a lado como as respostas: sao nomes, de
  // tamanho imprevisivel, e dois lado a lado quebrariam no meio da palavra.
  escolhaDoModelo: { gap: espaco.entreItens, marginBottom: espaco.entreItens },
  modelos: { gap: espaco.minimo },
  modelo: { flex: 0, paddingHorizontal: espaco.interno },

  fotosDaPergunta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: espaco.minimo },
  miniaturaDaPergunta: { width: 56, height: 56, borderRadius: raio.medio, backgroundColor: cores.superficie },
  // Alvo de toque de 44, o minimo, mas baixo e discreto: e opcional.
  tirarFotoDaPergunta: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: espaco.interno,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: cores.borda,
    borderRadius: raio.medio,
  },
  tirarFotoDaPerguntaTexto: texto(tipografia.botaoDenso, { cor: cores.textoFraco }),

  tiras: { flexGrow: 0 },
  tira: { marginRight: espaco.minimo },
  miniatura: { width: 84, height: 84, borderRadius: raio.medio, backgroundColor: cores.superficie },
  remover: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: raio.pilula,
    backgroundColor: cores.fundo,
  },
  removerTexto: texto(tipografia.nota, { cor: cores.texto }),

  // Sem borda nem padding: a linha tem de medir o mesmo que o `resumo` que ela
  // substitui (as duas com altura de linha 20), para o rodape nao mudar de
  // tamanho quando ela aparece e some.
  desfazer: { flexDirection: "row", justifyContent: "center", gap: espaco.minimo },
  desfazerAcao: texto(tipografia.botaoDenso, { cor: cores.primaria }),

  rodape: {
    paddingHorizontal: espaco.interno,
    paddingTop: espaco.entreItens,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    backgroundColor: cores.fundo,
  },
  rodapeMiolo: { ...colunaDeLeitura, gap: espaco.entreItens },
  progresso: { flexDirection: "row", alignItems: "center", gap: espaco.minimo },
  trilho: {
    flex: 1,
    height: 4,
    borderRadius: raio.pilula,
    backgroundColor: cores.borda,
    overflow: "hidden",
  },
  preenchimento: { height: "100%", borderRadius: raio.pilula, backgroundColor: cores.primaria },
  contagem: texto(tipografia.nota, { cor: cores.textoFraco }),
  resumo: { ...texto(tipografia.apoio, { cor: cores.textoFraco }), textAlign: "center" },
  resumoPronto: { color: cores.primaria },

  visualizacao: {
    flex: 1,
    gap: espaco.interno,
    paddingHorizontal: espaco.interno,
    backgroundColor: cores.fundo,
  },
  fotoInteira: { flex: 1, width: "100%" },
  acoesDaFoto: { flexDirection: "row", gap: espaco.entreItens },
  acaoDaFoto: { flex: 1 },
});

/**
 * Cor da resposta escolhida, a mesma leitura do detalhe do checklist no
 * painel (`corDaResposta`): "Nao conforme" em vermelho, que e o que vira nao
 * conformidade no relatorio; "Conforme" em verde; "Nao se aplica" neutro.
 * Antes as tres ficavam iguais, em verde, e o inspetor so via qual tinha
 * marcado lendo o rotulo.
 *
 * So "Nao conforme" ganha fundo (`erroFundo`, o do `Aviso`): e a unica que o
 * gestor precisa achar batendo o olho. Verde de fundo nao entra -- deixaria o
 * texto claro em 1.5:1 (ver `textoSobrePrimaria`).
 */
const ESTILO_DA_ESCOLHA = {
  SIM: StyleSheet.create({
    opcao: { borderColor: cores.primaria },
    texto: { color: cores.primaria },
  }),
  NAO: StyleSheet.create({
    opcao: { borderColor: cores.erroTextoDeCampo, backgroundColor: cores.erroFundo },
    texto: { color: cores.erroTextoDeCampo },
  }),
  NA: StyleSheet.create({
    opcao: { borderColor: cores.textoFraco },
    texto: { color: cores.texto },
  }),
} satisfies Record<RespostaDoChecklist, { opcao: object; texto: object }>;
