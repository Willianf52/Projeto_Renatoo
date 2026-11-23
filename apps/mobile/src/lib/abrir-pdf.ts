import { Linking } from "react-native";

import { env } from "./env";
import { pedirLinkDoPdf } from "./link-do-pdf";
import { capturarErro } from "./observabilidade";
import { supabase } from "./supabase";

/**
 * "Baixar PDF" (18/11/2026): pede o link ao portal e abre no navegador do
 * celular, que mostra o PDF para salvar ou mandar por WhatsApp. `Linking` e do
 * proprio React Native: nao ha modulo nativo novo, entao chega por atualizacao
 * pelo ar, sem APK.
 *
 * Devolve a mensagem de erro para a tela mostrar, ou nulo quando abriu.
 */
export async function abrirPdfDoChecklist(checklistId: number): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const resultado = await pedirLinkDoPdf(env.urlDoPortal, checklistId, data.session?.access_token ?? null);
  if (!resultado.ok) return resultado.erro;

  try {
    await Linking.openURL(resultado.url);
    return null;
  } catch (falha) {
    capturarErro(falha, { onde: "abrirPdfDoChecklist", checklist: String(checklistId) });
    return "Não foi possível abrir o navegador do celular.";
  }
}
