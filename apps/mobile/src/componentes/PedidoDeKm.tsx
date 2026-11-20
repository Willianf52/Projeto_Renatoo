import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  carrosParaEscolher,
  devePedirKm,
  kmNaTela,
  lerKm,
  placaComHifen,
  type VeiculoDaFrota,
} from "@projeto-renatoo/shared";

import { inicioDoDia } from "../campo/rascunho";
import { supabase } from "../lib/supabase";
import { cores, espaco, raio, texto, tipografia } from "../tema";
import { Aviso } from "./Aviso";
import { Botao } from "./Botao";
import { Campo } from "./Campo";

/**
 * "Ao abrir ja pede o km do veiculo" (pedido do gestor, 16/11/2026), com o
 * carro do dia (20/11/2026): a mesma pessoa pode usar mais de um carro, entao
 * o app pergunta qual ela esta usando, com os dela primeiro e depois os da
 * frota, e pede o km dele.
 *
 * Uma vez por dia e so para quem usa carro: quem tem um no nome ou registrou
 * km nos ultimos 30 dias, e ainda nao registrou hoje (`devePedirKm`). "Agora
 * nao" fecha ate a proxima abertura do app. Sem sinal, nao pergunta: o km nao
 * vai para a fila do aparelho.
 *
 * O banco recusa km menor que o ultimo (22023) e e ele que avisa a revisao aos
 * 9.000 km; aqui so o formato e a conferencia com o km atual do carro.
 */

type Carro = VeiculoDaFrota & { seu: boolean };

/** Ja perguntou nesta abertura do app (sobrevive a ir e voltar da tela). */
let jaPerguntouNestaAbertura = false;

async function carrosSePrecisarPedir(usuarioId: string): Promise<Carro[] | null> {
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [veiculos, kmRecentes] = await Promise.all([
    supabase.from("veiculos").select("id, placa, modelo, km_atual, usuario_id").eq("ativo", true),
    supabase
      .from("veiculo_km")
      .select("registrado_em")
      .eq("registrado_por", usuarioId)
      .gte("registrado_em", trintaDiasAtras)
      .order("registrado_em", { ascending: false })
      .limit(1),
  ]);
  if (veiculos.error || kmRecentes.error || !veiculos.data?.length) return null;

  const ultimo = kmRecentes.data?.[0]?.registrado_em ?? null;
  const pedir = devePedirKm({
    temCarroNoNome: veiculos.data.some((v) => v.usuario_id === usuarioId),
    registrouKmNosUltimos30Dias: ultimo !== null,
    registrouKmHoje: ultimo !== null && ultimo >= inicioDoDia(),
  });
  return pedir ? carrosParaEscolher(veiculos.data, usuarioId) : null;
}

export function PedidoDeKm({ usuarioId }: { usuarioId: string | null }) {
  const [carros, setCarros] = useState<Carro[] | null>(null);
  const [escolhido, setEscolhido] = useState<Carro | null>(null);
  const [km, setKm] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!usuarioId || jaPerguntouNestaAbertura) return;
    let ativo = true;
    carrosSePrecisarPedir(usuarioId)
      .then((lista) => {
        if (!ativo || !lista) return;
        jaPerguntouNestaAbertura = true;
        setCarros(lista);
        // Com um carro so no nome, ja vem escolhido.
        const meus = lista.filter((c) => c.seu);
        if (meus.length === 1) setEscolhido(meus[0]);
      })
      // Sem sinal ou sem carro: nao pergunta.
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [usuarioId]);

  const fechar = useCallback(() => {
    setCarros(null);
    setEscolhido(null);
    setKm("");
    setErro(null);
  }, []);

  const registrar = useCallback(async () => {
    if (enviando) return;
    if (!escolhido) {
      setErro("Escolha o carro que você está usando.");
      return;
    }
    const valor = lerKm(km);
    if (valor === null) {
      setErro("Informe o km do painel, só números.");
      return;
    }
    if (valor < escolhido.km_atual) {
      setErro(`O último km deste carro é ${kmNaTela(escolhido.km_atual)}. Confira o painel e o carro escolhido.`);
      return;
    }

    setEnviando(true);
    setErro(null);
    const { error } = await supabase.from("veiculo_km").insert({ veiculo_id: escolhido.id, km: valor });
    setEnviando(false);

    if (error) {
      setErro(
        error.code === "22023"
          ? "O km informado é menor que o último registrado. Confira o painel e o carro escolhido."
          : "Não foi possível registrar agora. Tente de novo ou toque em Agora não.",
      );
      return;
    }
    fechar();
  }, [escolhido, km, enviando, fechar]);

  if (!carros) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={fechar}>
      <KeyboardAvoidingView style={estilos.veu} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={estilos.cartao} accessibilityViewIsModal>
          <Text style={estilos.titulo}>Km do veículo</Text>
          <Text style={estilos.apoio}>Qual carro você está usando hoje?</Text>

          <ScrollView style={estilos.lista} accessibilityRole="radiogroup">
            {carros.map((c) => {
              const marcado = escolhido?.id === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    setEscolhido(c);
                    setErro(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: marcado }}
                  style={[estilos.opcao, marcado && estilos.opcaoMarcada]}
                >
                  <View style={[estilos.bolinha, marcado && estilos.bolinhaMarcada]} />
                  <View style={estilos.opcaoMiolo}>
                    <Text style={estilos.opcaoTitulo}>
                      {c.modelo} · {placaComHifen(c.placa)}
                    </Text>
                    <Text style={estilos.opcaoApoio}>
                      {c.seu ? "Seu" : "Frota"}
                      {c.km_atual > 0 ? ` · último ${kmNaTela(c.km_atual)}` : ""}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <Campo
            rotulo="Km do painel"
            valor={km}
            aoMudar={setKm}
            placeholder="Ex.: 45.230"
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={() => void registrar()}
          />
          {erro ? <Aviso mensagem={erro} /> : null}
          <Botao titulo="Registrar km" larguraTotal carregando={enviando} aoPressionar={() => void registrar()} />
          <Botao titulo="Agora não" variante="secundaria" tamanho="medio" larguraTotal aoPressionar={fechar} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  veu: {
    flex: 1,
    backgroundColor: "rgba(3, 3, 26, 0.8)",
    justifyContent: "center",
    padding: espaco.interno,
  },
  cartao: {
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.cartao,
    padding: espaco.interno,
    gap: espaco.entreItens,
    maxHeight: "92%",
  },
  titulo: texto(tipografia.subtitulo, { cor: cores.texto }),
  apoio: texto(tipografia.apoio, { cor: cores.textoFraco }),
  lista: { maxHeight: 260 },
  opcao: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.entreItens,
    paddingVertical: espaco.entreItens,
    paddingHorizontal: espaco.entreItens,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: "transparent",
  },
  opcaoMarcada: { borderColor: cores.primaria, backgroundColor: "rgba(0, 230, 118, 0.08)" },
  bolinha: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: cores.bordaRealcada },
  bolinhaMarcada: { borderColor: cores.primaria, backgroundColor: cores.primaria },
  opcaoMiolo: { flex: 1, gap: 2 },
  opcaoTitulo: texto(tipografia.corpo, { cor: cores.texto }),
  opcaoApoio: texto(tipografia.apoio, { cor: cores.textoFraco }),
});
