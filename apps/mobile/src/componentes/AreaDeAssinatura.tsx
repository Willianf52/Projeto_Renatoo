import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { cores, espaco, raio, texto, tipografia } from "../tema";

/**
 * Quadro de assinatura do responsavel no local.
 *
 * Desenhado com `react-native-svg`, que ja estava no projeto pelos icones --
 * nao entrou biblioteca de assinatura nova. O traco vira um `<Path>` por
 * gesto, e o SVG inteiro e exportado em PNG por `toDataURL`, que e o formato
 * que o painel consegue abrir sem nada instalado.
 *
 * UM PATH POR GESTO, e nao um so com tudo dentro: assinatura tem letra
 * solta e pingo de "i". Concatenar tudo num path unico ligaria o fim de uma
 * letra ao comeco da proxima com um risco reto atravessando o nome.
 */

export type ControleDaAssinatura = {
  /**
   * PNG em base64, ou `null` se ninguem assinou ainda -- e tambem se a
   * rasterizacao nao respondeu a tempo (ver `ESPERA_MAXIMA_DA_CAPTURA`). Quem
   * chama distingue os dois pelo proprio estado: a tela sabe se ha traco.
   */
  capturar: () => Promise<string | null>;
  limpar: () => void;
};

const ALTURA = 180;

/**
 * Teto para o `toDataURL` responder.
 *
 * Ele e chamada nativa com callback, e nao promessa: se o lado nativo falhar,
 * o callback nunca chega e a promessa fica pendurada para sempre. Quem espera
 * por ela e o `enviar` da `TelaDeChecklist`, que segura a guarda de envio
 * unico -- pendurar aqui deixaria o botao Finalizar morto pelo resto da
 * visita, que e pior que a falha original. Dez segundos e folga larga para
 * rasterizar um SVG de 180 pontos, mesmo em aparelho fraco.
 */
const ESPERA_MAXIMA_DA_CAPTURA = 10_000;

export const AreaDeAssinatura = forwardRef<
  ControleDaAssinatura,
  { rotulo: string; aoMudar?: (temTraco: boolean) => void }
