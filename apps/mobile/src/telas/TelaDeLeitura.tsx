import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";

import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useSessao } from "../auth/SessaoProvider";
import type { RotasDoApp } from "../navegacao/Navegacao";
import { registrarLeituraDeQr, type ResultadoDaLeitura } from "../campo/leitura-de-qr";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { cores, espaco, raio, texto, tipografia } from "../tema";

/**
 * O que abre ao tocar em "Inspecao": a camera, pronta para a etiqueta do site.
 *
 * E o comeco da inspecao no sistema antigo, e o que os inspetores procuram:
 * chegar ao site, ler o QR, escolher o tipo de visita. A lista de visitas nao
 * sumiu -- vira o botao "Minhas visitas" embaixo da camera, para quem volta
 * para fechar uma visita que ficou aberta.
 *
 * O CAMPO DE DIGITAR NAO E ENFEITE. Etiqueta rasgada, desbotada pelo sol ou
 * atras de um vidro que reflete precisa de outro caminho que nao seja desistir
 * da visita -- e e ele que permite testar o fluxo inteiro no emulador, cuja
 * camera e simulada.
 */

/**
 * Depois de uma leitura recusada, a camera continua vendo a mesma etiqueta a
 * dezenas de quadros por segundo. Sem esta pausa, cada quadro seria uma
 * consulta nova e o aviso piscaria sem parar.
 */
const PAUSA_APOS_RECUSA_MS = 2500;

type Navegador = NativeStackNavigationProp<RotasDoApp>;

export function TelaDeLeitura() {
  const { sessao } = useSessao();
  const navegacao = useNavigation<Navegador>();
  const focada = useIsFocused();
  const [permissao, pedirPermissao] = useCameraPermissions();

  const [processando, setProcessando] = useState(false);
  const [aviso, setAviso] = useState<{ mensagem: string; tom: "erro" | "sucesso" } | null>(null);
  const [codigoDigitado, setCodigoDigitado] = useState("");

  /**
   * Trava em ref, e nao so no estado: `onBarcodeScanned` dispara varias vezes
   * antes de o `setProcessando(true)` chegar ao render seguinte, e cada disparo
   * abriria uma visita nova na fila. A mesma janela que `envioEmVoo` fecha no
   * checklist.
   */
  const emVoo = useRef(false);
  const destravar = useRef<ReturnType<typeof setTimeout> | null>(null);

  const idDoUsuario = sessao?.user.id ?? null;

  // Pede a permissao sozinho na primeira vez: a pessoa tocou em "Inspecao"
  // para ler um QR, e um botao "Permitir camera" no meio seria um toque a mais
  // para chegar ao mesmo dialogo do sistema.
  useEffect(() => {
    if (permissao && !permissao.granted && permissao.canAskAgain) {
      void pedirPermissao();
    }
  }, [permissao, pedirPermissao]);

  // Volta do checklist (`pop(2)`) com a trava solta: a proxima etiqueta e
  // outra visita. So a ref -- o estado ja foi desligado antes de navegar.
  useEffect(() => {
    if (!focada) return;
    emVoo.current = false;
    return () => {
      if (destravar.current) clearTimeout(destravar.current);
    };
  }, [focada]);

  const tratar = useCallback(
    async (codigo: string) => {
      if (emVoo.current || !idDoUsuario) return;
      emVoo.current = true;
      setProcessando(true);
      setAviso(null);

      let resultado: ResultadoDaLeitura;
      try {
        resultado = await registrarLeituraDeQr(codigo, idDoUsuario);
      } catch {
        // A fila local falhou (disco cheio, arquivo corrompido). Nada garante
        // que a leitura ficou salva, entao a mensagem nao promete isso.
        resultado = { tipo: "recusada", mensagem: "Não foi possível registrar a leitura. Tente de novo." };
      }

      if (resultado.tipo === "pronta") {
        // A trava (`emVoo`) continua fechada ate a tela voltar ao foco; o veu
        // sai agora para nao estar la quando o checklist devolver para ca.
        setProcessando(false);
        setCodigoDigitado("");
        navegacao.navigate("TipoDeVisita", {
          visitaId: resultado.visitaId,
          numeroColeta: resultado.numeroColeta,
        });
        return;
      }

      setAviso({
        mensagem: resultado.mensagem,
        tom: resultado.tipo === "na-fila" ? "sucesso" : "erro",
      });
      setProcessando(false);
      destravar.current = setTimeout(() => {
        emVoo.current = false;
      }, PAUSA_APOS_RECUSA_MS);
    },
    [idDoUsuario, navegacao],
  );

  const aoLer = useCallback(
    (leitura: BarcodeScanningResult) => {
      void tratar(leitura.data);
    },
    [tratar],
  );

  return (
    <ScrollView
      style={estilos.raiz}
      contentContainerStyle={estilos.conteudo}
      keyboardShouldPersistTaps="handled"
    >
      <View style={estilos.moldura}>
        {permissao?.granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              // Desligada fora de foco: com o checklist aberto por cima, a
              // camera continuaria lendo (e gastando bateria) por baixo.
              active={focada}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={processando ? undefined : aoLer}
            />
            <View style={estilos.mira} pointerEvents="none" />
            {processando ? (
              <View style={estilos.veu}>
                <ActivityIndicator color={cores.primaria} size="large" />
                <Text style={estilos.veuTexto}>Registrando leitura...</Text>
              </View>
            ) : null}
          </>
        ) : (
          <SemCamera
            carregando={permissao === null}
            podePedir={permissao?.canAskAgain ?? true}
            aoPedir={() => void pedirPermissao()}
          />
        )}
      </View>

      <Text style={estilos.dica}>Aponte a câmera para o QR code do site.</Text>

      {aviso ? <Aviso mensagem={aviso.mensagem} tom={aviso.tom} /> : null}

      <View style={estilos.manual}>
        <Campo
          rotulo="Ou digite o código"
          valor={codigoDigitado}
          aoMudar={setCodigoDigitado}
          placeholder="Código da etiqueta"
          // Os codigos sao literais, copiados do sistema de referencia: o teclado
          // nao pode mexer em maiuscula nenhuma.
          autoCapitalize="none"
          autoCorrect={false}
          editable={!processando}
          returnKeyType="go"
          onSubmitEditing={() => void tratar(codigoDigitado)}
        />
        <Botao
          titulo="Registrar leitura"
          larguraTotal
          carregando={processando}
          desabilitado={!codigoDigitado.trim()}
          aoPressionar={() => void tratar(codigoDigitado)}
        />
      </View>

      <Botao
        titulo="Minhas visitas"
        variante="secundaria"
        tamanho="medio"
        larguraTotal
        aoPressionar={() => navegacao.navigate("Inspecoes")}
      />
    </ScrollView>
  );
}

