import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from "react-native";

import {
  QUANTIDADE_DE_ASSINATURAS,
  mensagemDaPendenciaDeAssinaturas,
  normalizarNome,
  problemaNoNome,
  tituloDaAssinatura,
  type AssinaturaColhida,
} from "../campo/assinaturas";
import { cores, espaco, raio, texto, tipografia } from "../tema";
import { Botao } from "./Botao";
import { Campo } from "./Campo";
import { PranchetaDeAssinatura } from "./PranchetaDeAssinatura";

/**
 * "Assinaturas" do fim do checklist, como no antigo: o botao "Adicionar
 * assinatura" abre uma caixa pedindo o NOME de quem vai assinar, e so depois
 * a tela cheia para o dedo. Sao duas assinaturas, e o nome de cada uma vai
 * para o PDF ("Assinado por <nome>").
 *
 * Quem guarda as assinaturas e a tela do checklist: aqui so se mostra e se
 * pede uma de cada vez. `posicao` e a da lista (1 ou 2); refazer uma troca o
 * nome e a imagem dela, sem mexer nas outras.
 */
type Etapa =
  | { passo: "nome"; posicao: number; nomeInicial: string }
  | { passo: "assinar"; posicao: number; nome: string }
  | null;

export function SecaoDeAssinaturas({
  assinaturas,
  aoMudar,
  destacada = false,
}: {
  assinaturas: readonly AssinaturaColhida[];
  aoMudar: (assinaturas: AssinaturaColhida[]) => void;
  /** Pinta a borda de erro: a tela chama quando a pendencia do envio e esta. */
  destacada?: boolean;
}) {
  const [etapa, setEtapa] = useState<Etapa>(null);
  const [nome, setNome] = useState("");
  const [erroDoNome, setErroDoNome] = useState<string | null>(null);

  const completas = assinaturas.length >= QUANTIDADE_DE_ASSINATURAS;
  const pendencia = mensagemDaPendenciaDeAssinaturas(assinaturas.length);

  const abrirNome = useCallback((posicao: number, nomeInicial = "") => {
    setNome(nomeInicial);
    setErroDoNome(null);
    setEtapa({ passo: "nome", posicao, nomeInicial });
  }, []);

  const confirmarNome = useCallback(() => {
    if (etapa?.passo !== "nome") return;
    const problema = problemaNoNome(nome);
    if (problema) {
      setErroDoNome(problema);
      return;
    }
    setEtapa({ passo: "assinar", posicao: etapa.posicao, nome: normalizarNome(nome) });
  }, [etapa, nome]);

  const salvar = useCallback(
    (png: string) => {
      if (etapa?.passo !== "assinar") return;
      const nova = [...assinaturas];
      nova[etapa.posicao - 1] = { nome: etapa.nome, png };
      aoMudar(nova);
      setEtapa(null);
    },
    [aoMudar, assinaturas, etapa],
  );

  return (
    <View>
      <Text style={estilos.titulo}>Assinaturas</Text>

      <View style={estilos.lista}>
        {assinaturas.map((assinatura, indice) => (
          <View key={indice} style={estilos.cartao}>
            <View style={estilos.cartaoTexto}>
              <Text style={estilos.cartaoTitulo}>{tituloDaAssinatura(indice + 1)}</Text>
              <Text style={estilos.cartaoNome} numberOfLines={1}>
                {assinatura.nome}
              </Text>
            </View>
            <Botao
              titulo="Refazer"
              variante="secundaria"
              tamanho="medio"
              aoPressionar={() => abrirNome(indice + 1, assinatura.nome)}
            />
          </View>
        ))}
      </View>

      {!completas ? (
        <View style={destacada ? estilos.destaque : undefined}>
          <Botao
            titulo="Adicionar assinatura"
            variante="secundaria"
            larguraTotal
            aoPressionar={() => abrirNome(assinaturas.length + 1)}
          />
        </View>
      ) : null}

      <Text style={[estilos.contagem, destacada && !completas && estilos.contagemComErro]} accessibilityLiveRegion="polite">
        {completas
          ? `${QUANTIDADE_DE_ASSINATURAS} de ${QUANTIDADE_DE_ASSINATURAS} assinaturas colhidas.`
          : `${assinaturas.length} de ${QUANTIDADE_DE_ASSINATURAS} assinaturas. ${pendencia ?? ""}`}
      </Text>

      <Modal
        visible={etapa?.passo === "nome"}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setEtapa(null)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={estilos.fundoDaCaixa}>
          <View style={estilos.caixa}>
            <Text style={estilos.caixaTitulo}>{tituloDaAssinatura(etapa?.posicao ?? 1)}</Text>
            <Text style={estilos.caixaApoio}>Informe o nome de quem vai assinar</Text>

            <Campo
              rotulo="Nome"
              valor={nome}
              aoMudar={(valor) => {
                setNome(valor);
                if (erroDoNome) setErroDoNome(null);
              }}
              erro={erroDoNome ?? undefined}
              placeholder="Digite o nome"
              autoFocus
              autoCapitalize="words"
              autoComplete="off"
              returnKeyType="done"
              onSubmitEditing={confirmarNome}
              maxLength={120}
            />

            <View style={estilos.botoes}>
              <View style={estilos.botaoDaCaixa}>
                <Botao titulo="Cancelar" variante="secundaria" larguraTotal aoPressionar={() => setEtapa(null)} />
              </View>
              <View style={estilos.botaoDaCaixa}>
                <Botao titulo="Confirmar" larguraTotal aoPressionar={confirmarNome} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PranchetaDeAssinatura
        visivel={etapa?.passo === "assinar"}
        titulo={etapa?.passo === "assinar" ? `${tituloDaAssinatura(etapa.posicao)} (${etapa.nome})` : ""}
        aoVoltar={() => setEtapa((atual) => (atual?.passo === "assinar" ? { passo: "nome", posicao: atual.posicao, nomeInicial: atual.nome } : null))}
        aoSalvar={salvar}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  titulo: texto(tipografia.rotulo, { cor: cores.textoFraco, caixaAlta: true }),
  lista: { marginTop: espaco.rotulo, gap: espaco.rotulo },
  cartao: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: espaco.interno,
    padding: espaco.interno,
    borderWidth: 1,
    borderColor: cores.primaria,
    borderRadius: raio.grande,
    backgroundColor: cores.superficie,
  },
  cartaoTexto: { flex: 1 },
  cartaoTitulo: texto(tipografia.apoio, { cor: cores.textoFraco }),
  cartaoNome: texto(tipografia.botaoDenso, { cor: cores.texto }),
  destaque: { borderWidth: 1, borderColor: cores.erroBorda, borderRadius: raio.grande, marginTop: espaco.rotulo },
  contagem: { marginTop: espaco.rotulo, ...texto(tipografia.apoio, { cor: cores.textoFraco }) },
  contagemComErro: { color: cores.erroTextoDeCampo },
  fundoDaCaixa: { flex: 1, justifyContent: "center", padding: espaco.interno, backgroundColor: "rgba(0, 0, 0, 0.6)" },
  caixa: {
    gap: espaco.interno,
    padding: espaco.interno,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.grande,
    backgroundColor: cores.superficie,
  },
  caixaTitulo: texto(tipografia.rotulo, { cor: cores.texto }),
  caixaApoio: texto(tipografia.apoio, { cor: cores.textoFraco }),
  botoes: { flexDirection: "row", gap: espaco.interno },
  botaoDaCaixa: { flex: 1 },
});
