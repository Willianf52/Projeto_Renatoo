import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, StyleSheet, Text, Vibration, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useSessao } from "../auth/SessaoProvider";
import {
  aceitarDaCamera,
  acharQr,
  atualizarCatalogo,
  decidirLeitura,
  encerrarRonda,
  novaMemoriaDaCamera,
  registrarLeituraDeQr,
  rondaAberta,
  tamanhoDoCatalogo,
  visitaNoServidor,
  type MemoriaDaCamera,
  type QrDoCatalogo,
  type RondaAberta,
} from "../campo/ronda";
import { sincronizar } from "../campo/sincronizacao";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { EstadoVazio } from "../componentes/EstadoVazio";
import { capturarErro } from "../lib/observabilidade";
import type { RotasDoApp } from "../navegacao/Navegacao";
import { cores, espaco, raio, texto, tipografia } from "../tema";

type Navegador = NativeStackNavigationProp<RotasDoApp>;

/**
 * A ronda: a camera le o QR do ponto, e cada leitura entra na fila offline.
 *
 * O fluxo e o que o dono definiu em 25/09/2026 -- ver o cabecalho de
 * `campo/ronda.ts`. Esta tela e casca: decide o que MOSTRAR e o que PERGUNTAR
 * ao inspetor; o que gravar e como, mora la.
 */
