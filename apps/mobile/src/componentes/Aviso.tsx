import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { cores, espaco, raio, texto, tipografia } from "../tema";

/**
 * Faixa de mensagem presa ao conteudo -- o `<p role="alert">` do formulario de
 * login do painel e o banner de erro das listagens, que sao o mesmo desenho:
 * borda e fundo na cor do assunto, texto claro por cima.
 *
 * Estava escrito duas vezes (login e lista de visitas) com dois raios e dois
 * paddings diferentes antes de virar componente -- a mesma deriva que o
 * `Button.tsx` da web documenta ter sofrido. Duas e o numero em que se
 * extrai; na terceira ja ha tres versoes para reconciliar.
 *
 * Nao e toast: fica no fluxo, empurrando o conteudo, e nao some sozinho. Para
 * confirmacao de acao que redireciona -- o caso do `ToastProvider` do painel --
 * o app de campo ainda nao tem tela nenhuma que redirecione depois de salvar.
 */
export function Aviso({
  mensagem,
  tom = "erro",
  estilo,
}: {
  mensagem: string;
  tom?: "erro" | "sucesso";
  estilo?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[estilos.raiz, tom === "erro" ? estilos.erro : estilos.sucesso, estilo]}
      // `alert` no erro anuncia na hora e interrompe o que o leitor de tela
      // estiver dizendo; sucesso e educado e espera a vez.
      accessibilityRole={tom === "erro" ? "alert" : "text"}
      accessibilityLiveRegion="polite"
    >
      <Text style={[estilos.texto, tom === "erro" ? estilos.textoDeErro : estilos.textoDeSucesso]}>
        {mensagem}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: {
    borderWidth: 1,
    borderRadius: raio.grande,
    paddingHorizontal: espaco.entreItens,
    paddingVertical: espaco.minimo,
  },
  erro: { borderColor: cores.erroBorda, backgroundColor: cores.erroFundo },
  // O verde da marca a 40% de borda, como no toast de sucesso do painel.
  sucesso: { borderColor: cores.primaria, backgroundColor: cores.superficie },
  texto: texto(tipografia.nota),
  textoDeErro: { color: cores.erroTexto },
  textoDeSucesso: { color: cores.texto },
});
