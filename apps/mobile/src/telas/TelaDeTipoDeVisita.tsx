import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ROTULO_DO_TIPO, TIPOS_DE_VISITA, type TipoDeVisita } from "@projeto-renatoo/shared";

import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { abandonarInspecao, converterParaVisita } from "../campo/acoes-da-visita";
import { supabase } from "../lib/supabase";
import { tituloDaColeta } from "../lib/titulo-da-coleta";
import { IconeDeFerramenta, IconeDePessoa, IconeDeSeta } from "../componentes/icones";
import { colunaDeLeitura, cores, espaco, raio, texto, tipografia } from "../tema";

/**
 * Escolha do tipo de visita, antes do checklist.
 *
 * Era um seletor no topo do proprio formulario, e virou tela: o material que
 * a supervisao distribuiu para os inspetores mostra a escolha como uma lista
 * de opcoes que se abre, e cada uma levando a um formulario proprio. Quem
 * chega com esse papel na mao procura essa tela.
 *
 * A troca custou o que o seletor no topo dava de graca -- trocar de tipo sem
 * recomecar. O botao de voltar do header cobre isso: volta para ca com o
 * formulario descartado, que e o comportamento correto de qualquer forma. Os
 * dois caminhos pedem coisas diferentes (motivo de um lado, dez perguntas do
 * outro), e carregar respostas de um para o outro seria pior que recomecar.
 */

const DESCRICAO: Record<TipoDeVisita, string> = {
  CORRETIVA: "Informe o motivo da visita, foto e assinatura",
  CONSULTORIA: "Checklist completo, fotos e assinatura",
};

const ICONE: Record<TipoDeVisita, (props: { cor: string }) => React.ReactElement> = {
  CORRETIVA: IconeDeFerramenta,
  CONSULTORIA: IconeDePessoa,
};