export function TelaDeRonda() {
  const { sessao } = useSessao();
  const funcionarioId = sessao?.user.id ?? null;
  const navegacao = useNavigation<Navegador>();
  // Camera so montada com a tela em foco: fora dela, seguiria lendo QR por tras
  // da tela do checklist e gastando bateria.
  const emFoco = useIsFocused();

  const [permissao, pedirPermissao] = useCameraPermissions();
  const [aberta, setAberta] = useState<RondaAberta | null>(null);
  const [aviso, setAviso] = useState<{ mensagem: string; tom: "erro" | "sucesso" } | null>(null);
  const [semCatalogo, setSemCatalogo] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  // Refs e nao estado: sao lidas dentro do callback da camera, que dispara
  // varias vezes antes de qualquer render.
  const processando = useRef(false);
  // Filtro da camera -- ver `aceitarDaCamera` em `campo/ronda.ts`.
  const memoriaDaCamera = useRef<MemoriaDaCamera>(novaMemoriaDaCamera());

  const recarregarRonda = useCallback(async () => {
    if (!funcionarioId) return;
    setAberta(await rondaAberta(funcionarioId));
  }, [funcionarioId]);

  useEffect(() => {
    if (!funcionarioId) return;
    let ativo = true;

    rondaAberta(funcionarioId)
      .then((r) => {
        if (ativo) setAberta(r);
      })
      .catch((falha) => capturarErro(falha, { onde: "rondaAberta" }));

    // Atualiza o catalogo com rede; sem rede, vale o que ja estava no aparelho.
    atualizarCatalogo()
      .then(() => {
        if (ativo) setSemCatalogo(false);
      })
      .catch(async () => {
        const quantos = await tamanhoDoCatalogo().catch(() => 0);
        if (ativo) setSemCatalogo(quantos === 0);
      });

    return () => {
      ativo = false;
    };
  }, [funcionarioId]);

  const gravar = useCallback(
    async (qr: QrDoCatalogo, rondaAtual: RondaAberta | null) => {
      if (!funcionarioId) return;
      const resultado = await registrarLeituraDeQr({ funcionarioId, qr, aberta: rondaAtual });

      if (resultado.repetida) {
        setAviso({ mensagem: `${qr.codigo} já foi registrado agora há pouco.`, tom: "erro" });
        return;
      }

      Vibration.vibrate(80);
      const ponto = qr.finalidade ? `${qr.codigo} · ${qr.finalidade}` : qr.codigo;
      setAviso({
        mensagem: resultado.nova ? `Ronda iniciada em ${qr.siteNome}. Leitura: ${ponto}` : `Leitura registrada: ${ponto}`,
        tom: "sucesso",
      });
      await recarregarRonda();
    },
    [funcionarioId, recarregarRonda],
  );

  const aoLer = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      if (processando.current) return;

      if (!aceitarDaCamera(memoriaDaCamera.current, data, Date.now())) return;

      processando.current = true;

      try {
        const qr = await acharQr(data);
        if (!qr) {
          setAviso({
            mensagem: semCatalogo
              ? "Não foi possível reconhecer o QR-code: o catálogo ainda não foi baixado. Conecte-se à internet uma vez."
              : `QR-code "${data.trim().slice(0, 40)}" não está cadastrado.`,
            tom: "erro",
          });
          return;
        }

        const decisao = decidirLeitura(aberta, qr);

        if (decisao.tipo === "recusar") {
          setAviso({ mensagem: decisao.motivo, tom: "erro" });
          return;
        }

        if (decisao.tipo === "trocar-de-site" && aberta) {
          // A leitura so segue se o inspetor confirmar. `processando` fica
          // travado ate a resposta, para a camera nao empilhar outro alerta.
          await new Promise<void>((resolver) => {
            Alert.alert(
              "QR-code de outro site",
              `Este QR-code é de ${qr.siteNome}, e a ronda aberta é em ${aberta.siteNome ?? "outro site"}. Encerrar a ronda atual e começar uma nova?`,
              [
                { text: "Cancelar", style: "cancel", onPress: () => resolver() },
                {
                  text: "Encerrar e começar",
                  onPress: () => {
                    void encerrarRonda(aberta.chave)
                      .then(() => gravar(qr, null))
                      .catch((falha) => {
                        capturarErro(falha, { onde: "trocarDeSite" });
                        setAviso({ mensagem: "Não foi possível trocar de ronda. Tente de novo.", tom: "erro" });
                      })
                      .finally(resolver);
                  },
                },
              ],
              { cancelable: false },
            );
          });
          return;
        }

        await gravar(qr, aberta);
      } catch (falha) {
        capturarErro(falha, { onde: "aoLerQr" });
        setAviso({ mensagem: "Não foi possível registrar a leitura. Tente de novo.", tom: "erro" });
      } finally {
        processando.current = false;
      }
    },
    [aberta, gravar, semCatalogo],
  );

  const concluirEncerramento = useCallback(
    async (ronda: RondaAberta) => {
      if (!funcionarioId) return;
      setEncerrando(true);

      try {
        await encerrarRonda(ronda.chave);
        setAberta(null);

        // Com sinal, sobe agora. `sincronizar` nao lanca por falha de rede --
        // devolve em `falhas`, e a ronda continua na fila, intacta.
        const resultado = await sincronizar(funcionarioId);
        const visitaId = await visitaNoServidor(ronda.chave);

        if (resultado.falhas.length > 0 || visitaId === null) {
          setAviso({
            mensagem: "Ronda encerrada e guardada no aparelho. Ela será enviada no próximo Sincronizar, com sinal.",
            tom: "sucesso",
          });
          return;
        }

        setAviso({ mensagem: "Ronda encerrada e enviada.", tom: "sucesso" });
        Alert.alert("Ronda enviada", "Fazer o checklist desta visita agora?", [
          { text: "Depois", style: "cancel" },
          {
            text: "Fazer checklist",
            onPress: () => navegacao.navigate("TipoDeVisita", { visitaId, numeroColeta: ronda.chave }),
          },
        ]);
      } catch (falha) {
        capturarErro(falha, { onde: "encerrarRonda" });
        setAviso({ mensagem: "Ronda encerrada, mas não foi possível enviar agora. Use Sincronizar depois.", tom: "erro" });
      } finally {
        setEncerrando(false);
      }
    },
    [funcionarioId, navegacao],
  );

  const pedirEncerramento = useCallback(() => {
    if (!aberta) return;
    Alert.alert(
      "Encerrar ronda",
      `Encerrar a ronda em ${aberta.siteNome ?? "este site"} com ${aberta.leituras} leitura(s)?`,
      [
        { text: "Continuar ronda", style: "cancel" },
        { text: "Encerrar", onPress: () => void concluirEncerramento(aberta) },
      ],
    );
  }, [aberta, concluirEncerramento]);

  // -- Permissao -----------------------------------------------------------
  if (!permissao) {
    return <View style={estilos.raiz} />;
  }

  if (!permissao.granted) {
    return (
      <View style={[estilos.raiz, estilos.centro]}>
        <EstadoVazio
          titulo="Câmera sem permissão"
          descricao={
            permissao.canAskAgain
              ? "A ronda lê o QR-code de cada ponto pela câmera."
              : "A permissão foi negada. Libere a câmera para este app nas configurações do aparelho."
          }
        />
        <Botao
          titulo={permissao.canAskAgain ? "Permitir câmera" : "Abrir configurações"}
          larguraTotal
          estilo={estilos.acao}
          aoPressionar={() => {
            if (permissao.canAskAgain) void pedirPermissao();
            else void Linking.openSettings();
          }}
        />
      </View>
    );
  }

  // -- Ronda ---------------------------------------------------------------
  return (
    <View style={estilos.raiz}>
      <View style={estilos.camera}>
        {emFoco ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={encerrando ? undefined : (resultado) => void aoLer(resultado)}
          />
        ) : null}
        <View pointerEvents="none" style={estilos.moldura} />
      </View>

      <View style={estilos.painel}>
        {aberta ? (
          <>
            <Text style={estilos.rotulo}>Ronda em andamento</Text>
            <Text style={estilos.site} numberOfLines={1}>
              {aberta.siteNome ?? `Site ${aberta.siteId}`}
            </Text>
            <Text style={estilos.apoio}>{aberta.leituras} leitura(s) registrada(s)</Text>
          </>
        ) : (
          <Text style={estilos.apoio}>Aponte a câmera para o QR-code do ponto de ronda.</Text>
        )}

        {semCatalogo ? (
          <Aviso
            mensagem="Catálogo de QR-codes ainda não baixado. Conecte-se à internet uma vez antes da ronda."
            estilo={estilos.aviso}
          />
        ) : null}
        {aviso ? <Aviso mensagem={aviso.mensagem} tom={aviso.tom} estilo={estilos.aviso} /> : null}

        {aberta ? (
          <Botao
            titulo="Encerrar ronda"
            larguraTotal
            carregando={encerrando}
            estilo={estilos.acao}
            aoPressionar={pedirEncerramento}
          />
        ) : null}
        <Botao
          titulo="Minhas inspeções"
          variante="secundaria"
          tamanho="medio"
          larguraTotal
          estilo={estilos.acao}
          aoPressionar={() => navegacao.navigate("Inspecoes")}
        />
      </View>
    </View>
  );
}

const TAMANHO_DA_MOLDURA = 220;

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  centro: { justifyContent: "center", padding: espaco.confortavel },
  camera: { flex: 1, backgroundColor: cores.fundo, alignItems: "center", justifyContent: "center" },
  // A moldura so orienta o enquadramento: a leitura vale para o quadro inteiro.
  moldura: {
    width: TAMANHO_DA_MOLDURA,
    height: TAMANHO_DA_MOLDURA,
    borderWidth: 2,
    borderColor: cores.primaria,
    borderRadius: raio.grande,
  },
  painel: {
    backgroundColor: cores.superficie,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    padding: espaco.interno,
    paddingBottom: espaco.secao,
  },
  rotulo: texto(tipografia.rotulo, { cor: cores.textoFraco, caixaAlta: true }),
  site: { ...texto(tipografia.subtitulo, { cor: cores.texto }), marginTop: espaco.minimo },
  apoio: { ...texto(tipografia.apoio, { cor: cores.textoFraco }), marginTop: espaco.minimo },
  aviso: { marginTop: espaco.entreItens },
  acao: { marginTop: espaco.entreItens },
});
