import { registerRootComponent } from 'expo';

import App from './App';
import { RaizDoRoteiro, roteiroLigado } from './src/campo/roteiro-marco-03';

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
registerRootComponent(roteiroLigado() ? RaizDoRoteiro : App);
