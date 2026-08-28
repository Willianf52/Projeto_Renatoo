import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { alturaDeControle } from "@projeto-renatoo/shared";

import { cores, espaco, raio, texto, tipografia } from "../tema";

type Variante = "primaria" | "secundaria" | "perigo";
type Tamanho = "medio" | "grande";

/**
 * Irmao do `Button.tsx` do painel web -- mesmas tres variantes, mesmos dois
 * tamanhos, mesmo comportamento ao toque.
 *
 * A distincao de tamanho e a mesma de la e vale a pena repetir: `grande` e o
 * CTA que carrega a tela (o Entrar do login), `medio` e o botao denso de
 * dentro de uma barra ou de um cartao. O que muda entre eles e altura, raio e
 * caixa do texto; cor, opacidade de desabilitado e a reducao ao pressionar
 * ficam iguais nos dois -- e essa parte igual e justamente a que se perde
 * quando cada tela desenha o proprio botao, foi o que aconteceu na web antes
 * do componente existir.
 *
 * `active:scale-[0.97]` da web vira `transform: scale(0.97)` no estado
 * pressionado. No mobile isso pesa mais que na web: sem hover, a escala e a
 * unica confirmacao de que o toque pegou, num aparelho segurado com luva no
 * meio de uma inspecao.
 */
export function Botao({
  titulo,
  aoPressionar,
  variante = "primaria",
  tamanho = "grande",
  larguraTotal = false,
  carregando = false,
  desabilitado = false,
  estilo,
}: {
  titulo: string;
  aoPressionar: () => void;
  variante?: Variante;
  tamanho?: Tamanho;
  larguraTotal?: boolean;
  carregando?: boolean;
  desabilitado?: boolean;
  estilo?: StyleProp<ViewStyle>;
}) {
  const inerte = desabilitado || carregando;

  return (
    <Pressable
      onPress={aoPressionar}
      disabled={inerte}
      accessibilityRole="button"
      accessibilityState={{ disabled: inerte, busy: carregando }}
      style={({ pressed }) => [
        estilos.base,
        estilos[tamanho],
        estilos[variante],
        larguraTotal && estilos.larguraTotal,
        pressed && !inerte && estilos.pressionado,
        pressed && !inerte && variante === "primaria" && estilos.primariaPressionada,
        inerte && estilos.inerte,
        estilo,
      ]}
    >
      {carregando ? (
        <ActivityIndicator
          size="small"
          color={variante === "primaria" ? cores.textoSobrePrimaria : cores.texto}
        />
      ) : (
        <Text style={[estilos.texto, estilos[`${variante}Texto`], estilos[`${tamanho}Texto`]]}>
          {titulo}
        </Text>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espaco.minimo,
    paddingHorizontal: espaco.confortavel,
  },
  larguraTotal: { width: "100%" },

  medio: { height: alturaDeControle.denso, borderRadius: raio.medio },
  grande: { height: alturaDeControle.padrao, borderRadius: raio.grande },

  primaria: { backgroundColor: cores.primaria },
  secundaria: { borderWidth: 1, borderColor: cores.borda },
  perigo: { borderWidth: 1, borderColor: cores.erroBorda },

  // O verde da marca so tem contraste suficiente com o navy; texto branco em
  // cima dele da 1.5:1 e some ao sol -- que e a condicao de uso deste app.
  primariaTexto: { color: cores.textoSobrePrimaria },
  secundariaTexto: { color: cores.textoFraco },
  perigoTexto: { color: cores.erroTexto },

  texto: { textAlign: "center" },
  grandeTexto: texto(tipografia.botao, { caixaAlta: true }),
  medioTexto: texto(tipografia.botaoDenso),

  pressionado: { transform: [{ scale: 0.97 }] },
  primariaPressionada: { backgroundColor: cores.primariaPressionada },
  inerte: { opacity: 0.6 },
});
