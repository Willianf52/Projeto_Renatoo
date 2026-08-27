import { DarkTheme, NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useSessao } from "../auth/SessaoProvider";
import { TelaDeAbertura } from "../telas/TelaDeAbertura";
import { TelaDeAcessoBloqueado } from "../telas/TelaDeAcessoBloqueado";
import { TelaDeChecklist } from "../telas/TelaDeChecklist";
import { TelaDeInspecoes } from "../telas/TelaDeInspecoes";
import { TelaDeLogin } from "../telas/TelaDeLogin";
import { cores } from "../tema";

/**
 * Rotas da area autenticada. E uma pilha, e nao a tela solta, porque as
 * proximas ja tem lugar definido -- "Leitura" entra aqui como push, sem
 * reescrever a raiz.
 *
 * `Checklist` recebe `numeroColeta` alem do `visitaId` de proposito: com so o
 * id, a tela abriria sem titulo enquanto busca a visita de novo -- um round
 * trip para redesenhar o que a lista de onde se veio ja tinha na mao.
 */
export type RotasDoApp = {
  Inspecoes: undefined;
  Checklist: { visitaId: number; numeroColeta: number };
};

const Pilha = createNativeStackNavigator<RotasDoApp>();

/**
 * O tema padrao do React Navigation e claro: sem isto, o fundo que ele pinta
 * atras das telas e branco, e cada transicao pisca branco entre uma tela navy
 * e a seguinte. O `DarkTheme` e a base porque ja traz as tipografias que a v7
 * exige -- so as cores viram as da marca.
 */
const TEMA: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: cores.primaria,
    background: cores.fundo,
    card: cores.superficie,
    text: cores.texto,
    border: cores.borda,
    notification: cores.primaria,
  },
};

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

  // Sessao ainda sendo lida do armazenamento seguro. Sem isto, o app pisca a tela de
  // login por um instante a cada abertura, mesmo com o inspetor logado.
  //
  // A tela e a mesma imagem da splash nativa (ver `TelaDeAbertura`): a espera
  // continua parecendo a abertura do app, e nao uma quarta tela.
  if (carregando) {
    return <TelaDeAbertura />;
  }

  if (!sessao) {
    return <TelaDeLogin />;
  }

  // Sessao valida, perfil ainda a caminho: esperar evita classificar como
  // "sem perfil" quem so esta com a rede lenta.
  if (!perfil && !erroDePerfil) {
    return <TelaDeAbertura />;
  }

  if (!perfil) {
    return <TelaDeAcessoBloqueado motivo="sem-perfil" perfil={null} aoSair={sair} />;
  }

  if (!perfil.ativo) {
    return <TelaDeAcessoBloqueado motivo="inativo" perfil={perfil} aoSair={sair} />;
  }

  // Nao ha portao de cargo aqui, de proposito: conta ativa entra. O que cada
  // cargo enxerga depois disso e o RLS que decide, consulta por consulta --
  // um CLIENTE le so os sites do grupo dele, um OPERADOR so o que tem o
  // proprio `funcionario_id`. Repetir essa regra no cliente daria uma segunda
  // fonte de verdade para desencontrar da primeira.

  return (
    <NavigationContainer theme={TEMA}>
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

        {/* Com header, ao contrario da raiz: o inspetor precisa do botao de
            voltar para desistir do checklist sem sair do app -- e e o header
            que reserva o espaco da barra de status, que a raiz resolve na mao
            com `useSafeAreaInsets`. */}
        <Pilha.Screen name="Checklist" options={{ title: "Finalizar visita" }}>
          {({ route, navigation }) => (
            <TelaDeChecklist
              visitaId={route.params.visitaId}
              numeroColeta={route.params.numeroColeta}
              // `goBack` e nao `navigate("Inspecoes")`: a lista continua
              // montada embaixo, e voltar para ela preserva a rolagem de onde
              // o inspetor saiu.
              aoConcluir={() => navigation.goBack()}
            />
          )}
        </Pilha.Screen>
      </Pilha.Navigator>
    </NavigationContainer>
  );
}
