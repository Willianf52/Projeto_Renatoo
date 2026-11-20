import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from "react-native";
import { kmNaTela, lerKm, placaComHifen } from "@projeto-renatoo/shared";

import { inicioDoDia } from "../campo/rascunho";
import { supabase } from "../lib/supabase";
import { cores, espaco, raio, texto, tipografia } from "../tema";
import { Aviso } from "./Aviso";
import { Botao } from "./Botao";
import { Campo } from "./Campo";

/**
 * "Ao abrir ja pede o km do veiculo" (pedido do gestor, 16/11/2026).
 *
 * Aparece na tela inicial quando a pessoa tem um veiculo ativo em seu nome
 * (Cadastros > Veiculos, 0104) e ninguem registrou o km dele hoje. Uma vez por
 * abertura do app: "Agora nao" fecha ate a proxima vez que o app abrir.
 *
 * Nao trava o trabalho: sem sinal, nem pergunta (o km nao vai para a fila do
 * aparelho, e um pedido que nao da para cumprir so atrapalharia a ronda). O
 * banco recusa km menor que o ultimo (22023) e e ele que avisa a revisao aos
 * 9.000 km; aqui so o formato.
 */

type Veiculo = { id: number; placa: string; modelo: string; km_atual: number };

/** Ja perguntou nesta abertura do app (sobrevive a ir e voltar da tela). */
let jaPerguntouNestaAbertura = false;

async function veiculoSemKmHoje(usuarioId: string): Promise<Veiculo | null> {
  const { data: veiculo, error } = await supabase
    .from("veiculos")
    .select("id, placa, modelo, km_atual")
    .eq("usuario_id", usuarioId)
    .eq("ativo", true)
    .maybeSingle();
  if (error || !veiculo) return null;

  const { count, error: erroDoKm } = await supabase
    .from("veiculo_km")
    .select("id", { count: "exact", head: true })
    .eq("veiculo_id", veiculo.id)
    .gte("registrado_em", inicioDoDia());
  if (erroDoKm || (count ?? 0) > 0) return null;
  return veiculo;
}

export function PedidoDeKm({ usuarioId }: { usuarioId: string | null }) {
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null);
  const [km, setKm] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!usuarioId || jaPerguntouNestaAbertura) return;
    let ativo = true;
    veiculoSemKmHoje(usuarioId)
      .then((v) => {
        if (!ativo || !v) return;
        jaPerguntouNestaAbertura = true;
        setVeiculo(v);
      })
      // Sem sinal ou sem veiculo: nao pergunta.
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [usuarioId]);

  const fechar = useCallback(() => {
    setVeiculo(null);
    setKm("");
    setErro(null);
  }, []);

  const registrar = useCallback(async () => {
    if (!veiculo || enviando) return;
    const valor = lerKm(km);
    if (valor === null) {
      setErro("Informe o km do painel, só números.");
      return;
    }
    if (valor < veiculo.km_atual) {
      setErro(`O último km registrado é ${kmNaTela(veiculo.km_atual)}. Confira o painel.`);
      return;
    }

    setEnviando(true);
    setErro(null);
    const { error } = await supabase.from("veiculo_km").insert({ veiculo_id: veiculo.id, km: valor });
    setEnviando(false);

    if (error) {
      setErro(
        error.code === "22023"
          ? "O km informado é menor que o último registrado. Confira o painel."
          : "Não foi possível registrar agora. Tente de novo ou toque em Agora não.",
      );
      return;
    }
    fechar();
  }, [veiculo, km, enviando, fechar]);

  if (!veiculo) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={fechar}>
      <KeyboardAvoidingView style={estilos.veu} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={estilos.cartao} accessibilityViewIsModal>
          <Text style={estilos.titulo}>Km do veículo</Text>
          <Text style={estilos.texto}>
            {placaComHifen(veiculo.placa)} · {veiculo.modelo}
            {veiculo.km_atual > 0 ? `\nÚltimo registrado: ${kmNaTela(veiculo.km_atual)}` : ""}
          </Text>
          <Campo
            rotulo="Km do painel"
            valor={km}
            aoMudar={setKm}
            placeholder="Ex.: 45.230"
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={() => void registrar()}
            autoFocus
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
  },
  titulo: texto(tipografia.subtitulo, { cor: cores.texto }),
  texto: texto(tipografia.apoio, { cor: cores.textoFraco }),
});
