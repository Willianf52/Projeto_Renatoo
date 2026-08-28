import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import { movimento } from "@projeto-renatoo/shared";

import { Cartao } from "./Cartao";
import { cores, espaco, raio } from "../tema";

/**
 * Bloco pulsante de carregamento -- irmao do `Skeleton.tsx` do painel
 * (`bg-white/10` + `animate-pulse`), com a mesma curva e os mesmos 2s de ciclo.
 *
 * Vale a mesma ressalva do `useEntrada`: quem desativou animacoes no sistema
 * recebe o bloco parado, e nao um pulso "mais lento". O bloco parado ainda
 * comunica carregamento pela forma; o pulso e enfeite.
 */
export function Esqueleto({ largura, altura = 12 }: { largura: number | `${number}%`; altura?: number }) {
  const [opacidade] = useState(() => new Animated.Value(1));
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
    if (semMovimento === null || semMovimento) return;

    const meioCiclo = movimento.duracao.pulso / 2;
    const laco = Animated.loop(
      Animated.sequence([
        Animated.timing(opacidade, {
          toValue: 0.5,
          duration: meioCiclo,
          easing: Easing.bezier(...movimento.pulsar),
          useNativeDriver: true,
        }),
        Animated.timing(opacidade, {
          toValue: 1,
          duration: meioCiclo,
          easing: Easing.bezier(...movimento.pulsar),
          useNativeDriver: true,
        }),
      ]),
    );

    laco.start();

    return () => laco.stop();
  }, [opacidade, semMovimento]);

  return (
    <Animated.View
      style={[estilos.bloco, { width: largura, height: altura, opacity: opacidade }]}
      // Enquanto carrega nao ha o que ler: sem isto o leitor de tela anuncia
      // uma sequencia de caixas vazias no lugar do conteudo que vai chegar.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/**
 * A forma do cartao de visita antes de os dados chegarem.
 *
 * Substitui o spinner centralizado que havia aqui, pelo mesmo motivo que o
 * painel troca a tabela por `TableSkeleton` e nao por um spinner: a tela ja
 * nasce com o layout final, entao a lista nao "salta" quando a resposta chega
 * -- e em rede de campo, ruim, a espera e longa o bastante para esse salto
 * incomodar todo dia.
 */
export function EsqueletoDaLista({ quantidade = 4 }: { quantidade?: number }) {
  return (
    <View style={estilos.lista} accessibilityLabel="Carregando visitas">
      {Array.from({ length: quantidade }, (_, indice) => (
        <Cartao key={indice}>
          <Esqueleto largura="55%" altura={16} />
          <View style={estilos.detalhe}>
            <Esqueleto largura="80%" />
          </View>
        </Cartao>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { backgroundColor: cores.esqueleto, borderRadius: raio.medio },
  lista: { padding: espaco.interno, gap: espaco.entreItens },
  detalhe: { marginTop: espaco.entreItens },
});
