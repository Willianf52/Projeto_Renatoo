import { StyleSheet, Text, View } from "react-native";

import { IconeDeLupa } from "./icones";
import { cores, espaco, raio, texto, tipografia } from "../tema";

/**
 * Irmao do `EmptyState` do `DataTable.tsx`: lupa dentro de um disco navy,
 * titulo em branco, explicacao em cinza-azulado, tudo centralizado.
 *
 * O disco e o unico lugar da interface em que o navy aparece *acima* da
 * superficie, e nao atras dela. E de proposito: a mesma inversao do campo de
 * formulario, e o que faz o icone assentar em vez de flutuar solto no vazio da
 * tela -- que e justamente o momento em que a tela ja esta vazia demais.
 */
export function EstadoVazio({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <View style={estilos.raiz}>
      <View style={estilos.disco}>
        <IconeDeLupa tamanho={24} cor={cores.textoFraco} />
      </View>
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.descricao}>{descricao}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { alignItems: "center", gap: espaco.entreItens, maxWidth: 320, alignSelf: "center" },
  disco: { backgroundColor: cores.fundo, borderRadius: raio.pilula, padding: espaco.entreItens },
  titulo: texto(tipografia.apoioMedio, { cor: cores.texto }),
  descricao: { ...texto(tipografia.apoio, { cor: cores.textoFraco }), textAlign: "center" },
});
