import type { TextStyle } from "react-native";
// Importados um a um pelo caminho do peso, e nao do indice do pacote: o
// indice reexporta as 18 variantes da Inter (nove pesos, cada um com italico),
// e o Metro empacota tudo que o modulo importado alcanca. Pelo indice, o APK
// levava ~6 MB de fonte para usar quatro arquivos -- num app que e instalado
// por gente em campo, muitas vezes em rede movel.
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { cores, espaco, raio, tipografia } from "@projeto-renatoo/shared";

/**
 * Tema do app de campo.
 *
 * Os valores nao nascem aqui: vem de `packages/shared/src/tema.ts`, a mesma
 * fonte que o painel web usa (ver a nota la sobre o portao de CI que mantem os
 * dois lados iguais). O que este arquivo acrescenta e so o que e de React
 * Native e nao existe em CSS -- familia de fonte por peso e a traducao da
 * escala tipografica para `TextStyle`.
 *
 * Reexportados para a tela nao precisar saber de onde cada um vem.
 */
export { cores, espaco, raio, tipografia };

/**
 * O mapa que o `useFonts` carrega na abertura. A chave e o nome pelo qual
 * `fontFamily` referencia a fonte depois -- por isso e igual ao nome do peso
 * no pacote do Google Fonts, e nao um apelido nosso: um apelido so daria mais
 * um lugar para errar de letra sem aviso do TypeScript.
 */
export const FONTES = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} as const;

type Peso = 400 | 500 | 600 | 700;

const FAMILIA_POR_PESO: Record<Peso, keyof typeof FONTES> = {
  400: "Inter_400Regular",
  500: "Inter_500Medium",
  600: "Inter_600SemiBold",
  700: "Inter_700Bold",
};

/**
 * Converte uma entrada da escala tipografica em estilo de texto.
 *
 * Escolhe a *familia* pelo peso em vez de emitir `fontWeight`, de proposito:
 * com fonte carregada, o Android nao sintetiza peso -- pedir
 * `fontFamily: "Inter"` + `fontWeight: "700"` la devolve o traco regular, e o
 * titulo sai fino so no aparelho, nunca no simulador de iOS onde se testa.
 * Amarrando peso e familia no mesmo lugar, esse desencontro nao tem por onde
 * entrar.
 */
export function texto(
  estilo: (typeof tipografia)[keyof typeof tipografia],
  extras: { cor?: string; caixaAlta?: boolean } = {},
): TextStyle {
  return {
    fontFamily: FAMILIA_POR_PESO[estilo.peso as Peso],
    fontSize: estilo.tamanho,
    lineHeight: estilo.altura,
    letterSpacing: estilo.espacamento,
    ...(extras.cor ? { color: extras.cor } : null),
    ...(extras.caixaAlta ? { textTransform: "uppercase" as const } : null),
  };
}
