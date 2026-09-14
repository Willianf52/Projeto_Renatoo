import { StyleSheet, View } from "react-native";

import { EstadoVazio } from "../componentes/EstadoVazio";
import { cores, espaco } from "../tema";

/**
 * "Agendados" -- o terceiro destino do menu, ainda sem fonte de dado.
 *
 * A tela existe vazia de proposito, e o texto diz por que. O sistema antigo
 * lista aqui os checklists que a supervisao agendou para o inspetor, e nao ha
 * equivalente disso neste banco: nenhuma tabela guarda "visita planejada para
 * tal dia" -- `metas_visitas` chega perto, mas conta quantas se espera de um
 * site no mes, sem dizer de quem nem quando.
 *
 * A alternativa seria esconder o cartao do menu ate a funcionalidade existir.
 * Perde: o inspetor que conhece o app antigo procuraria o botao que sumiu e
 * concluiria que o app novo nao faz agendamento -- que e diferente de "ainda
 * nao faz". Um estado vazio honesto responde a pergunta; um cartao ausente,
 * nao.
 */
export function TelaDeAgendados() {
  return (
    <View style={estilos.raiz}>
      <EstadoVazio
        titulo="Nenhum checklist agendado"
        descricao="O agendamento pela supervisão ainda não está ligado ao portal. Por enquanto, as visitas aparecem em Inspeção assim que são registradas."
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: {
    flex: 1,
    backgroundColor: cores.fundo,
    justifyContent: "center",
    padding: espaco.confortavel,
  },
});
