import { registerRootComponent } from 'expo';

import App from './App';
import { RaizDoRoteiro, roteiroLigado } from './src/campo/roteiro-marco-03';
import { envolverRaiz, iniciarObservabilidade } from './src/lib/observabilidade-sentry';

// Antes de qualquer import de tela ter a chance de rodar efeito, e antes do
// primeiro render: crash de montagem acontece cedo demais para um init
// dentro de `App` alcancar. Sem DSN configurado isto e um no-op -- ver
// `src/lib/observabilidade.ts`.
iniciarObservabilidade();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
//
// O desvio para o roteiro do marco 03 acontece AQUI, e nao dentro de `App`,
// para o roteiro nao herdar nada do app: sem provedor de sessao decidindo
// tela, sem espera de fonte, sem splash. O que ele prova e a fila e o
// reenvio -- qualquer coisa montada em volta so acrescentaria suspeito a
// investigacao. Sem `EXPO_PUBLIC_ROTEIRO_MARCO_03=1` no ambiente, este ramo
// nao existe no bundle de producao.
//
// `envolverRaiz` entra por fora da escolha, e nao so no ramo do `App`: se o
// roteiro quebrar, quebrar em silencio e exatamente o que nao se quer de uma
// ferramenta que existe para investigar.
registerRootComponent(envolverRaiz(roteiroLigado() ? RaizDoRoteiro : App));