export function TelaDeTipoDeVisita({
  visitaId,
  numeroColeta,
  siteId: siteDaRota,
  retomado = false,
  aoEscolher,
  aoVerAgendados,
  aoVerRespondidos,
  aoConcluir,
}: {
  visitaId: number | null;
  numeroColeta: string;
  siteId: number | null;
  retomado?: boolean;
  aoEscolher: (tipo: TipoDeVisita) => void;
  aoVerAgendados: (siteId: number) => void;
  aoVerRespondidos: (siteId: number) => void;
  /** Depois de converter ou abandonar: volta ao menu. */
  aoConcluir: () => void;
}) {
  // O local da visita: o da rota (QR, "Ver sites") ou, vindo da lista de
  // Inspecao, o da propria visita no servidor.
  const [siteBuscado, setSiteBuscado] = useState<number | null>(null);
  const siteId = siteDaRota ?? siteBuscado;
  useEffect(() => {
    if (siteDaRota !== null || visitaId === null) return;
    let ativo = true;
    void supabase
      .from("visitas")
      .select("site_id")
      .eq("id", visitaId)
      .maybeSingle()
      .then(({ data }) => {
        if (ativo && data) setSiteBuscado(data.site_id);
      });
    return () => {
      ativo = false;
    };
  }, [siteDaRota, visitaId]);

  const [ocupado, setOcupado] = useState<"converter" | "abandonar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // "Converter para Visita" e "Abandonar Inspecao", o menu da inspecao aberta
  // do app de referencia (regras em `campo/acoes-da-visita.ts`).
  const converter = () => {
    if (visitaId === null) return;
    Alert.alert(
      "Converter para Visita",
      "A inspeção vira uma visita simples: fica registrada a presença, com o término agora, sem checklist.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Converter",
          onPress: async () => {
            setOcupado("converter");
            const resultado = await converterParaVisita({ visitaId, numeroColeta });
            setOcupado(null);
            if (resultado.ok) aoConcluir();
            else setErro(resultado.erro);
          },
        },
      ],
    );
  };

  const abandonar = () => {
    Alert.alert(
      "Abandonar Inspeção",
      "A inspeção aberta e o checklist começado serão descartados. Não dá para desfazer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Abandonar",
          style: "destructive",
          onPress: async () => {
            setOcupado("abandonar");
            const resultado = await abandonarInspecao({ visitaId, numeroColeta, siteId });
            setOcupado(null);
            if (resultado.ok) aoConcluir();
            else setErro(resultado.erro);
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={estilos.raiz} contentContainerStyle={estilos.conteudo}>
      <Text style={estilos.titulo}>{tituloDaColeta(visitaId)}</Text>
      <Text style={estilos.subtitulo}>Selecione o tipo de visita</Text>

      {retomado ? (
        <Aviso
          tom="sucesso"
          mensagem="Este site tem um checklist começado e não enviado. Escolha o mesmo tipo para continuar de onde parou."
        />
      ) : null}

      {TIPOS_DE_VISITA.map((tipo, indice) => {
        const Icone = ICONE[tipo];

        return (
          <Pressable
            key={tipo}
            onPress={() => aoEscolher(tipo)}
            accessibilityRole="button"
            accessibilityLabel={`${ROTULO_DO_TIPO[tipo]}. ${DESCRICAO[tipo]}`}
            // Cartao inteiro como alvo de toque, e nao so o texto: o aparelho
            // e usado em pe, as vezes com luva.
            style={({ pressed }) => [estilos.opcao, pressed && estilos.opcaoPressionada]}
          >
            <View style={estilos.marca}>
              <Icone cor={cores.primaria} />
            </View>

            <View style={estilos.textos}>
              <Text style={estilos.rotulo}>
                {indice + 1}. {ROTULO_DO_TIPO[tipo]}
              </Text>
              <Text style={estilos.descricao}>{DESCRICAO[tipo]}</Text>
            </View>

            <IconeDeSeta cor={cores.textoFraco} />
          </Pressable>
        );
      })}

      {siteId !== null ? (
        <View style={estilos.acoes}>
          <Botao titulo="Checklists agendados" variante="secundaria" larguraTotal aoPressionar={() => aoVerAgendados(siteId)} />
          <Botao
            titulo="Checklists respondidos"
            variante="secundaria"
            larguraTotal
            aoPressionar={() => aoVerRespondidos(siteId)}
          />
        </View>
      ) : null}

      {erro ? <Aviso mensagem={erro} /> : null}

      <View style={estilos.acoes}>
        {visitaId !== null ? (
          <Botao
            titulo="Converter para Visita"
            variante="secundaria"
            larguraTotal
            carregando={ocupado === "converter"}
            desabilitado={ocupado !== null}
            aoPressionar={converter}
          />
        ) : null}
        <Botao
          titulo="Abandonar Inspeção"
          variante="perigo"
          larguraTotal
          carregando={ocupado === "abandonar"}
          desabilitado={ocupado !== null}
          aoPressionar={abandonar}
        />
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { ...colunaDeLeitura, padding: espaco.interno, gap: espaco.entreItens },

  titulo: texto(tipografia.titulo, { cor: cores.texto }),
  subtitulo: {
    ...texto(tipografia.apoio, { cor: cores.textoFraco }),
    marginBottom: espaco.minimo,
  },

  opcao: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.entreItens,
    backgroundColor: cores.superficie,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espaco.interno,
  },
  opcaoPressionada: { borderColor: cores.primaria, opacity: 0.9 },

  // Disco navy sobre a superficie, a mesma inversao do `EstadoVazio`: e o que
  // faz o icone assentar em vez de flutuar solto ao lado do texto.
  marca: { backgroundColor: cores.fundo, borderRadius: raio.pilula, padding: espaco.entreItens },

  textos: { flex: 1, gap: 2 },
  rotulo: texto(tipografia.destaque, { cor: cores.texto }),
  descricao: texto(tipografia.nota, { cor: cores.textoFraco }),

  acoes: { gap: espaco.minimo, marginTop: espaco.entreItens },
});
