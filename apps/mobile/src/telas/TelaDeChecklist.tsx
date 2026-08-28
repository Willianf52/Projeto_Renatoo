import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as SeletorDeImagem from "expo-image-picker";
import {
  MAXIMO_DE_FOTOS,
  RESPOSTAS_DO_CHECKLIST,
  ROTULO_DA_RESPOSTA,
  ROTULO_DO_TIPO,
  TIPOS_DE_VISITA,
  type RespostaDoChecklist,
  type Tables,
  type TipoDeVisita,
} from "@projeto-renatoo/shared";

import { AreaDeAssinatura, type ControleDaAssinatura } from "../componentes/AreaDeAssinatura";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { Cartao } from "../componentes/Cartao";
import { EsqueletoDaLista } from "../componentes/Esqueleto";
import { enviarChecklist } from "../lib/envio-de-checklist";
import { supabase } from "../lib/supabase";
import { cores, espaco, raio, texto, tipografia } from "../tema";

type Pergunta = Pick<Tables<"perguntas_checklist">, "id" | "ordem" | "texto">;

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
  aoConcluir,
}: {
  visitaId: number;
  numeroColeta: number;
  aoConcluir: () => void;
}) {
  const [tipo, setTipo] = useState<TipoDeVisita | null>(null);
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

  const assinatura = useRef<ControleDaAssinatura>(null);

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

  const anexarFoto = useCallback(async () => {
    // `requestCameraPermissionsAsync` a cada toque, e nao uma vez na abertura:
    // a permissao pode ser revogada pelas configuracoes do sistema com o app
    // aberto, e pedir no momento do uso e o que o inspetor entende -- ele
    // acabou de tocar em "Tirar foto".
    const permissao = await SeletorDeImagem.requestCameraPermissionsAsync();

    if (!permissao.granted) {
      setErro("Autorize o acesso à câmera para anexar a foto.");
      return;
    }

    const resultado = await SeletorDeImagem.launchCameraAsync({
      mediaTypes: ["images"],
      // A foto e prova de campo, nao material de catalogo: 0.6 corta o arquivo
      // a uma fracao sem perder o que a imagem precisa mostrar, e e a
      // diferenca entre o envio terminar ou nao numa rede fraca.
      quality: 0.6,
    });

    if (resultado.canceled) return;

    setErro(null);
    setFotos((atuais) => [...atuais, ...resultado.assets.map((a) => a.uri)].slice(0, MAXIMO_DE_FOTOS));
  }, []);

  const enviar = useCallback(async () => {
    if (!tipo) return;

    setErro(null);

    // Checagens locais antes de gastar rede: subir cinco fotos para depois
    // descobrir que falta a assinatura e o pior desfecho possivel aqui.
    if (tipo === "CORRETIVA" && motivo.trim() === "") {
      setErro("Informe o motivo da visita.");
      return;
    }

    const lista = perguntas ?? [];

    if (tipo === "CONSULTORIA") {
      const semResposta = lista.filter((pergunta) => !respostas[pergunta.id]);

      if (lista.length === 0 || semResposta.length > 0) {
        setErro(
          lista.length === 0
            ? "Nenhuma pergunta cadastrada no checklist."
            : `Responda todas as perguntas (faltam ${semResposta.length}).`,
        );
        return;
      }
    }

    if (fotos.length === 0) {
      setErro("Anexe ao menos uma foto.");
      return;
    }

    const traco = await assinatura.current?.capturar();

    if (!traco) {
      setErro("Colha a assinatura do responsável.");
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
    });

    setEnviando(false);

    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }

    aoConcluir();
  }, [aoConcluir, fotos, motivo, perguntas, respostas, tipo, visitaId]);

  return (
    <KeyboardAvoidingView
      style={estilos.raiz}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={estilos.conteudo}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={estilos.titulo}>Coleta {numeroColeta}</Text>
        <Text style={estilos.subtitulo}>Selecione o tipo de visita para continuar.</Text>

        {/* As duas opcoes da tela. Cartao inteiro e o alvo de toque, e nao um
            radio de 20 pontos ao lado do texto: o aparelho e usado em pe, as
            vezes com luva. */}
        <View style={estilos.opcoes}>
          {TIPOS_DE_VISITA.map((opcao) => (
            <Pressable
              key={opcao}
              onPress={() => {
                setTipo(opcao);
                setErro(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: tipo === opcao }}
              style={({ pressed }) => [
                estilos.opcao,
                tipo === opcao && estilos.opcaoEscolhida,
                pressed && estilos.opcaoPressionada,
              ]}
            >
              <Text style={[estilos.opcaoTexto, tipo === opcao && estilos.opcaoTextoEscolhido]}>
                {ROTULO_DO_TIPO[opcao]}
              </Text>
              <Text style={estilos.opcaoApoio}>
                {opcao === "CORRETIVA"
                  ? "Motivo da visita, foto e assinatura"
                  : "Checklist completo, foto e assinatura"}
              </Text>
            </Pressable>
          ))}
        </View>

        {erro ? <Aviso mensagem={erro} estilo={estilos.aviso} /> : null}

        {tipo === "CORRETIVA" ? (
          <View style={estilos.secao}>
            <Campo
              rotulo="Motivo da visita"
              valor={motivo}
              aoMudar={setMotivo}
              placeholder="Descreva o que motivou a visita"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        ) : null}

        {tipo === "CONSULTORIA" ? (
          <View style={estilos.secao}>
            {erroDePerguntas ? <Aviso mensagem={erroDePerguntas} /> : null}

            {carregandoPerguntas ? (
              <EsqueletoDaLista />
            ) : (
              (perguntas ?? []).map((pergunta) => (
                <Cartao key={pergunta.id} estilo={estilos.pergunta}>
                  <Text style={estilos.perguntaTexto}>
                    {pergunta.ordem}. {pergunta.texto}
                  </Text>

                  <View style={estilos.respostas}>
                    {RESPOSTAS_DO_CHECKLIST.map((valor) => (
                      <Pressable
                        key={valor}
                        onPress={() =>
                          setRespostas((atuais) => ({ ...atuais, [pergunta.id]: valor }))
                        }
                        accessibilityRole="radio"
                        accessibilityState={{ selected: respostas[pergunta.id] === valor }}
                        style={({ pressed }) => [
                          estilos.resposta,
                          respostas[pergunta.id] === valor && estilos.respostaEscolhida,
                          pressed && estilos.opcaoPressionada,
                        ]}
                      >
                        <Text
                          style={[
                            estilos.respostaTexto,
                            respostas[pergunta.id] === valor && estilos.respostaTextoEscolhido,
                          ]}
                        >
                          {ROTULO_DA_RESPOSTA[valor]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </Cartao>
              ))
            )}
          </View>
        ) : null}

        {tipo ? (
          <>
            <View style={estilos.secao}>
              <View style={estilos.cabecalhoDaSecao}>
                <Text style={estilos.rotulo}>
                  Fotos ({fotos.length}/{MAXIMO_DE_FOTOS})
                </Text>
              </View>

              {fotos.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.tiras}>
                  {fotos.map((uri) => (
                    <Pressable
                      key={uri}
                      onPress={() => setFotos((atuais) => atuais.filter((f) => f !== uri))}
                      accessibilityRole="button"
                      accessibilityLabel="Remover foto"
                      style={estilos.tira}
                    >
                      <Image source={{ uri }} alt="Foto anexada à visita" style={estilos.miniatura} />
                      <View style={estilos.remover}>
                        <Text style={estilos.removerTexto}>✕</Text>
                      </View>
                    </Pressable>
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

            <View style={estilos.secao}>
              <AreaDeAssinatura rotulo="Assinatura do responsável" aoMudar={setTemAssinatura} ref={assinatura} />
            </View>

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
              estilo={estilos.enviar}
            />

            {!temAssinatura ? (
              <Text style={estilos.dica}>A assinatura do responsável é obrigatória.</Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
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
  conteudo: { padding: espaco.interno, paddingBottom: espaco.secao },
  titulo: texto(tipografia.titulo, { cor: cores.texto }),
  subtitulo: {
    ...texto(tipografia.apoio, { cor: cores.textoFraco }),
    marginTop: espaco.rotulo,
    marginBottom: espaco.confortavel,
  },
  opcoes: { gap: espaco.entreItens },
  opcao: {
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.cartao,
    padding: espaco.interno,
  },
  // A escolha e marcada pela borda verde, nao por preenchimento: preencher o
  // cartao de verde deixaria o texto branco em 1.5:1 em cima dele.
  opcaoEscolhida: { borderColor: cores.primaria },
  opcaoPressionada: { opacity: 0.7 },
  opcaoTexto: texto(tipografia.destaque, { cor: cores.texto }),
  opcaoTextoEscolhido: { color: cores.primaria },
  opcaoApoio: { ...texto(tipografia.nota, { cor: cores.textoFraco }), marginTop: 2 },

  aviso: { marginTop: espaco.entreItens },
  secao: { marginTop: espaco.entreCampos, gap: espaco.entreItens },
  cabecalhoDaSecao: { flexDirection: "row", justifyContent: "space-between" },
  rotulo: texto(tipografia.rotulo, { cor: cores.textoFraco, caixaAlta: true }),

  pergunta: { gap: espaco.entreItens },
  perguntaTexto: texto(tipografia.apoio, { cor: cores.texto }),
  respostas: { flexDirection: "row", gap: espaco.minimo, marginTop: espaco.entreItens },
  resposta: {
    flex: 1,
    alignItems: "center",
    paddingVertical: espaco.minimo,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.medio,
  },
  respostaEscolhida: { borderColor: cores.primaria },
  respostaTexto: texto(tipografia.nota, { cor: cores.textoFraco }),
  respostaTextoEscolhido: { color: cores.primaria },

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

  enviar: { marginTop: espaco.entreCampos },
  dica: {
    ...texto(tipografia.nota, { cor: cores.textoFraco }),
    marginTop: espaco.minimo,
    textAlign: "center",
  },
});
