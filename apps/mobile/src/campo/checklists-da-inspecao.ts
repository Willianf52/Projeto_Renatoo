import type { TipoDeVisita } from "@projeto-renatoo/shared";

import { lerAgendamentos } from "../lib/agendados-e-respondidos";
import { supabase } from "../lib/supabase";
import { lerRascunho, type Rascunho } from "./rascunho";

/**
 * A lista "checklists desta inspecao" da tela da inspecao, com a legenda de
 * cores do app do sistema de referencia: Finalizado, Agendado, Rascunho
 * (comparacao de 17/11/2026, item 5; pedido do dono em 22/11/2026).
 *
 *   - FINALIZADO: os checklists ja enviados nesta visita.
 *   - RASCUNHO: o checklist comecado e nao enviado (guardado no aparelho).
 *   - AGENDADO: os agendamentos de HOJE deste site que ainda nao foram feitos.
 */

export type SituacaoNaInspecao = "FINALIZADO" | "AGENDADO" | "RASCUNHO";

export type ItemDaInspecao = {
  chave: string;
  situacao: SituacaoNaInspecao;
  titulo: string;
  detalhe: string;
  /** So no rascunho: o tipo para continuar de onde parou. */
  tipo?: TipoDeVisita;
};

export const ROTULO_DA_SITUACAO: Record<SituacaoNaInspecao, string> = {
  FINALIZADO: "Finalizado",
  AGENDADO: "Agendado",
  RASCUNHO: "Rascunho",
};

/** Cores da legenda; as de Finalizado e Agendado sao as dos agendamentos. */
export const COR_DA_SITUACAO: Record<SituacaoNaInspecao, { fundo: string; texto: string }> = {
  FINALIZADO: { fundo: "#16a34a", texto: "#ffffff" },
  AGENDADO: { fundo: "#eab308", texto: "#1f2937" },
  RASCUNHO: { fundo: "#64748b", texto: "#ffffff" },
};

/** O rascunho conta quando ha algo respondido: a tela grava um vazio ao abrir. */
export function rascunhoTemConteudo(r: Rascunho | null): r is Rascunho {
  if (!r) return false;
  return (
    r.motivo.trim() !== "" ||
    Object.keys(r.respostas).length > 0 ||
    r.fotos.length > 0 ||
    Object.keys(r.fotosDePergunta).length > 0 ||
    Object.keys(r.observacoes).length > 0
  );
}

/** Corretiva tem motivo; o checklist completo tem modelo e respostas. */
export function tipoDoRascunho(r: Rascunho): TipoDeVisita {
  return r.motivo.trim() !== "" && Object.keys(r.respostas).length === 0 ? "CORRETIVA" : "CONSULTORIA";
}

type Enviado = { id: number; numeroAno: string; modelo: string; hora: string };
type Agendado = { chave: string; modelo: string; agenda: string; finalizado: boolean };

/** Pura: monta a lista na ordem rascunho, finalizados, agendados. */
export function montarItens(entrada: {
  rascunho: Rascunho | null;
  enviados: readonly Enviado[];
  agendados: readonly Agendado[];
}): ItemDaInspecao[] {
  const itens: ItemDaInspecao[] = [];
  if (rascunhoTemConteudo(entrada.rascunho)) {
    const tipo = tipoDoRascunho(entrada.rascunho);
    itens.push({
      chave: "rascunho",
      situacao: "RASCUNHO",
      titulo: tipo === "CORRETIVA" ? "Visita (motivo, foto e assinatura)" : "Checklist completo",
      detalhe: "Começado e não enviado. Toque para continuar.",
      tipo,
    });
  }
  for (const e of entrada.enviados) {
    itens.push({ chave: `enviado-${e.id}`, situacao: "FINALIZADO", titulo: e.modelo, detalhe: `Nº ${e.numeroAno} · ${e.hora}` });
  }
  for (const a of entrada.agendados) {
    if (a.finalizado) continue;
    itens.push({ chave: `agendado-${a.chave}`, situacao: "AGENDADO", titulo: a.modelo, detalhe: `Agenda: ${a.agenda}` });
  }
  return itens;
}

function hora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Le os tres lados. Cada um falha sozinho: sem sinal, o rascunho (do
 * aparelho) continua aparecendo.
 */
export async function lerItensDaInspecao(entrada: {
  visitaId: number | null;
  siteId: number | null;
  funcionarioId: string;
}): Promise<ItemDaInspecao[]> {
  const chaveDoRascunho = entrada.visitaId ?? (entrada.siteId !== null ? -entrada.siteId : null);

  const [rascunho, enviados, agendados] = await Promise.all([
    chaveDoRascunho !== null ? lerRascunho(chaveDoRascunho, entrada.funcionarioId).catch(() => null) : Promise.resolve(null),
    entrada.visitaId !== null
      ? (async (): Promise<Enviado[]> => {
          try {
            const { data } = await supabase
              .from("checklists_visita")
              .select("id, numero, ano, tipo, criado_em, modelos_checklist ( nome )")
              .eq("visita_id", entrada.visitaId!)
              .order("criado_em");
            return (data ?? []).map((c) => ({
              id: c.id,
              numeroAno: `${String(c.numero).padStart(5, "0")}/${c.ano}`,
              modelo: c.modelos_checklist?.nome ?? (c.tipo === "CORRETIVA" ? "Visita corretiva" : "Checklist"),
              hora: hora(c.criado_em),
            }));
          } catch {
            return [];
          }
        })()
      : Promise.resolve([]),
    entrada.siteId !== null
      ? lerAgendamentos("hoje", entrada.siteId)
          .then((r) =>
            r.ok
              ? r.lista.map((a) => ({
                  chave: a.chave,
                  modelo: a.modelo,
                  agenda: a.agenda,
                  finalizado: a.status === "FINALIZADO" || a.status === "FINALIZADO_COM_ATRASO",
                }))
              : [],
          )
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  return montarItens({ rascunho, enviados, agendados });
}
