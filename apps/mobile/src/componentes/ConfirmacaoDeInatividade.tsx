import { useEffect, useRef, useState } from "react";
import { AppState, Modal, StyleSheet, Text, View } from "react-native";

import { precisaConfirmar } from "../auth/inatividade";
import { cores, espaco, raio, texto, tipografia } from "../tema";
import { Botao } from "./Botao";

/**
 * A janela "Sessao em inatividade" (regra em `auth/inatividade.ts`), com as
 * mesmas palavras do app de referencia. Montada so com sessao aberta.
 */
export function ConfirmacaoDeInatividade({ nome, aoSair }: { nome: string; aoSair: () => Promise<void> }) {
  const [aberta, setAberta] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const saiuEm = useRef<number | null>(null);

  useEffect(() => {
    const assinatura = AppState.addEventListener("change", (estado) => {
      if (estado === "active") {
        if (precisaConfirmar(saiuEm.current, Date.now())) setAberta(true);
        saiuEm.current = null;
      } else if (saiuEm.current === null) {
        // "inactive" e "background" contam do primeiro dos dois.
        saiuEm.current = Date.now();
      }
    });
    return () => assinatura.remove();
  }, []);

  const naoSouEu = async () => {
    setSaindo(true);
    try {
      await aoSair();
    } finally {
      setSaindo(false);
      setAberta(false);
    }
  };

  return (
    <Modal visible={aberta} transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={estilos.fundo}>
        <View style={estilos.caixa} accessibilityRole="alert">
          <Text style={estilos.titulo}>Confirmação de usuário</Text>
          <Text style={estilos.subtitulo}>Sessão em inatividade</Text>
          <Text style={estilos.nome}>{nome}</Text>
          <Text style={estilos.corpo}>
            Para proteger sua conta, confirme se você ainda está utilizando o aplicativo.
          </Text>
          <Text style={estilos.apoio}>Se não for você, o app fará logout e voltará para a tela de login.</Text>
          <View style={estilos.botoes}>
            <Botao titulo="Sim. Sou eu" larguraTotal desabilitado={saindo} aoPressionar={() => setAberta(false)} />
            <Botao titulo="Não sou eu" variante="secundaria" larguraTotal carregando={saindo} aoPressionar={naoSouEu} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: espaco.interno,
  },
  caixa: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: cores.superficie,
    borderRadius: raio.cartao,
    padding: espaco.interno,
    gap: espaco.minimo,
  },
  titulo: texto(tipografia.subtitulo, { cor: cores.texto }),
  subtitulo: texto(tipografia.destaque, { cor: cores.texto }),
  nome: texto(tipografia.destaque, { cor: cores.primaria }),
  corpo: texto(tipografia.corpo, { cor: cores.texto }),
  apoio: texto(tipografia.apoio, { cor: cores.textoFraco }),
  botoes: { gap: espaco.minimo, marginTop: espaco.entreItens },
});
