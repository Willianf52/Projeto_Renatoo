import { Pressable, StyleSheet, Text, View } from "react-native";

import { cores, espaco, raio, texto, tipografia } from "../tema";
import { IconeDeConfere } from "./icones";

/**
 * Irma do `<input type="checkbox">` do painel (`accent-brand-green`): quadrado
 * navy com borda, que vira verde marcado. A linha inteira e o alvo de toque,
 * e nao so o quadrado -- 16 pontos e pouco para o dedo.
 */
export function CaixaDeMarcar({
  rotulo,
  marcada,
  aoMudar,
  desabilitada = false,
}: {
  rotulo: string;
  marcada: boolean;
  aoMudar: (marcada: boolean) => void;
  desabilitada?: boolean;
}) {
  return (
    <Pressable
      onPress={() => aoMudar(!marcada)}
      disabled={desabilitada}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcada, disabled: desabilitada }}
      accessibilityLabel={rotulo}
      hitSlop={8}
      style={({ pressed }) => [estilos.linha, pressed && estilos.pressionada]}
    >
      <View style={[estilos.caixa, marcada && estilos.caixaMarcada]}>
        {marcada ? <IconeDeConfere cor={cores.textoSobrePrimaria} /> : null}
      </View>
      <Text style={estilos.rotulo}>{rotulo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: "row", alignItems: "center", gap: espaco.minimo },
  pressionada: { opacity: 0.6 },
  caixa: {
    width: 18,
    height: 18,
    borderRadius: raio.medio - 2,
    borderWidth: 1,
    borderColor: cores.bordaRealcada,
    backgroundColor: cores.fundo,
    alignItems: "center",
    justifyContent: "center",
  },
  caixaMarcada: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  rotulo: texto(tipografia.nota, { cor: cores.textoFraco }),
});
