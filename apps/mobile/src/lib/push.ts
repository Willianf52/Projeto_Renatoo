import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "./supabase";

/**
 * Notificacao no celular com o app fechado (pedido do gestor; 22/11/2026).
 *
 * O aviso nasce no banco (`notificacoes`, 0103) e o gatilho da 0110 o manda
 * ao servico de push do Expo para cada aparelho registrado da pessoa. Aqui o
 * app faz a parte dele: cria o canal "Avisos" no Android, pede a permissao,
 * pega o endereco de push do aparelho e o registra
 * (`registrar_dispositivo_push`).
 *
 * Nada aqui pode atrapalhar a ronda: sem permissao, sem internet ou rodando
 * no Expo Go (que nao recebe push no Android), simplesmente nao registra, e o
 * aviso continua na caixa do app e no sino do portal.
 */

let enderecoDoAparelho: string | null = null;

// Com o app aberto, o aviso tambem aparece no topo da tela.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function rodandoNoExpoGo(): boolean {
  return Constants.executionEnvironment === "storeClient";
}

/** Registra o aparelho para a pessoa logada. Nunca lanca. */
export async function registrarParaPush(): Promise<void> {
  try {
    if (rodandoNoExpoGo()) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("avisos", {
        name: "Avisos",
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: "#00e676",
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: endereco } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!endereco) return;

    const { error } = await supabase.rpc("registrar_dispositivo_push", {
      p_token: endereco,
      p_plataforma: Platform.OS === "ios" ? "ios" : "android",
    });
    if (!error) enderecoDoAparelho = endereco;
  } catch {
    // Sem servicos do Google no aparelho, sem rede: fica so a caixa de avisos.
  }
}

/**
 * Ao sair do app: o aparelho deixa de receber os avisos desta pessoa. Chamado
 * antes do `signOut`, enquanto a sessao ainda vale para o RLS. Nunca lanca.
 */
export async function esquecerAparelhoDoPush(): Promise<void> {
  if (!enderecoDoAparelho) return;
  const endereco = enderecoDoAparelho;
  enderecoDoAparelho = null;
  try {
    await supabase.from("dispositivos_push").delete().eq("token", endereco);
  } catch {
    // Sem rede: o proximo a entrar neste aparelho toma o endereco para si.
  }
}
