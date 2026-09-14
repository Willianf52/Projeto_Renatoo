import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ROTULO_DO_TIPO, TIPOS_DE_VISITA, type TipoDeVisita } from "@projeto-renatoo/shared";

import { IconeDeFerramenta, IconeDePessoa, IconeDeSeta } from "../componentes/icones";
import { cores, espaco, raio, texto, tipografia } from "../tema";

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
  numeroColeta,
  aoEscolher,
}: {
  numeroColeta: string;
  aoEscolher: (tipo: TipoDeVisita) => void;
}) {
  return (
    <ScrollView style={estilos.raiz} contentContainerStyle={estilos.conteudo}>
      <Text style={estilos.titulo}>Coleta {numeroColeta}</Text>
      <Text style={estilos.subtitulo}>Selecione o tipo de visita</Text>

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
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.interno, gap: espaco.entreItens },

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
});
