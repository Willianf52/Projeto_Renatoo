import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessaoProvider } from "./src/auth/SessaoProvider";
import { Navegacao } from "./src/navegacao/Navegacao";

/**
 * Raiz do app de inspecao em campo.
 *
 * So monta os provedores -- quem decide qual tela aparece e `Navegacao`, a
 * partir do estado da sessao. Manter a decisao la, e nao aqui, e o que
 * permite que login, conta inativa e cargo errado sejam ramos de um lugar so.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <SessaoProvider>
        <StatusBar style="dark" />
        <Navegacao />
      </SessaoProvider>
    </SafeAreaProvider>
  );
}
