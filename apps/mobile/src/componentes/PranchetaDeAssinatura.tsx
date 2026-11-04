import { useCallback, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { geometriaDaPrancheta, pontoDoDesenho } from "../campo/assinaturas";
import { cores, espaco, raio, texto, tipografia } from "../tema";

/**
 * Tela cheia para assinar, deitada, como a do antigo: "Assinatura 1 (Nome)",
 * com Voltar, Limpar e Salvar, e um quadro grande para o dedo.
 *
 * O app e travado em retrato, entao a tela e girada para a esquerda por layout
 * (ver `campo/assinaturas.ts`). O que gira e SO o que se ve: o toque chega
 * numa area transparente em retrato, em cima do quadro, e a conta de
 * `pontoDoDesenho` o devolve em coordenadas do quadro deitado. O SVG fica no
 * lado girado, entao o PNG exportado sai deitado e na posicao certa de ler.
 *
 * Mesmo formato de imagem do quadro de uma assinatura so que vinha antes (a
 * `AreaDeAssinatura`, removida em 04/11/2026): traco claro
 * sobre fundo transparente, que e o que o portal e os PDFs ja sabem exibir.
 * UM PATH POR GESTO, pelo mesmo motivo de la: letra solta e pingo de "i".
 */

/** Largura do PNG exportado: assinatura nao precisa de mais, e sobe pela rede movel. */
const LARGURA_DO_PNG = 640;

/** Mesmo teto da captura do quadro antigo, pelo mesmo motivo: o callback nativo pode nunca chegar. */
const ESPERA_MAXIMA_DA_CAPTURA = 10_000;

export function PranchetaDeAssinatura({
  visivel,
  titulo,
  aoVoltar,
  aoSalvar,
}: {
  visivel: boolean;
  /** "Assinatura 1 (Willian)". */
  titulo: string;
  aoVoltar: () => void;
  /** Recebe o PNG em base64, sem o prefixo `data:`. */
  aoSalvar: (png: string) => void;
}) {
  const janela = useWindowDimensions();
  const bordas = useSafeAreaInsets();
  const geometria = useMemo(
    () => geometriaDaPrancheta({ largura: janela.width, altura: janela.height }, { topo: bordas.top, baixo: bordas.bottom }),
    [janela.width, janela.height, bordas.top, bordas.bottom],
  );

  const svg = useRef<Svg>(null);
  const [tracos, setTracos] = useState<string[]>([]);
  const [emCurso, setEmCurso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const limpar = useCallback(() => {
    setTracos([]);
    setEmCurso("");
    setAviso(null);
  }, []);


  const fechar = useCallback(() => {
    limpar();
    setSalvando(false);
  }, [limpar]);

  // O traco em andamento fica numa `ref`: o gesto muda a cada movimento e so
  // handler de evento le e escreve nela, que e onde o React permite.
  const atual = useRef("");

  const pontoDoToque = (evento: GestureResponderEvent) => {
    const { u, v } = pontoDoDesenho(
      { x: evento.nativeEvent.locationX, y: evento.nativeEvent.locationY },
      geometria,
    );
    return `${Math.round(u * 10) / 10},${Math.round(v * 10) / 10}`;
  };

  const aoTocar = (evento: GestureResponderEvent) => {
    setAviso(null);
    atual.current = `M${pontoDoToque(evento)}`;
    setEmCurso(atual.current);
  };

  const aoMover = (evento: GestureResponderEvent) => {
    if (atual.current === "") return;
    atual.current += ` L${pontoDoToque(evento)}`;
    setEmCurso(atual.current);
  };

  /** Dedo solto, ou gesto interrompido pelo sistema (ligacao, notificacao). */
  const aoSoltar = () => {
    const terminado = atual.current;
    atual.current = "";
    setEmCurso("");
    // Toque sem arrasto vira um `M` solto, que nao desenha nada.
    if (!terminado.includes("L")) return;
    setTracos((anteriores) => [...anteriores, terminado]);
  };

  const salvar = useCallback(() => {
    if (salvando) return;
    if (tracos.length === 0 || !svg.current) {
      setAviso("Assine no quadro antes de salvar.");
      return;
    }
    setSalvando(true);

    let respondido = false;
    let prazo: ReturnType<typeof setTimeout> | undefined;
    const encerrar = (base64: string | null) => {
      if (respondido) return;
      respondido = true;
      if (prazo !== undefined) clearTimeout(prazo);
      setSalvando(false);
      if (!base64) {
        setAviso("Não foi possível gerar a assinatura. Toque em Salvar de novo.");
        return;
      }
      aoSalvar(base64);
      limpar();
    };
    prazo = setTimeout(() => encerrar(null), ESPERA_MAXIMA_DA_CAPTURA);

    const { comprimento, altura } = geometria.quadro;
    svg.current.toDataURL((base64) => encerrar(base64 ?? null), {
      width: LARGURA_DO_PNG,
      height: Math.max(1, Math.round((LARGURA_DO_PNG * altura) / comprimento)),
    });
  }, [aoSalvar, geometria.quadro, limpar, salvando, tracos.length]);

  const { folha, quadro, quadroNaTela } = geometria;
  const vazio = tracos.length === 0 && emCurso === "";

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={() => { fechar(); aoVoltar(); }} supportedOrientations={["portrait"]}>
      <View style={estilos.tela}>
        {/* A folha deitada, girada para a esquerda em volta do centro da tela. */}
        <View
          style={{
            position: "absolute",
            left: (janela.width - folha.comprimento) / 2,
            top: (janela.height - folha.altura) / 2,
            width: folha.comprimento,
            height: folha.altura,
            transform: [{ rotate: "-90deg" }],
          }}
        >
          <View style={[estilos.faixa, { paddingLeft: quadro.esquerda, paddingRight: espaco.interno }]}>
            <Pressable
              onPress={() => { fechar(); aoVoltar(); }}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              hitSlop={12}
              style={estilos.voltar}
            >
              <Text style={estilos.voltarTexto}>Voltar</Text>
            </Pressable>

            <Text style={estilos.titulo} numberOfLines={1}>
              {titulo}
            </Text>

            <Pressable
              onPress={limpar}
              accessibilityRole="button"
              accessibilityLabel="Limpar assinatura"
              disabled={vazio}
              style={[estilos.botao, estilos.botaoLimpar, vazio && estilos.botaoInativo]}
            >
              <Text style={estilos.limparTexto}>Limpar</Text>
            </Pressable>

            <Pressable
              onPress={salvar}
              accessibilityRole="button"
              accessibilityLabel="Salvar assinatura"
              disabled={salvando}
              style={[estilos.botao, estilos.botaoSalvar, salvando && estilos.botaoInativo]}
            >
              <Text style={estilos.salvarTexto}>{salvando ? "Salvando..." : "Salvar"}</Text>
            </Pressable>
          </View>

          <View
            style={[
              estilos.quadro,
              { left: quadro.esquerda, top: quadro.topo, width: quadro.comprimento, height: quadro.altura },
            ]}
          >
            <Svg ref={svg} width={quadro.comprimento} height={quadro.altura}>
              {[...tracos, emCurso].filter(Boolean).map((traco, indice) => (
                <Path
                  key={indice}
                  d={traco}
                  // Claro sobre transparente, como o quadro antigo: e o que o
                  // portal e os PDFs ja exibem.
                  stroke={cores.texto}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
            </Svg>

            {vazio ? (
              <View pointerEvents="none" style={estilos.instrucao}>
                <Text style={estilos.instrucaoTexto}>Assine aqui</Text>
              </View>
            ) : null}
          </View>

          {aviso ? (
            <Text style={[estilos.aviso, { left: quadro.esquerda, bottom: 2 }]} accessibilityLiveRegion="polite">
              {aviso}
            </Text>
          ) : null}
        </View>

        {/* Recebe o toque, em retrato, exatamente em cima do quadro girado. */}
        <View
          accessibilityLabel={titulo}
          accessibilityHint="Assine com o dedo dentro do quadro"
          style={{
            position: "absolute",
            left: quadroNaTela.esquerda,
            top: quadroNaTela.topo,
            width: quadroNaTela.largura,
            height: quadroNaTela.altura,
          }}
          onTouchStart={aoTocar}
          onTouchMove={aoMover}
          onTouchEnd={aoSoltar}
          onTouchCancel={aoSoltar}
        />
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  faixa: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.interno,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  voltar: { paddingVertical: espaco.interno, paddingRight: espaco.interno },
  voltarTexto: texto(tipografia.botaoDenso, { cor: cores.primaria }),
  titulo: { flex: 1, ...texto(tipografia.rotulo, { cor: cores.texto }) },
  botao: {
    minWidth: 96,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: raio.grande,
    paddingHorizontal: espaco.interno,
  },
  botaoLimpar: { borderWidth: 1, borderColor: cores.erroBorda },
  botaoSalvar: { backgroundColor: cores.primaria },
  botaoInativo: { opacity: 0.4 },
  limparTexto: texto(tipografia.botaoDenso, { cor: cores.erroTexto }),
  salvarTexto: texto(tipografia.botaoDenso, { cor: cores.textoSobrePrimaria }),
  quadro: {
    position: "absolute",
    backgroundColor: cores.fundo,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: cores.textoFraco,
    borderRadius: raio.grande,
    overflow: "hidden",
  },
  instrucao: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  instrucaoTexto: texto(tipografia.apoio, { cor: cores.textoFraco }),
  aviso: { position: "absolute", ...texto(tipografia.apoio, { cor: cores.erroTextoDeCampo }) },
});
