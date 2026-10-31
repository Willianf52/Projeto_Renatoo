import { Animated } from "react-native";

import { useEntrada } from "./entrada";

/** So os primeiros itens entram em cascata; ver o comentario do componente. */
const ITENS_EM_CASCATA = 10;
const ATRASO_POR_ITEM_MS = 50;

/**
 * Item de lista que entra subindo, um pouco depois do anterior (31/10/2026):
 * a lista "se monta" em vez de aparecer de uma vez, como o `fade-in-up` do
 * painel.
 *
 * So os primeiros `ITENS_EM_CASCATA`. A lista e virtualizada (`FlatList`): o
 * item 40 so monta quando a pessoa rola ate ele, e animar ali faria cada linha
 * piscar ao rolar -- o efeito e para a abertura da tela, nao para a rolagem.
 * Pelo mesmo motivo o atraso para no decimo item: 50 ms x 10 = meio segundo,
 * o maximo que alguem espera a lista assentar antes de comecar a ler.
 */
export function EntradaEmCascata({ indice, children }: { indice: number; children: React.ReactNode }) {
  if (indice >= ITENS_EM_CASCATA) return <>{children}</>;
  return <ItemAnimado atraso={indice * ATRASO_POR_ITEM_MS}>{children}</ItemAnimado>;
}

function ItemAnimado({ atraso, children }: { atraso: number; children: React.ReactNode }) {
  const entrada = useEntrada(atraso);
  return <Animated.View style={entrada}>{children}</Animated.View>;
}
