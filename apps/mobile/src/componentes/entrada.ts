import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";
import { movimento } from "@projeto-renatoo/shared";

/**
 * Equivalente do `animate-fade-in-up` do painel: o bloco entra subindo 12
 * pontos enquanto aparece, com o mesmo easing (`--ease-out-soft`) e a mesma
 * cascata de atrasos do formulario de login da web.
 *
 * O `prefers-reduced-motion` do CSS nao existe no React Native; o equivalente
 * e `AccessibilityInfo.isReduceMotionEnabled()`, e o globals.css ja decidiu o
 * que fazer com essa preferencia (zerar as animacoes, nao "suaviza-las"),
 * entao aqui a peca simplesmente nasce no lugar. Vale o mesmo motivo de la:
 * movimento pode causar desconforto vestibular, e ninguem deveria ter que
 * escolher entre isso e registrar uma visita.
 *
 * Devolve estilo pronto para um `Animated.View`. `useNativeDriver` porque
 * opacidade e deslocamento rodam na thread de UI -- a animacao nao engasga se
 * o JavaScript estiver ocupado com o `signInWithPassword`.
 */
export function useEntrada(atraso = 0) {
  // `useState` com inicializador preguicoso, e nao `useRef(...).current`: o
  // valor precisa ser criado uma vez so, mas ler `.current` durante a
  // renderizacao e exatamente o que a regra `react-hooks/refs` recusa -- e com
  // razao, e por isso que o painel tambem usa inicializador preguicoso em vez
  // de efeito quando precisa de valor inicial vindo de fora (ver
  // `lerBloqueioSalvo` no LoginForm). O setter nao e usado: o valor e mutavel
  // por conta propria, quem o move e o `Animated.timing`.
  const [progresso] = useState(() => new Animated.Value(0));
  const [semMovimento, setSemMovimento] = useState<boolean | null>(null);

  useEffect(() => {
    let ativo = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduzido) => {
      if (ativo) setSemMovimento(reduzido);
    });

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    // `null` = ainda nao se sabe a preferencia. Animar antes da resposta seria
    // justamente ignorar quem pediu para nao animar.
    if (semMovimento === null) return;

    if (semMovimento) {
      progresso.setValue(1);
      return;
    }

    const animacao = Animated.timing(progresso, {
      toValue: 1,
      duration: movimento.duracao.entrada,
      delay: atraso,
      easing: Easing.bezier(...movimento.saidaSuave),
      useNativeDriver: true,
    });

    animacao.start();

    // Interrompe se a tela sair antes do fim -- animar componente desmontado
    // avisa em console e segura o valor vivo a toa.
    return () => animacao.stop();
  }, [atraso, progresso, semMovimento]);

  return {
    opacity: progresso,
    transform: [
      {
        translateY: progresso.interpolate({
          inputRange: [0, 1],
          // Os mesmos 12px do `@keyframes fade-in-up`.
          outputRange: [12, 0],
        }),
      },
    ],
  };
}

/**
 * O `animate-shake` do painel: o formulario sacode quando a credencial falha.
 *
 * Os deslocamentos sao os mesmos quadros-chave do `@keyframes shake` do
 * globals.css (-1, 2, -4, 4... px em 10% do tempo cada), aqui como
 * `inputRange`/`outputRange` de uma interpolacao -- e a forma mais direta de
 * transportar keyframes de CSS para React Native sem virar uma sequencia de
 * dez `Animated.timing` encadeados.
 *
 * Existe pelo mesmo motivo de la: dar peso fisico ao erro sem travar a
 * interacao. Num aparelho vale ainda mais que no navegador, porque a mensagem
 * de erro pode nascer atras do teclado aberto -- o movimento e o unico aviso
 * que se ve de qualquer jeito.
 *
 * Devolve o estilo e o gatilho. Reinicia do zero a cada chamada: sacudir de
 * novo enquanto ainda sacode nao pode simplesmente ser ignorado, senao a
 * segunda senha errada seguida nao daria retorno nenhum.
 */
export function useAbalo() {
  const [progresso] = useState(() => new Animated.Value(0));
  const [semMovimento, setSemMovimento] = useState(false);

  useEffect(() => {
    let ativo = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduzido) => {
      if (ativo) setSemMovimento(reduzido);
    });

    return () => {
      ativo = false;
    };
  }, []);

  const sacudir = useCallback(() => {
    if (semMovimento) return;

    progresso.setValue(0);
    Animated.timing(progresso, {
      toValue: 1,
      duration: movimento.duracao.padrao,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [progresso, semMovimento]);

  const estilo = {
    transform: [
      {
        translateX: progresso.interpolate({
          inputRange: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
          outputRange: [0, -1, 2, -4, 4, -4, 4, -4, 2, -1, 0],
        }),
      },
    ],
  };

  return { estilo, sacudir };
}