>(function AreaDeAssinatura({ rotulo, aoMudar }, ref) {
  const svg = useRef<Svg>(null);

  // Gestos ja terminados e o gesto em andamento, separados: so o segundo muda
  // a cada `onPanResponderMove`, entao os anteriores nao sao remontados a
  // sessenta vezes por segundo enquanto a pessoa assina.
  const [tracos, setTracos] = useState<string[]>([]);
  const [emCurso, setEmCurso] = useState<string>("");

  // `useRef` e nao estado: o `PanResponder` e criado uma vez (memo abaixo) e
  // fecharia sobre o valor da primeira renderizacao se lesse do estado.
  const atual = useRef<string>("");

  /**
   * Um so `limpar`, usado pelo botao da tela e pelo `ref`.
   *
   * Estavam duplicados, corpo a corpo -- e duas copias de "apague tudo" e o
   * tipo de coisa que desencontra na primeira vez que uma delas ganha um
   * passo a mais (zerar um traco em curso, avisar o pai) e a outra nao.
   */
  const limpar = useCallback(() => {
    setTracos([]);
    setEmCurso("");
    atual.current = "";
    aoMudar?.(false);
  }, [aoMudar]);

  const respondedor = useMemo(
    () =>
      PanResponder.create({
        // `onStartShouldSetPanResponderCapture` e nao a versao sem `Capture`:
        // sem capturar, o `ScrollView` que envolve o formulario ganha o gesto
        // e a tela rola em vez de a linha ser desenhada.
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,

        onPanResponderGrant: (evento) => {
          const { locationX, locationY } = evento.nativeEvent;
          atual.current = `M${arredondar(locationX)},${arredondar(locationY)}`;
          setEmCurso(atual.current);
        },

        onPanResponderMove: (evento) => {
          const { locationX, locationY } = evento.nativeEvent;
          atual.current += ` L${arredondar(locationX)},${arredondar(locationY)}`;
          setEmCurso(atual.current);
        },

        onPanResponderRelease: () => {
          const terminado = atual.current;
          atual.current = "";
          setEmCurso("");

          // Toque sem arrasto vira um `M` solto, que nao desenha nada e ainda
          // assim faria o campo contar como assinado.
          if (!terminado.includes("L")) return;

          // `aoMudar` FORA do updater de `setTracos`.
          //
          // Updater tem que ser puro: `aoMudar` e o `setTemAssinatura` da
          // `TelaDeChecklist`, e chama-lo la dentro atualizava o pai durante a
          // fase de render deste componente. Alem disso o React 19 invoca o
          // updater duas vezes sob StrictMode -- era idempotente por sorte,
          // nao por desenho.
          setTracos((anteriores) => [...anteriores, terminado]);
          aoMudar?.(true);
        },
      }),
    [aoMudar],
  );

  useImperativeHandle(
    ref,
    () => ({
      capturar: () =>
        new Promise<string | null>((resolver) => {
          if (tracos.length === 0 || !svg.current) {
            resolver(null);
            return;
          }

          // Uma resposta so, venha ela do callback nativo ou do prazo. `prazo`
          // declarado antes de `encerrar` por causa do caso -- improvavel, mas
          // barato de cobrir -- em que o `toDataURL` chama o callback de forma
          // sincrona: sem isso, `encerrar` leria a variavel na zona morta.
          let respondido = false;
          let prazo: ReturnType<typeof setTimeout> | undefined;

          const encerrar = (base64: string | null) => {
            if (respondido) return;
            respondido = true;
            if (prazo !== undefined) clearTimeout(prazo);
            resolver(base64);
          };

          prazo = setTimeout(() => encerrar(null), ESPERA_MAXIMA_DA_CAPTURA);

          // `toDataURL` do react-native-svg devolve base64 puro, sem o
          // prefixo `data:image/png;base64,` -- que e justamente o que o
          // Storage precisa receber.
          svg.current.toDataURL((base64) => encerrar(base64 ?? null));
        }),
      limpar,
    }),
    [tracos, limpar],
  );

  const vazia = tracos.length === 0 && emCurso === "";

  return (
    <View>
      <View style={estilos.cabecalho}>
        <Text style={estilos.rotulo}>{rotulo}</Text>
        {!vazia ? (
          <Pressable
            onPress={limpar}
            accessibilityRole="button"
            accessibilityLabel="Limpar assinatura"
            hitSlop={12}
          >
            <Text style={estilos.limpar}>Limpar</Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={estilos.quadro}
        accessibilityLabel={rotulo}
        accessibilityHint="Assine com o dedo dentro do quadro"
        {...respondedor.panHandlers}
      >
        <Svg ref={svg} width="100%" height={ALTURA}>
          {[...tracos, emCurso].filter(Boolean).map((traco, indice) => (
            <Path
              key={indice}
              d={traco}
              // Branco e nao o verde da marca: a assinatura sai do app como
              // imagem e vai parar num PDF de relatorio, onde o verde sobre
              // branco quase nao aparece. O fundo do PNG e transparente.
              stroke={cores.texto}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>

        {vazia ? (
          <View pointerEvents="none" style={estilos.instrucao}>
            <Text style={estilos.instrucaoTexto}>Assine aqui</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

/**
 * Uma casa decimal basta para um traco a dedo, e corta o `d` do path pela
 * metade -- ele viaja inteiro dentro do PNG que sobe pela rede movel.
 */
function arredondar(valor: number): number {
  return Math.round(valor * 10) / 10;
}

const estilos = StyleSheet.create({
  cabecalho: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: espaco.rotulo,
  },
  rotulo: texto(tipografia.rotulo, { cor: cores.textoFraco, caixaAlta: true }),
  limpar: texto(tipografia.botaoDenso, { cor: cores.primaria }),
  // Mesmo desenho do `Campo`: mais escuro que a superficie, borda slate-800.
  quadro: {
    height: ALTURA,
    backgroundColor: cores.fundo,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.grande,
    overflow: "hidden",
  },
  instrucao: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  instrucaoTexto: texto(tipografia.apoio, { cor: cores.textoFraco }),
});
