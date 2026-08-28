import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { cores, espaco, raio, texto, tipografia } from "../tema";

/**
 * Superficie elevada com borda -- a moldura que o painel usa em torno de
 * tabela, formulario e barra de filtros.
 *
 * Sobre fundo escuro a separacao vem da *borda*, nunca de sombra: sombra e um
 * escurecimento, e nao ha como escurecer o que ja e `#03031a`. Por isso o
 * cartao aqui nao tem `elevation` nem `shadowOpacity`, ao contrario do que a
 * maioria dos componentes de React Native traz por padrao -- no Android isso
 * renderiza um halo cinza em volta que so suja a borda.
 */
export function Cartao({
  children,
  estilo,
}: {
  children: React.ReactNode;
  estilo?: StyleProp<ViewStyle>;
}) {
  return <View style={[estilos.cartao, estilo]}>{children}</View>;
}

/**
 * Par rotulo/valor dentro de um cartao.
 *
 * E a traducao de uma celula de tabela do painel para a vertical: o que na web
 * e uma coluna com titulo no `<thead>` e valor na linha, num celular vira o
 * titulo em cima do valor -- mesma tipografia de rotulo (`text-xs uppercase
 * tracking-wide text-brand-muted`), mesmo par de informacoes, empilhado. Sem
 * isso o cartao vira uma frase corrida em que ninguem sabe qual numero e o que.
 */
export function LinhaDoCartao({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Text style={estilos.valor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espaco.interno,
  },
  linha: { marginTop: espaco.entreItens },
  rotulo: texto(tipografia.rotulo, { cor: cores.textoFraco, caixaAlta: true }),
  valor: { ...texto(tipografia.apoio, { cor: cores.texto }), marginTop: 2 },
});
