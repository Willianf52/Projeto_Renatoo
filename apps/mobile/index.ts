import { registerRootComponent } from 'expo';

import App from './App';
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
// O roteiro do marco 03 (que trocava o App por uma tela de teste com e-mail e
// senha vindos de EXPO_PUBLIC_*) saiu em 06/11/2026: variavel EXPO_PUBLIC_ vai
// embutida no app, e uma senha preenchida por engano iria junto (L3 da
// auditoria de seguranca).
registerRootComponent(envolverRaiz(App));
