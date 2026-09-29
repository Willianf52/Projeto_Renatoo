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
  RESPOSTAS_DO_CHECKLIST,
  ROTULO_DA_RESPOSTA,
  ROTULO_DO_TIPO,
  type RespostaDoChecklist,
  type Tables,
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
import { AreaDeAssinatura, type ControleDaAssinatura } from "../componentes/AreaDeAssinatura";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { Cartao } from "../componentes/Cartao";
import { EsqueletoDaLista } from "../componentes/Esqueleto";
import { enviarChecklist, type MidiaJaEnviada } from "../lib/envio-de-checklist";
import { capturarErro } from "../lib/observabilidade";
import { reduzirFoto } from "../lib/reduzir-foto";
import { supabase } from "../lib/supabase";
import { cores, espaco, raio, texto, tipografia } from "../tema";

type Pergunta = Pick<Tables<"perguntas_checklist">, "id" | "ordem" | "texto">;

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
  numeroColeta,
  tipo,
  aoConcluir,
}: {
  visitaId: number;
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

  const [motivo, setMotivo] = useState("");
  // `null` e "ainda nao buscadas", `[]` e "buscadas e nao ha nenhuma". Os dois
  // estados sao diferentes na tela -- um mostra esqueleto, o outro diz que o
  // checklist esta vazio -- e colapsa-los num array so obrigaria a um segundo
  // booleano de carregamento para desempatar.
  const [perguntas, setPerguntas] = useState<Pergunta[] | null>(null);
  const [erroDePerguntas, setErroDePerguntas] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Record<number, RespostaDoChecklist>>({});
  const [fotos, setFotos] = useState<string[]>([]);
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
  const [fotoAberta, setFotoAberta] = useState<string | null>(null);

  /**
   * Remocao com "Desfazer". O arquivo so e apagado do disco (`esquecerFoto`)
   * quando a janela fecha -- apagar na hora tornaria o desfazer impossivel.
   * Ref para o timer e o endereco; estado so para a faixa aparecer.
   */
  const remocaoPendente = useRef<{
    uri: string;
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

    lerRascunho(visitaId, funcionarioId)
      .then((rascunho) => {
        if (!ativo || !rascunho) return;
        setMotivo(rascunho.motivo);
        setRespostas(rascunho.respostas);
        setFotos(rascunho.fotos);
      })
      .catch((falha) => {
        // Rascunho ilegivel nao impede de preencher: a tela abre vazia, como
        // abria antes de o rascunho existir.
        capturarErro(falha, { onde: "lerRascunho", visita: String(visitaId) });
      })
      .finally(() => {
        if (ativo) setRascunhoLido(true);
      });

    return () => {
      ativo = false;
    };
  }, [visitaId, funcionarioId]);

  /**
   * Grava a cada mudanca, com um respiro de meio segundo: digitar o motivo
   * nao pode virar uma escrita em disco por tecla. Falha de gravacao nao
   * interrompe o preenchimento -- o rascunho e rede de seguranca, nao etapa.
   */
  useEffect(() => {
    if (!rascunhoLido || !funcionarioId) return;

    const espera = setTimeout(() => {
      salvarRascunho(visitaId, funcionarioId, { motivo, respostas, fotos }).catch((falha) => {
        capturarErro(falha, { onde: "salvarRascunho", visita: String(visitaId) });
      });
    }, 500);

    return () => clearTimeout(espera);
  }, [rascunhoLido, funcionarioId, visitaId, motivo, respostas, fotos]);

  /**
   * As perguntas so sao buscadas quando a CONSULTORIA e escolhida, e nao na
   * abertura da tela: numa corretiva essa consulta nunca serviria para nada, e
   * o app roda em rede movel de canteiro de obra.
   */
  useEffect(() => {
    if (tipo !== "CONSULTORIA" || perguntas !== null) return;

    // Mesma guarda do `SessaoProvider`: resposta que chega depois de a tela
    // sair nao pode pintar nada.
    let ativo = true;

    lerPerguntas()
      .then((resultado) => {
        if (!ativo) return;
        setPerguntas(resultado.perguntas);
        setErroDePerguntas(resultado.erro);
      })
      .catch(() => {
        // `lerPerguntas` ja traduz erro do PostgREST; o que falta e a rejeicao
        // da camada de rede. Sem este ramo o esqueleto fica na tela para
        // sempre -- o mesmo spinner eterno que `TelaDeInspecoes` documenta.
        if (!ativo) return;
        setPerguntas([]);
        setErroDePerguntas("Não foi possível carregar as perguntas do checklist.");
      });

    return () => {
      ativo = false;
    };
  }, [tipo, perguntas]);

  // Derivado, e nao um terceiro estado: com `perguntas === null` significando
  // "ainda nao buscadas", nao ha o que sincronizar -- e por isso o effect
  // acima nao precisa chamar `setState` no corpo.
  const carregandoPerguntas = tipo === "CONSULTORIA" && perguntas === null;

  const estadoDoChecklist = useMemo(
    () => ({
      tipo,
      motivo,
      perguntas,
      respostas,
      quantidadeDeFotos: fotos.length,
      temAssinatura,
    }),
    [tipo, motivo, perguntas, respostas, fotos.length, temAssinatura],
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
    esquecerFoto(visitaId, pendente.uri);
  }, [visitaId]);

  const removerFoto = useCallback(
    (uri: string) => {
      const indice = fotos.indexOf(uri);
      if (indice === -1) return;

      // Um desfazer por vez: a remocao anterior, se ainda estava na janela,
      // passa a valer agora.
      confirmarRemocao();

      setFotoAberta(null);
      setFotos((atuais) => atuais.filter((foto) => foto !== uri));
      remocaoPendente.current = {
        uri,
        indice,
        espera: setTimeout(confirmarRemocao, DURACAO_DO_DESFAZER),
      };
      setTemRemocaoPendente(true);
    },
    [confirmarRemocao, fotos],
  );

  const desfazerRemocao = useCallback(() => {
    const pendente = remocaoPendente.current;
    if (!pendente) return;

    // Outra foto ocupou a vaga dentro da janela: nao ha onde devolver esta, e
    // passar do teto quebraria o `esquemaDeChecklistDeVisita` so no envio.
    if (fotos.length >= MAXIMO_DE_FOTOS) {
      confirmarRemocao();
      return;
    }

    clearTimeout(pendente.espera);
    remocaoPendente.current = null;
    setTemRemocaoPendente(false);
    setFotos((atuais) => {
      const restauradas = [...atuais];
      restauradas.splice(Math.min(pendente.indice, restauradas.length), 0, pendente.uri);
      return restauradas;
    });
  }, [confirmarRemocao, fotos.length]);

  // Saindo da tela dentro da janela, a remocao vale: o inspetor tocou em
  // remover e nao desfez.
  useEffect(() => confirmarRemocao, [confirmarRemocao]);

  const anexarFoto = useCallback(async () => {
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
        resultado.assets.map(async (a) => guardarFoto(visitaId, await reduzirFoto(a.uri))),
      );

      setErro(null);
      setFotos((atuais) => [...atuais, ...guardadas].slice(0, MAXIMO_DE_FOTOS));
    } catch {
      // As duas chamadas acima REJEITAM de verdade -- camera indisponivel,
      // outro seletor ja aberto. A funcao e descartada com `void` no botao,
      // entao sem este ramo a rejeicao sumia sem deixar rastro: o inspetor
      // tocava em "Tirar foto" e a tela nao reagia nem explicava, que e o
      // formato de falha mais caro para quem esta em campo.
      setDestaque(null);
      setErro("Não foi possível abrir a câmera. Tente de novo.");
    }
  }, [visitaId]);

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

      const resultado = await enviarChecklist({
        visitaId,
        tipo,
        motivo: tipo === "CORRETIVA" ? motivo : undefined,
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
      await descartarRascunho(visitaId).catch((falha) => {
        capturarErro(falha, { onde: "descartarRascunho", visita: String(visitaId) });
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
  }, [aoConcluir, fotos, motivo, pendencias, perguntas, respostas, rolarAte, tipo, visitaId]);

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
                      {RESPOSTAS_DO_CHECKLIST.map((valor) => {
                        const escolhida = respostas[pergunta.id] === valor;

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
                              escolhida && ESTILO_DA_ESCOLHA[valor].opcao,
                              pressed && estilos.opcaoPressionada,
                            ]}
                          >
                            <Text
                              style={[estilos.respostaTexto, escolhida && ESTILO_DA_ESCOLHA[valor].texto]}
                            >
                              {ROTULO_DA_RESPOSTA[valor]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Cartao>
                </View>
              ))
            )}
          </View>
        ) : null}

        <View style={estilos.secao} onLayout={(evento) => medirSecao("fotos", evento)}>
          <View style={estilos.cabecalhoDaSecao}>
            <Text style={[estilos.rotulo, destacar("fotos") && estilos.rotuloPendente]}>
              Fotos ({fotos.length}/{MAXIMO_DE_FOTOS})
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
                    onPress={() => setFotoAberta(uri)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Ver foto ${indice + 1} de ${fotos.length}`}
                  >
                    <Image source={{ uri }} alt="Foto anexada à visita" style={estilos.miniatura} />
                  </Pressable>
                  <Pressable
                    onPress={() => removerFoto(uri)}
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
              void anexarFoto();
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
              source={{ uri: fotoAberta }}
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
                if (fotoAberta) removerFoto(fotoAberta);
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
 * Fora do componente e sem `setState`, como `lerVisitas` -- ver a nota em
 * `SessaoProvider` sobre render em cascata.
 *
 * Ordena por `ordem` e nao por `id`: e o que a migration 0042 declara como a
 * sequencia de tela, justamente para uma pergunta nova poder entrar no meio
 * da lista sem reescrever ids ja respondidos.
 */
async function lerPerguntas(): Promise<{ perguntas: Pergunta[]; erro: string | null }> {
  const { data, error } = await supabase
    .from("perguntas_checklist")
    .select("id, ordem, texto")
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) {
    return { perguntas: [], erro: "Não foi possível carregar as perguntas do checklist." };
  }

  return { perguntas: data ?? [], erro: null };
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  rolagem: { flex: 1 },
  conteudo: { padding: espaco.interno, paddingBottom: espaco.secao },
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
    gap: espaco.entreItens,
    paddingHorizontal: espaco.interno,
    paddingTop: espaco.entreItens,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    backgroundColor: cores.fundo,
  },
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
