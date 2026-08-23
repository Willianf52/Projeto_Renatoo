import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { CARGO_INSPETOR } from "@projeto-renatoo/shared";

import { useSessao } from "../auth/SessaoProvider";
import { TelaDeAcessoBloqueado } from "../telas/TelaDeAcessoBloqueado";
import { TelaDeInspecoes } from "../telas/TelaDeInspecoes";
import { TelaDeLogin } from "../telas/TelaDeLogin";
import { cores } from "../tema";

/**
 * Rotas da area autenticada. Hoje so uma; e uma pilha, e nao a tela solta,
 * porque as proximas ja tem lugar definido -- "Nova visita" e "Leitura"
 * entram aqui como push, sem reescrever a raiz.
 */
export type RotasDoApp = {
  Inspecoes: undefined;
};

const Pilha = createNativeStackNavigator<RotasDoApp>();

/**
 * O login NAO e uma rota da pilha, de proposito.
 *
 * Se fosse, sair da conta teria que desempilhar telas na mao, e um `goBack`
 * levaria de volta para dentro do app com a sessao ja encerrada. Trocando a
 * arvore pela sessao, a pilha autenticada e *destruida* no logout -- nao ha
 * historico para voltar.
 */
export function Navegacao() {
  const { sessao, perfil, carregando, erroDePerfil, sair } = useSessao();

  // Sessao ainda sendo lida do AsyncStorage. Sem isto, o app pisca a tela de
  // login por um instante a cada abertura, mesmo com o inspetor logado.
  if (carregando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={cores.primaria} />
      </View>
    );
  }

  if (!sessao) {
    return <TelaDeLogin />;
  }

  // Sessao valida, perfil ainda a caminho: esperar evita classificar como
  // "sem perfil" quem so esta com a rede lenta.
  if (!perfil && !erroDePerfil) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={cores.primaria} />
      </View>
    );
  }

  if (!perfil) {
    return <TelaDeAcessoBloqueado motivo="sem-perfil" perfil={null} aoSair={sair} />;
  }

  if (!perfil.ativo) {
    return <TelaDeAcessoBloqueado motivo="inativo" perfil={perfil} aoSair={sair} />;
  }

  // CARGO_INSPETOR vem do shared: o mesmo valor que `e_inspetor()` compara no
  // banco. Hardcodar "INSPETOR" aqui abriria a porta para o app e a policy
  // discordarem sem ninguem perceber.
  if (perfil.cargo !== CARGO_INSPETOR) {
    return <TelaDeAcessoBloqueado motivo="cargo" perfil={perfil} aoSair={sair} />;
  }

  return (
    <NavigationContainer>
      <Pilha.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: cores.superficie },
          headerTintColor: cores.texto,
          headerShadowVisible: false,
        }}
      >
        <Pilha.Screen
          name="Inspecoes"
          component={TelaDeInspecoes}
          options={{ title: "Minhas visitas", headerShown: false }}
        />
      </Pilha.Navigator>
    </NavigationContainer>
  );
}

const estilos = StyleSheet.create({
  centro: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: cores.fundo,
  },
});
