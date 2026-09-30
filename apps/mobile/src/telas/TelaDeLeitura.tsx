import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, Vibration, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";

import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useSessao } from "../auth/SessaoProvider";
import type { RotasDoApp } from "../navegacao/Navegacao";
import { idDaVisitaNoServidor } from "../campo/fila";
import {
  aceitarDaCamera,
  acharQr,
  atualizarCatalogo,
  decidirLeitura,
  encerrarRonda,
  memoriaDaCameraDoApp,
  registrarLeituraDeQr,
  rondaAberta,
  tamanhoDoCatalogo,
  type QrDoCatalogo,
  type RondaAberta,
} from "../campo/ronda";
import { sincronizar } from "../campo/sincronizacao";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { capturarErro } from "../lib/observabilidade";
import { colunaDeLeitura, cores, espaco, raio, texto, tipografia } from "../tema";

/**
 * O que abre ao tocar em "Inspecao": a camera da RONDA.
 *
 * MODELO DE RONDA (decisao do dono, 25 e 28/09/2026): a primeira leitura abre
 * a ronda no site do QR; as leituras seguintes do mesmo site somam nela; o
 * inspetor toca "Encerrar ronda" no fim, e com sinal o app envia e oferece o
 * checklist. Substitui o modelo "um QR = uma visita, direto ao checklist" da
 * #134 -- desta tela ficaram a camera com mira, o veu e o pedido automatico de
 * permissao. A regra mora em `campo/ronda.ts`; aqui e casca.
 *
 * SEM SINAL, A RONDA ANDA: o QR e reconhecido pelo catalogo guardado no
 * aparelho (atualizado ao abrir esta tela com rede), e a leitura vai para a
 * fila. So o encerramento pede rede para subir -- e, sem ela, a ronda fica na
 * fila para o proximo "Sincronizar".
 *
 * SEM CAMPO DE DIGITAR O CODIGO (pedido do dono, 28/09/2026): no lugar dele,
 * "Ver sites" abre a lista de sites cadastrados. O preco conhecido: etiqueta
 * rasgada ou desbotada deixa de ter um caminho alternativo, e o emulador (camera
 * simulada) deixa de conseguir registrar leitura.
 *
 * SEM "MINHAS VISITAS" (decisao do dono, 28/09/2026): a lista de visitas e
 * consultada so no sistema web. Era o unico caminho do INSPETOR e do GESTOR ate
 * ela no app -- o cartao "Inspecao" leva os dois direto para esta camera. O
 * checklist de uma ronda passa a ser feito no convite que aparece ao encerrar:
 * "Depois", ou encerrar sem sinal, deixa a visita sem caminho de checklist pelo
 * app (o painel web nao preenche checklist).
 */

type Navegador = NativeStackNavigationProp<RotasDoApp>;

