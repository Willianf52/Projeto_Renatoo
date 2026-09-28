import * as Crypto from "expo-crypto";

import { supabase } from "../lib/supabase";

/**
 * Visita aberta pela lista "Ver sites", sem leitura de QR (pedido do dono,
 * 28/09/2026): tocar no site cria a visita e segue para o checklist.
 *
 * DIRETO NO SERVIDOR, E NAO PELA FILA. A fila (`fila.ts`) so sobe visita que
 * tenha leitura (`esquemaDeVisitaDeCampo` exige ao menos uma), e esta nao tem
 * -- o que a distingue, nos relatorios, de uma ronda por QR. E o checklist que
 * vem logo depois ja precisa de rede (foto e assinatura sobem na hora), entao
 * exigir rede aqui nao tira nada do inspetor.
 *
 * O portao continua no banco: a policy da 0060 so deixa INSPETOR e GESTOR
 * ativos gravarem visita, e so em nome proprio (`funcionario_id = auth.uid()`).
 * `numero_coleta` e um UUID cunhado no aparelho, o mesmo formato das rondas.
 */

export type SiteParaVisita = { id: number; nome: string; ativo: boolean; recebeVisita: boolean };

export type ResultadoDaVisita =
  | { ok: true; visitaId: number; numeroColeta: string }
  | { ok: false; erro: string };

/** O que impede abrir visita no site, ou `null` se pode. Pura. */
export function motivoParaNaoAbrir(site: SiteParaVisita): string | null {
  if (!site.ativo) return `O site ${site.nome} está inativo.`;
  if (!site.recebeVisita) return `O site ${site.nome} está marcado para não receber visitas.`;
  return null;
}

export async function abrirVisitaPeloSite(site: SiteParaVisita, funcionarioId: string): Promise<ResultadoDaVisita> {
  const motivo = motivoParaNaoAbrir(site);
  if (motivo) return { ok: false, erro: motivo };

  const numeroColeta = Crypto.randomUUID();

  try {
    const { data, error } = await supabase
      .from("visitas")
      .insert({ numero_coleta: numeroColeta, site_id: site.id, funcionario_id: funcionarioId })
      .select("id")
      .single();

    if (error || !data) {
      return {
        ok: false,
        erro: error?.code === "42501"
          ? "Sua conta não pode registrar visitas."
          : "Não foi possível registrar a visita. Tente de novo.",
      };
    }

    return { ok: true, visitaId: data.id, numeroColeta };
  } catch {
    // Rejeicao da camada de rede: sem sinal.
    return { ok: false, erro: "Sem conexão. O checklist precisa de internet para enviar fotos e assinatura." };
  }
}
