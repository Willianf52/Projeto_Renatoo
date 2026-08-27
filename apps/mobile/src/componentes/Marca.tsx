import { Image, StyleSheet } from "react-native";
import { PROPORCAO_DA_LOGO } from "@projeto-renatoo/shared";

/**
 * Marca Up Servicos, do mesmo arquivo que o painel web usa.
 *
 * O PNG tem fundo transparente e texto branco -- foi desenhado para superficie
 * escura, que e o caso de toda tela deste app. Sobre fundo claro ele some, o
 * que e mais um motivo para o tema claro nao voltar por acidente.
 *
 * `altura` (e nao largura) e o parametro porque e a altura que precisa casar
 * com o texto ao lado numa barra; a largura sai da proporcao do arquivo.
 * Os dois tamanhos sao os mesmos do `BrandLogo` da web: 32 em barra apertada,
 * 44 quando a marca tem a folga da tela inteira em volta.
 */
export function Marca({ altura = 44 }: { altura?: number }) {
  return (
    <Image
      source={require("../../assets/logo-up-servicos.png")}
      style={[estilos.marca, { height: altura, width: Math.round(altura * PROPORCAO_DA_LOGO) }]}
      // `alt` (e nao `accessibilityLabel`): faz as duas coisas no React Native
      // -- marca a imagem como acessivel e da o texto. A logo e a identidade,
      // nao decoracao: quem usa leitor de tela precisa saber em que aplicativo
      // esta.
      alt="Up Serviços"
    />
  );
}

const estilos = StyleSheet.create({
  // `contain` para a marca nunca distorcer se o arredondamento da largura
  // divergir da proporcao por um ponto.
  marca: { resizeMode: "contain" },
});
