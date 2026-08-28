import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessaoProvider } from "./src/auth/SessaoProvider";
import { Navegacao } from "./src/navegacao/Navegacao";
import { cores, FONTES } from "./src/tema";

/**
 * Em escopo global, sem await: dentro de componente ou efeito isto roda tarde
 * demais -- a splash ja teria sumido sozinha, e a chamada nao a traz de volta.
 * E a propria documentacao do expo-splash-screen que pede assim.
 */
void SplashScreen.preventAutoHideAsync();

// Mesma saida do `--animate-fade-in` do painel (0.4s): a splash nao corta, ela
// dissolve na primeira tela. `fade` so vale no iOS; no Android a transicao ja
// e a do sistema.
SplashScreen.setOptions({ duration: 400, fade: true });

/**
 * Raiz do app de inspecao em campo.
 *
 * So monta os provedores -- quem decide qual tela aparece e `Navegacao`, a
 * partir do estado da sessao. Manter a decisao la, e nao aqui, e o que
 * permite que login, conta inativa e cargo errado sejam ramos de um lugar so.
 */
export default function App() {
  // A Inter e a fonte do painel web. Carregar as quatro variantes (e escolher
  // a familia pelo peso, ver `texto()` em src/tema.ts) e o que faz o negrito
  // sair negrito no Android, onde nao ha sintese de peso.
  const [fontesCarregadas, erroDeFonte] = useFonts(FONTES);

  /**
   * Some com a splash so depois que este primeiro quadro esta desenhado --
   * `onLayout`, e nao um efeito: efeito roda antes da pintura, e o intervalo
   * entre um e outro e exatamente o flash branco que a splash existe para
   * evitar.
   */
  const aoDesenhar = useCallback(() => {
    if (fontesCarregadas || erroDeFonte) SplashScreen.hide();
  }, [fontesCarregadas, erroDeFonte]);

  // Sem fonte ainda e sem erro: a splash nativa continua no ar cobrindo isto.
  // Devolver a arvore agora mostraria o texto na fonte do sistema por um
  // quadro e depois trocaria, com o layout pulando junto.
  //
  // `erroDeFonte` segue em frente de proposito: falha ao carregar a Inter
  // (arquivo corrompido em cache, por exemplo) degrada para a fonte do
  // sistema, que e feio -- e ainda assim melhor que um app que nao abre em
  // campo, onde nao ha o que fazer a respeito.
  if (!fontesCarregadas && !erroDeFonte) return null;

  return (
    <View style={estilos.raiz} onLayout={aoDesenhar}>
      <SafeAreaProvider>
        <SessaoProvider>
          {/* Claro sobre o navy da marca -- o tema do app e escuro, como o do
              painel (`color-scheme: dark` no globals.css). */}
          <StatusBar style="light" />
          <Navegacao />
        </SessaoProvider>
      </SafeAreaProvider>
    </View>
  );
}

const estilos = StyleSheet.create({
  // O navy tambem aqui, e nao so nas telas: e este o fundo que aparece no
  // meio de uma troca de tela e atras do teclado ao abrir.
  raiz: { flex: 1, backgroundColor: cores.fundo },
});
