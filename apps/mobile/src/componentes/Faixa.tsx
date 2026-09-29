import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { espaco } from "../tema";
import { Aviso } from "./Aviso";
import { useEntrada } from "./entrada";

/**
 * Confirmacao passageira na base da tela -- o `ToastProvider` do painel, no
 * app de campo.
 *
 * O `Aviso` fica no fluxo da tela e nao some; isto aqui e para o caso que ele
 * nao cobre, o da acao que *sai* da tela. O primeiro foi o "Finalizar
 * visita": o checklist era enviado, a tela desempilhava e o inspetor voltava
 * a camera sem nenhum sinal de que tinha dado certo -- e, na duvida, abria a
 * visita de novo.
 *
 * Uma faixa por vez (numa tela de celular, duas empilhadas ja cobrem o
 * conteudo), com o desenho do `Aviso` de sucesso. Some em 4 s, como o toast
 * do painel, ou com um toque.
 */
type ValorDaFaixa = { mostrar: (mensagem: string) => void };

const FaixaContexto = createContext<ValorDaFaixa | null>(null);

const DURACAO_MS = 4000;

export function FaixaProvider({ children }: { children: React.ReactNode }) {
  const [faixa, setFaixa] = useState<{ id: number; mensagem: string } | null>(null);
  const proximoId = useRef(0);
  const bordas = useSafeAreaInsets();

  const mostrar = useCallback((mensagem: string) => {
    setFaixa({ id: proximoId.current++, mensagem });
    // A faixa nasce montada, e o React Native so anuncia mudanca em regiao
    // viva que ja existia -- sem isto, o leitor de tela nao diria nada.
    AccessibilityInfo.announceForAccessibility(mensagem);
  }, []);

  const fechar = useCallback(() => setFaixa(null), []);

  useEffect(() => {
    if (!faixa) return;
    // Compara o id: uma faixa nova que chegou no meio nao pode ser fechada
    // pelo prazo da anterior.
    const espera = setTimeout(
      () => setFaixa((atual) => (atual?.id === faixa.id ? null : atual)),
      DURACAO_MS,
    );
    return () => clearTimeout(espera);
  }, [faixa]);

  const valor = useMemo(() => ({ mostrar }), [mostrar]);

  return (
    <FaixaContexto.Provider value={valor}>
      {children}
      {faixa ? (
        <View
          pointerEvents="box-none"
          style={[estilos.camada, { bottom: bordas.bottom + espaco.interno }]}
        >
          {/* `key` pelo id: faixa nova remonta e entra animada de novo. */}
          <ItemDaFaixa key={faixa.id} mensagem={faixa.mensagem} aoFechar={fechar} />
        </View>
      ) : null}
    </FaixaContexto.Provider>
  );
}

function ItemDaFaixa({ mensagem, aoFechar }: { mensagem: string; aoFechar: () => void }) {
  const entrada = useEntrada();

  return (
    <Animated.View style={entrada}>
      <Pressable onPress={aoFechar} accessibilityHint="Toque para fechar o aviso.">
        <Aviso mensagem={mensagem} tom="sucesso" estilo={estilos.aviso} />
      </Pressable>
    </Animated.View>
  );
}

export function useFaixa(): ValorDaFaixa {
  const contexto = useContext(FaixaContexto);
  if (!contexto) throw new Error("useFaixa precisa estar dentro de um FaixaProvider.");
  return contexto;
}

const estilos = StyleSheet.create({
  camada: { position: "absolute", left: espaco.interno, right: espaco.interno },
  // O `Aviso` e desenhado para ficar no fluxo (padding de faixa fina); solto
  // sobre o conteudo, pede o respiro de um cartao para nao parecer recortado.
  aviso: { paddingHorizontal: espaco.interno, paddingVertical: espaco.entreItens },
});
