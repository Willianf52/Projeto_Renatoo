import { Component, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { capturarErro } from "../lib/observabilidade";
import { cores, espaco } from "../tema";
import { Botao } from "./Botao";
import { EstadoVazio } from "./EstadoVazio";

/**
 * A ultima rede antes do app fechar na mao do inspetor.
 *
 * Erro lancado durante o render nao passa por `try/catch` nenhum das telas:
 * sem um limite, o React desmonta a arvore inteira e, no build de release, o
 * handler fatal do React Native encerra o processo. `Sentry.wrap` (em
 * `observabilidade-sentry.ts`) so REPORTA -- nao desenha nada no lugar, e sem
 * DSN nem existe.
 *
 * "Tentar de novo" remonta tudo abaixo pela `key`, e nao so limpa o estado:
 * o que quebrou pode ser estado de uma tela, e reusar a mesma instancia
 * repetiria o erro. Nada se perde nessa remontagem -- a ronda mora na fila
 * SQLite e a sessao no SecureStore, os dois fora da arvore.
 *
 * Classe porque ainda e o unico jeito que o React oferece de pegar erro de
 * render (`getDerivedStateFromError`/`componentDidCatch`).
 */
export class LimiteDeErro extends Component<{ children: ReactNode }, { falhou: boolean; geracao: number }> {
  state = { falhou: false, geracao: 0 };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  componentDidCatch(erro: unknown) {
    capturarErro(erro, { onde: "LimiteDeErro" });
  }

  private tentarDeNovo = () => {
    this.setState((anterior) => ({ falhou: false, geracao: anterior.geracao + 1 }));
  };

  render() {
    if (this.state.falhou) {
      return (
        <View style={estilos.raiz}>
          <EstadoVazio
            titulo="Algo deu errado nesta tela"
            descricao="Suas leituras continuam salvas no aparelho."
          />
          <Botao titulo="Tentar de novo" larguraTotal aoPressionar={this.tentarDeNovo} />
        </View>
      );
    }

    // Wrapper neutro (so `flex: 1`): o layout das telas nao muda.
    return <View key={this.state.geracao} style={estilos.arvore}>{this.props.children}</View>;
  }
}

const estilos = StyleSheet.create({
  arvore: { flex: 1 },
  raiz: { flex: 1, justifyContent: "center", gap: espaco.secao, padding: espaco.interno, backgroundColor: cores.fundo },
});
