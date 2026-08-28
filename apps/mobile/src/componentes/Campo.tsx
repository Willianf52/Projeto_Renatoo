import { forwardRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { cores, espaco, raio, texto, tipografia } from "../tema";
import { IconeDeOlho, IconeDeOlhoFechado } from "./icones";

/**
 * Irmao do `FormField.tsx` do painel: rotulo em caixa alta e cinza-azulado,
 * campo mais escuro que a superficie em que assenta, borda que acende em verde
 * ao receber foco e em vermelho quando o valor nao serve.
 *
 * O campo ser *mais escuro* que o fundo (navy dentro de surface) e o inverso
 * do que a maioria dos apps faz, e e o detalhe que mais identifica a marca de
 * longe -- vale a pena manter mesmo onde daria para "aproveitar" a superficie.
 *
 * Como na web, so senha ganha o botao de revelar: nao ha o que esconder num
 * e-mail, e um olho ali so daria mais um alvo de toque sem funcao.
 */
export const Campo = forwardRef<TextInput, {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  erro?: string;
  senha?: boolean;
} & Omit<TextInputProps, "value" | "onChangeText" | "style">>(function Campo(
  { rotulo, valor, aoMudar, erro, senha = false, ...props },
  ref,
) {
  const [focado, setFocado] = useState(false);
  const [revelada, setRevelada] = useState(false);

  return (
    <View>
      <Text style={estilos.rotulo}>{rotulo}</Text>

      <View>
        <TextInput
          ref={ref}
          value={valor}
          onChangeText={aoMudar}
          onFocus={() => setFocado(true)}
          onBlur={() => setFocado(false)}
          secureTextEntry={senha && !revelada}
          placeholderTextColor={cores.textoFraco}
          // O teclado tambem e superficie do app: claro sobre navy, como todo
          // o resto. Sem isto ele sobe branco e ofusca no escuro.
          keyboardAppearance="dark"
          // Cursor e selecao no verde da marca -- e o mesmo papel do
          // `focus:ring-brand-green` da web.
          selectionColor={cores.primaria}
          accessibilityLabel={rotulo}
          // O erro e anunciado junto do campo, e nao so pintado: quem usa
          // leitor de tela precisa saber por que o envio nao passou.
          accessibilityHint={erro || undefined}
          style={[
            estilos.entrada,
            senha && estilos.entradaComBotao,
            focado && estilos.entradaFocada,
            Boolean(erro) && estilos.entradaComErro,
          ]}
          {...props}
        />

        {senha ? (
          <Pressable
            onPress={() => setRevelada((atual) => !atual)}
            accessibilityRole="button"
            accessibilityLabel={revelada ? "Ocultar senha" : "Mostrar senha"}
            accessibilityState={{ selected: revelada }}
            // Alvo de 44 pontos sem alargar o icone: e o minimo confortavel
            // para dedo, e este aqui e usado com o aparelho na mao, em pe.
            hitSlop={12}
            style={estilos.olho}
          >
            {revelada ? (
              <IconeDeOlhoFechado cor={cores.textoFraco} />
            ) : (
              <IconeDeOlho cor={cores.textoFraco} />
            )}
          </Pressable>
        ) : null}
      </View>

      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
    </View>
  );
});

const ESPACO_DO_OLHO = 44;

const estilos = StyleSheet.create({
  rotulo: {
    ...texto(tipografia.rotulo, { cor: cores.textoFraco, caixaAlta: true }),
    marginBottom: espaco.rotulo,
  },
  entrada: {
    ...texto(tipografia.corpo, { cor: cores.texto }),
    backgroundColor: cores.fundo,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.grande,
    paddingHorizontal: espaco.interno,
    // Vertical menor que o horizontal, como no `px-4 py-3` da web. O
    // `lineHeight` da tipografia ja garante que o texto nao encoste na borda.
    paddingVertical: espaco.entreItens,
  },
  entradaComBotao: { paddingRight: ESPACO_DO_OLHO },
  entradaFocada: { borderColor: cores.primaria },
  // Depois do foco de proposito: um campo focado *e* invalido deve continuar
  // vermelho, senao a correcao some justo enquanto a pessoa a digita.
  entradaComErro: { borderColor: cores.erroBorda },
  olho: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: ESPACO_DO_OLHO,
    alignItems: "center",
    justifyContent: "center",
  },
  erro: {
    ...texto(tipografia.nota, { cor: cores.erroTextoDeCampo }),
    marginTop: espaco.rotulo,
  },
});