function SemCamera({
  carregando,
  podePedir,
  aoPedir,
}: {
  carregando: boolean;
  podePedir: boolean;
  aoPedir: () => void;
}) {
  if (carregando) {
    return (
      <View style={estilos.semCamera}>
        <ActivityIndicator color={cores.primaria} />
      </View>
    );
  }

  // `canAskAgain` falso: o sistema nao mostra mais o dialogo ("nao perguntar
  // de novo", ou negado duas vezes no Android). So as configuracoes resolvem.
  return (
    <View style={estilos.semCamera}>
      <Text style={estilos.semCameraTexto}>
        Sem acesso à câmera. Permita o uso para ler o QR code, ou digite o código abaixo.
      </Text>
      <Botao
        titulo={podePedir ? "Permitir câmera" : "Abrir configurações"}
        variante="secundaria"
        tamanho="medio"
        aoPressionar={podePedir ? aoPedir : () => void Linking.openSettings()}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.interno, gap: espaco.entreItens },

  // Quadrada: o QR e quadrado, e uma moldura alta so mostraria mais chao.
  moldura: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: raio.cartao,
    overflow: "hidden",
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    alignItems: "center",
    justifyContent: "center",
  },
  mira: {
    width: "62%",
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: cores.primaria,
    borderRadius: raio.cartao,
  },
  veu: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(3, 3, 26, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    gap: espaco.entreItens,
  },
  veuTexto: texto(tipografia.apoio, { cor: cores.texto }),

  semCamera: { alignItems: "center", gap: espaco.interno, padding: espaco.confortavel },
  semCameraTexto: { ...texto(tipografia.apoio, { cor: cores.textoFraco }), textAlign: "center" },

  dica: { ...texto(tipografia.apoio, { cor: cores.textoFraco }), textAlign: "center" },

  manual: { gap: espaco.entreItens, marginTop: espaco.minimo },
});
