import * as Crypto from "expo-crypto";

import { supabase } from "../lib/supabase";

/**
 * Visita aberta pela lista "Ver sites", sem leitura de QR (pedido do dono,
 * 28/09/2026): tocar no site vai direto para o checklist.
 *
 * A VISITA SO NASCE NO ENVIO DO CHECKLIST (28/09/2026). Criar no toque deixava
 * uma visita vazia no banco toda vez que a pessoa voltava sem enviar (a 73, na
 * ACE Limpeza) -- e apagar depois nao e opcao: INSPETOR so tem INSERT em
 * `visitas`, decisao de governanca. Entao o toque so cunha o `numero_coleta`
 * (`novoNumeroDeColeta`) e o `TelaDeChecklist` chama `criarVisitaPeloSite` no
 * "Finalizar", antes de subir a primeira foto -- o caminho da midia no Storage
 * precisa do id da visita.
 *
 * DIRETO NO SERVIDOR, E NAO PELA FILA. A fila (`fila.ts`) so sobe visita que
 * tenha leitura (`esquemaDeVisitaDeCampo` exige ao menos uma), e esta nao tem
 * -- o que a distingue, nos relatorios, de uma ronda por QR. E o envio do
 * checklist ja precisa de rede (foto e assinatura sobem na hora).
 *
 * O portao continua no banco: a policy da 0060 so deixa INSPETOR e GESTOR
 * ativos gravarem visita, e so em nome proprio (`funcionario_id = auth.uid()`).
 */

export type SiteParaVisita = { id: number; nome: string; ativo: boolean; recebeVisita: boolean };

export type ResultadoDaVisita = { ok: true; visitaId: number } | { ok: false; erro: string };

/** O que impede abrir visita no site, ou `null` se pode. Pura. */
export function motivoParaNaoAbrir(site: SiteParaVisita): string | null {
  if (!site.ativo) return `O site ${site.nome} está inativo.`;
  if (!site.recebeVisita) return `O site ${site.nome} está marcado para não receber visitas.`;
  return null;
}

/** UUID cunhado no aparelho, o mesmo formato das rondas. */
export function novoNumeroDeColeta(): string {
  return Crypto.randomUUID();
}

/**
 * Cria a visita com o `numeroColeta` cunhado no toque. Idempotente: se um
 * envio anterior gravou a visita mas a resposta se perdeu na rede, a unique
 * `(numero_coleta, site_id)` (0004) recusa a segunda com 23505 e a visita que
 * ja existe e reaproveitada -- sem isso, o "Finalizar de novo" travaria.
 */
export async function criarVisitaPeloSite(
  site: SiteParaVisita,
  funcionarioId: string,
  numeroColeta: string,
): Promise<ResultadoDaVisita> {
  const motivo = motivoParaNaoAbrir(site);
  if (motivo) return { ok: false, erro: motivo };

  try {
    const { data, error } = await supabase
      .from("visitas")
      .insert({ numero_coleta: numeroColeta, site_id: site.id, funcionario_id: funcionarioId })
      .select("id")
      .single();

    if (error?.code === "23505") return await visitaJaGravada(site.id, numeroColeta);

    // Sem sinal, o supabase-js NAO rejeita: devolve o erro no `error`, com a
    // mensagem do `fetch` ("TypeError: Network request failed"). So o `catch`
    // abaixo deixava o modo aviao cair no "Tente de novo" generico (iPhone,
    // 30/09/2026). Mesmo reconhecimento do `paraOInspetor` da sincronizacao.
    if (error && FALHA_DE_REDE.test(error.message)) return { ok: false, erro: SEM_CONEXAO };

    if (error || !data) {
      return {
        ok: false,
        erro: error?.code === "42501"
          ? "Sua conta não pode registrar visitas."
          : "Não foi possível registrar a visita. Tente de novo.",
      };
    }

    return { ok: true, visitaId: data.id };
  } catch {
    // Rejeicao que escapou do supabase-js: tratada tambem como sem sinal.
    return { ok: false, erro: SEM_CONEXAO };
  }
}

const FALHA_DE_REDE = /network request failed|failed to fetch|fetch failed/i;

const SEM_CONEXAO = "Sem conexão. O checklist precisa de internet para enviar fotos e assinatura.";

async function visitaJaGravada(siteId: number, numeroColeta: string): Promise<ResultadoDaVisita> {
  const { data } = await supabase
    .from("visitas")
    .select("id")
    .eq("numero_coleta", numeroColeta)
    .eq("site_id", siteId)
    .maybeSingle();

  return data ? { ok: true, visitaId: data.id } : { ok: false, erro: "Não foi possível registrar a visita. Tente de novo." };
}
