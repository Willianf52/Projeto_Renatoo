import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Marca } from "../componentes/Marca";
import { cores, espaco } from "../tema";

/**
 * Continuacao em React Native da splash nativa -- de proposito indistinguivel
 * dela: mesmo fundo `#03031a`, mesma marca, mesma posicao.
 *
 * Antes desta tela a abertura tinha tres caras: splash branca do Expo (sem
 * config nenhuma em `app.json`), depois um `ActivityIndicator` azul sobre
 * cinza claro, depois o login. Quem abre o app via a marca aparecer, sumir e
 * voltar -- que le como aplicativo travando, nao como aplicativo carregando.
 *
 * Agora a splash nativa (`expo-splash-screen`, configurada em `app.json` com a
 * mesma logo e o mesmo navy) so sai do ar depois que a fonte carrega e o
 * primeiro quadro desta tela ja esta desenhado. A unica coisa que muda entre
 * as duas e o indicador acendendo embaixo da marca -- e ele so aparece se a
 * espera pela sessao passar de um instante, porque ate ai as duas telas sao a
 * mesma imagem parada.
 *
 * `aguardando` distingue os dois usos: sem ele a tela e o quadro estatico que
 * emenda a splash; com ele, a espera pela sessao guardada no Keychain.
 */
export function TelaDeAbertura({ aguardando = true }: { aguardando?: boolean }) {
  return (
    <View style={estilos.raiz}>
      <Marca />
      <View style={estilos.indicador}>
        {aguardando ? <ActivityIndicator color={cores.primaria} /> : null}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: cores.fundo,
  },
  // Altura fixa reservada para o indicador: sem ela a marca subiria alguns
  // pontos quando o spinner some, e o salto seria justo no quadro em que a
  // proxima tela entra.
  indicador: { height: 24, marginTop: espaco.secao, justifyContent: "center" },
});
