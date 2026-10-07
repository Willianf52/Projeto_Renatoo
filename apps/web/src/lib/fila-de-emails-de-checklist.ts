import "server-only";

import { notaDoChecklist, tipoDeResposta, type RespostaDoChecklist } from "@projeto-renatoo/shared";
import { montarEmailDeChecklist } from "@/lib/emails-de-checklist";
import type { ResultadoDaFila } from "@/lib/fila-de-emails-de-ocorrencia";
import { erro } from "@/lib/log";
import { configuracaoDoRemetente, enviarEmailDeOcorrencia } from "@/lib/resend";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** Os mesmos limites da fila das ocorrencias: a Resend aceita 2 envios/s. */
const INTERVALO_MS = 600;
const LOTE = 20;
const TENTATIVAS = 3;

const espera = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

type ChecklistDoEmail = {
  id: number;
  tipo: string;
  motivo: string | null;
  criado_em: string;
  modelos_checklist: { nome: string } | null;
  visitas: { sites: { nome: string } | null; profiles: { nome_completo: string | null } | null } | null;
  checklist_respostas: { resposta: string; perguntas_checklist: { tipo_resposta: string } | null }[];
};

/** "Nao conforme" e nota, pela mesma regra do Historico (`montarLinha`). */
export function resumoDasRespostas(respostas: ChecklistDoEmail["checklist_respostas"]): {
  naoConformidades: number;
  nota: number | null;
} {
  const comTipo = respostas
    .filter((r): r is typeof r & { resposta: RespostaDoChecklist } => ["SIM", "NAO", "NA"].includes(r.resposta))
    .map((r) => ({ tipo: tipoDeResposta(r.perguntas_checklist?.tipo_resposta), resposta: r.resposta }));

  return {
    naoConformidades: comTipo.filter((r) => r.tipo !== "SN" && r.resposta === "NAO").length,
    nota: notaDoChecklist(comTipo),
  };
}

/**
 * Esvazia (um lote d)a fila `checklist_emails` (migration 0068): o aviso ao
 * superior de quem enviou o checklist. Mesmo caminho da fila das ocorrencias
 * (`fila-de-emails-de-ocorrencia.ts`), chamado pela mesma rota e pelo mesmo
 * cron. Nunca registra endereco de e-mail em log -- so ids.
 */
export async function processarFilaDeEmailsDeChecklist(
  admin: Admin,
  origem: string,
  idRequisicao: string,
): Promise<ResultadoDaFila> {
  const { remetente, somente } = configuracaoDoRemetente();
  if (somente && somente.length === 0) return { enviados: 0, falhas: 0 };

  const { data: lote, error } = await admin.rpc("reservar_emails_de_checklist", {
    p_limite: LOTE,
    p_somente: somente ?? undefined,
  });
  if (error) {
    erro(idRequisicao, "Fila de e-mails de checklist: falha ao reservar o lote.", error);
    return { enviados: 0, falhas: 0 };
  }
  if (!lote?.length) return { enviados: 0, falhas: 0 };

  const { data: checklists, error: erroDeLeitura } = await admin
    .from("checklists_visita")
    .select(
      `id, tipo, motivo, criado_em,
       modelos_checklist ( nome ),
       visitas ( sites ( nome ), profiles ( nome_completo ) ),
       checklist_respostas ( resposta, perguntas_checklist ( tipo_resposta ) )`,
    )
    .in("id", [...new Set(lote.map((l) => l.checklist_id))]);
  if (erroDeLeitura) {
    erro(idRequisicao, "Fila de e-mails de checklist: falha ao ler os checklists do lote.", erroDeLeitura);
    // Ficam ENVIANDO; a proxima reserva devolve a fila depois de 10 minutos.
    return { enviados: 0, falhas: 0 };
  }

  const porId = new Map(((checklists ?? []) as unknown as ChecklistDoEmail[]).map((c) => [c.id, c]));

  let enviados = 0;
  let falhas = 0;

  for (const [i, linha] of lote.entries()) {
    if (i > 0) await espera(INTERVALO_MS);

    const c = porId.get(linha.checklist_id);
    try {
      if (!c) throw new Error("checklist não encontrado");
      const { assunto, texto } = montarEmailDeChecklist({
        tipo: c.tipo,
        modelo: c.modelos_checklist?.nome ?? null,
        site: c.visitas?.sites?.nome ?? "Site",
        funcionario: c.visitas?.profiles?.nome_completo ?? "Funcionário",
        enviadoEm: c.criado_em,
        motivo: c.motivo,
        link: `${origem}/dashboard/checklistlab/historico-de-checklist/${c.id}`,
        ...resumoDasRespostas(c.checklist_respostas ?? []),
      });

      const idExterno = await enviarEmailDeOcorrencia({
        remetente,
        para: linha.destinatario,
        assunto,
        texto,
        chave: `checklist-email-${linha.id}`,
      });

      await admin
        .from("checklist_emails")
        .update({ status: "ENVIADO", enviado_em: new Date().toISOString(), id_externo: idExterno, erro: null })
        .eq("id", linha.id);
      enviados += 1;
    } catch (falha) {
      falhas += 1;
      const mensagem = falha instanceof Error ? falha.message : String(falha);
      const { data: atual } = await admin.from("checklist_emails").select("tentativas").eq("id", linha.id).maybeSingle();
      await admin
        .from("checklist_emails")
        .update({
          status: (atual?.tentativas ?? TENTATIVAS) >= TENTATIVAS ? "FALHOU" : "PENDENTE",
          erro: mensagem.slice(0, 500),
        })
        .eq("id", linha.id);
      erro(idRequisicao, `Fila de e-mails de checklist: falha no envio da linha ${linha.id}.`, mensagem);
    }
  }

  return { enviados, falhas };
}