export function TelaDeLeitura() {
  const { sessao } = useSessao();
  const navegacao = useNavigation<Navegador>();
  const focada = useIsFocused();
  const [permissao, pedirPermissao] = useCameraPermissions();

  const [processando, setProcessando] = useState(false);
  const [aviso, setAviso] = useState<{ mensagem: string; tom: "erro" | "sucesso" } | null>(null);
  const [aberta, setAberta] = useState<RondaAberta | null>(null);
  const [semCatalogo, setSemCatalogo] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  /**
   * Trava em ref, e nao so no estado: `onBarcodeScanned` dispara varias vezes
   * antes de o `setProcessando(true)` chegar ao render seguinte.
   */
  const emVoo = useRef(false);

  const idDoUsuario = sessao?.user.id ?? null;

  // Pede a permissao sozinho na primeira vez: a pessoa tocou em "Inspecao"
  // para ler um QR, e um botao "Permitir camera" no meio seria um toque a mais
  // para chegar ao mesmo dialogo do sistema.
  useEffect(() => {
    if (permissao && !permissao.granted && permissao.canAskAgain) {
      void pedirPermissao();
    }
  }, [permissao, pedirPermissao]);

  // Ao ganhar foco (inclusive voltando do checklist): relê a ronda aberta e,
  // com rede, atualiza o catalogo. Sem rede vale o que ja esta no aparelho.
  useEffect(() => {
    if (!focada || !idDoUsuario) return;
    let ativo = true;

    rondaAberta(idDoUsuario)
      .then((r) => {
        if (ativo) setAberta(r);
      })
      .catch((falha) => capturarErro(falha, { onde: "rondaAberta" }));

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
  }, [focada, idDoUsuario]);

  const gravar = useCallback(
    async (qr: QrDoCatalogo, rondaAtual: RondaAberta | null) => {
      if (!idDoUsuario) return;
      const resultado = await registrarLeituraDeQr({ funcionarioId: idDoUsuario, qr, aberta: rondaAtual });

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
      setAberta(await rondaAberta(idDoUsuario));
    },
    [idDoUsuario],
  );

  const tratar = useCallback(
    async (lido: string) => {
      if (emVoo.current || !idDoUsuario) return;
      // Memoria do app, e nao da tela: sobrevive a tela reaberta. A trava que
      // vale esta na fila -- ver `registrarLeituraDeQr`.
      if (!aceitarDaCamera(memoriaDaCameraDoApp, lido, Date.now())) return;

      emVoo.current = true;
      setProcessando(true);

      try {
        const qr = await acharQr(lido);
        if (!qr) {
          setAviso({
            mensagem: semCatalogo
              ? "Não foi possível reconhecer o QR code: o catálogo ainda não foi baixado. Conecte-se à internet uma vez."
              : `QR code "${lido.trim().slice(0, 40)}" não está cadastrado.`,
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
          // A leitura so segue se a pessoa confirmar; `emVoo` fica fechada ate
          // a resposta, para a camera nao empilhar outro alerta.
          await new Promise<void>((resolver) => {
            Alert.alert(
              "QR code de outro site",
              `Este QR code é de ${qr.siteNome}, e a ronda aberta é em ${aberta.siteNome ?? "outro site"}. Encerrar a ronda atual e começar uma nova?`,
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
        // A fila local falhou (disco cheio, arquivo corrompido). Nada garante
        // que a leitura ficou salva, entao a mensagem nao promete isso.
        capturarErro(falha, { onde: "tratarLeitura" });
        setAviso({ mensagem: "Não foi possível registrar a leitura. Tente de novo.", tom: "erro" });
      } finally {
        setProcessando(false);
        emVoo.current = false;
      }
    },
    [aberta, gravar, idDoUsuario, semCatalogo],
  );

  const aoLer = useCallback(
    (leitura: BarcodeScanningResult) => {
      void tratar(leitura.data);
    },
    [tratar],
  );

  const concluirEncerramento = useCallback(
    async (ronda: RondaAberta) => {
      if (!idDoUsuario) return;
      setEncerrando(true);

      try {
        await encerrarRonda(ronda.chave);
        setAberta(null);

        // Com sinal, sobe agora. `sincronizar` nao lanca por falha de rede --
        // devolve em `falhas`, e a ronda continua na fila, intacta.
        const resultado = await sincronizar(idDoUsuario);
        const visitaId = await idDaVisitaNoServidor(ronda.chave);

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
    [idDoUsuario, navegacao],
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

  const ocupado = processando || encerrando;

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
              onBarcodeScanned={ocupado ? undefined : aoLer}
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

      {aberta ? (
        <View style={estilos.ronda}>
          <Text style={estilos.rondaRotulo}>Ronda em andamento</Text>
          <Text style={estilos.rondaSite} numberOfLines={1}>
            {aberta.siteNome ?? `Site ${aberta.siteId}`}
          </Text>
          <Text style={estilos.dica}>{aberta.leituras} leitura(s) registrada(s)</Text>
          <Botao
            titulo="Encerrar ronda"
            larguraTotal
            carregando={encerrando}
            desabilitado={processando}
            aoPressionar={pedirEncerramento}
          />
        </View>
      ) : (
        <Text style={estilos.dica}>Aponte a câmera para o QR code do ponto de ronda.</Text>
      )}

      {semCatalogo ? (
        <Aviso mensagem="Catálogo de QR codes ainda não baixado. Conecte-se à internet uma vez antes da ronda." />
      ) : null}
      {aviso ? <Aviso mensagem={aviso.mensagem} tom={aviso.tom} /> : null}

      <Botao
        titulo="Ver sites"
        variante="secundaria"
        tamanho="medio"
        larguraTotal
        estilo={estilos.manual}
        aoPressionar={() => navegacao.navigate("Sites")}
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
  conteudo: { ...colunaDeLeitura, padding: espaco.interno, gap: espaco.entreItens },

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

  // Respiro entre o painel da ronda/avisos e os botoes de navegacao.
  manual: { marginTop: espaco.minimo },

  // O painel da ronda aberta: mesmo fundo e borda da moldura da camera.
  ronda: {
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.cartao,
    padding: espaco.interno,
    gap: espaco.minimo,
  },
  rondaRotulo: texto(tipografia.rotulo, { cor: cores.textoFraco, caixaAlta: true }),
  rondaSite: texto(tipografia.subtitulo, { cor: cores.texto }),
});
