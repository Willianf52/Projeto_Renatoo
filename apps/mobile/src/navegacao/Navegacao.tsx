import { DarkTheme, NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { ROTULO_DO_TIPO, type TipoDeVisita } from "@projeto-renatoo/shared";

import { useSessao } from "../auth/SessaoProvider";
import { usePisoDeVersao } from "../lib/usePisoDeVersao";
import { TelaDeAbertura } from "../telas/TelaDeAbertura";
import { TelaDeAgendados } from "../telas/TelaDeAgendados";
import { TelaDeAcessoBloqueado } from "../telas/TelaDeAcessoBloqueado";
import { TelaDeChecklist } from "../telas/TelaDeChecklist";
import { TelaDeInspecoes } from "../telas/TelaDeInspecoes";
import { TelaDeLogin } from "../telas/TelaDeLogin";
import { TelaDeTipoDeVisita } from "../telas/TelaDeTipoDeVisita";
import { TelaInicial } from "../telas/TelaInicial";
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
  Inicio: undefined;
  Inspecoes: undefined;
  Agendados: undefined;
  TipoDeVisita: { visitaId: number; numeroColeta: string };
  Checklist: { visitaId: number; numeroColeta: string; tipo: TipoDeVisita };
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
  const { bloqueado: versaoVelhaDemais } = usePisoDeVersao();

  /**
   * O portao de versao vem ANTES de tudo, inclusive do login.
   *
   * Um build abaixo do piso nao pode nem autenticar: a partir da 0036 o app
   * escreve direto em `visitas`/`leituras`, e a 0042 deu a ele um RPC com
   * contrato proprio. Cliente velho continua escrevendo com o contrato velho
   * e o banco aceita -- o estrago nao aparece como erro, aparece como dado
   * incompleto num relatorio meses depois. Barrar na porta e o unico lugar
   * onde isso sai barato.
   *
   * Falha aberta quando nao da para perguntar o piso; o porque esta em
   * `lib/versao-minima.ts`.
   */
  if (versaoVelhaDemais) {
    return <TelaDeAcessoBloqueado motivo="app-desatualizado" perfil={null} />;
  }

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
        {/* A raiz e o menu, e nao mais a lista de visitas: e a forma que os
            inspetores ja conhecem do sistema antigo, com a pergunta em cima e
            os tres cartoes embaixo. A lista virou um destino do menu. */}
        <Pilha.Screen
          name="Inicio"
          component={TelaInicial}
          options={{ title: "Inicio", headerShown: false }}
        />

        {/* Com header desde que deixou de ser a raiz: sem ele nao ha botao de
            voltar, e o inspetor que entrasse na lista ficaria sem caminho de
            volta ao menu a nao ser pelo gesto do sistema. */}
        <Pilha.Screen
          name="Inspecoes"
          component={TelaDeInspecoes}
          options={{ title: "Minhas visitas" }}
        />

        <Pilha.Screen
          name="Agendados"
          component={TelaDeAgendados}
          options={{ title: "Agendados" }}
        />

        {/* A escolha do tipo e tela propria, e nao um seletor no topo do
            formulario: e a forma do material que a supervisao distribuiu para
            os inspetores. O `push` para `Checklist` leva o tipo como
            parametro. */}
        <Pilha.Screen name="TipoDeVisita" options={{ title: "Checklist de visitas" }}>
          {({ route, navigation }) => (
            <TelaDeTipoDeVisita
              numeroColeta={route.params.numeroColeta}
              aoEscolher={(tipo) =>
                navigation.navigate("Checklist", { ...route.params, tipo })
              }
            />
          )}
        </Pilha.Screen>

        {/* Com header, ao contrario da raiz: o inspetor precisa do botao de
            voltar para desistir do checklist sem sair do app -- e e o header
            que reserva o espaco da barra de status, que a raiz resolve na mao
            com `useSafeAreaInsets`. */}
        <Pilha.Screen
          name="Checklist"
          options={({ route }) => ({ title: ROTULO_DO_TIPO[route.params.tipo] })}
        >
          {({ route, navigation }) => (
            <TelaDeChecklist
              visitaId={route.params.visitaId}
              numeroColeta={route.params.numeroColeta}
              tipo={route.params.tipo}
              // `pop(2)` e nao `goBack`: agora ha duas telas entre a lista e
              // aqui (a escolha do tipo entrou no meio), e um voltar simples
              // devolveria o inspetor a pergunta "que tipo de visita?" logo
              // depois de ele ter terminado uma. Desempilhar as duas mantem o
              // que o `goBack` dava -- a lista continua montada embaixo, com a
              // rolagem de onde ele saiu.
              aoConcluir={() => navigation.pop(2)}
            />
          )}
        </Pilha.Screen>
      </Pilha.Navigator>
    </NavigationContainer>
  );
}
