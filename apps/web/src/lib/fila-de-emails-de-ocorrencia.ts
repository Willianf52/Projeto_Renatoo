import "server-only";

import { montarEmailDeOcorrencia, type Motivo } from "@/lib/emails-de-ocorrencia";
import { erro } from "@/lib/log";
import { configuracaoDoRemetente, enviarEmailDeOcorrencia } from "@/lib/resend";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** A Resend aceita 2 envios por segundo no plano atual. */
const INTERVALO_MS = 600;
/** Lote por chamada: ~12 s de envio, longe do limite da funcao. */
const LOTE = 20;
const TENTATIVAS = 3;

const espera = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

export type ResultadoDaFila = { enviados: number; falhas: number };

/**
 * Esvazia (um lote d)a fila `ocorrencia_emails` (migration 0065): reserva no
 * banco, monta cada mensagem e envia pela Resend, marcando ENVIADO ou, na
 * falha, devolvendo a fila ate a terceira tentativa. Chamado pelo aviso do
 * banco (`/api/webhooks/ocorrencia-emails`) e pelo cron diario, que recolhe o
 * que o aviso perdeu.
 *
 * `origem`: o endereco publico do portal, para o link do e-mail.
 * Nunca registra endereco de e-mail em log -- so ids.
 */
export async function processarFilaDeEmails(
  admin: Admin,
  origem: string,
  idRequisicao: string,
): Promise<ResultadoDaFila> {
  const { remetente, somente } = configuracaoDoRemetente();
  // Modo de teste sem o dono da conta configurado: nada pode ser entregue.
  if (somente && somente.length === 0) return { enviados: 0, falhas: 0 };

  const { data: lote, error } = await admin.rpc("reservar_emails_de_ocorrencia", {
    p_limite: LOTE,
    p_somente: somente ?? undefined,
  });
  if (error) {
    erro(idRequisicao, "Fila de e-mails de ocorrência: falha ao reservar o lote.", error);
    return { enviados: 0, falhas: 0 };
  }
  if (!lote?.length) return { enviados: 0, falhas: 0 };

  const ocorrenciaIds = [...new Set(lote.map((l) => l.ocorrencia_id))];
  const andamentoIds = [...new Set(lote.map((l) => l.andamento_id).filter((id): id is number => id !== null))];

  const [ocorrencias, andamentos] = await Promise.all([
    admin
      .from("ocorrencias")
      .select("id, numero, ano, criado_em, pergunta_texto, resposta, observacao, eventos ( nome ), sites ( nome )")
      .in("id", ocorrenciaIds),
    andamentoIds.length
      ? admin.from("ocorrencia_andamentos").select("id, texto").in("id", andamentoIds)
      : Promise.resolve({ data: [] as { id: number; texto: string }[], error: null }),
  ]);
  if (ocorrencias.error || andamentos.error) {
    erro(idRequisicao, "Fila de e-mails de ocorrência: falha ao ler as ocorrências do lote.", ocorrencias.error ?? andamentos.error);
    // Ficam ENVIANDO; a proxima reserva devolve a fila depois de 10 minutos.
    return { enviados: 0, falhas: 0 };
  }

  const porOcorrencia = new Map((ocorrencias.data ?? []).map((o) => [o.id, o]));
  const textoDoAndamento = new Map((andamentos.data ?? []).map((a) => [a.id, a.texto]));

  let enviados = 0;
  let falhas = 0;

  for (const [i, linha] of lote.entries()) {
    if (i > 0) await espera(INTERVALO_MS);

    const o = porOcorrencia.get(linha.ocorrencia_id);
    try {
      if (!o) throw new Error("ocorrência não encontrada");
      const { assunto, texto } = montarEmailDeOcorrencia({
        motivo: linha.motivo as Motivo,
        numero: o.numero,
        ano: o.ano,
        evento: o.eventos?.nome ?? "Evento",
        site: o.sites?.nome ?? "Site",
        abertaEm: o.criado_em,
        pergunta: o.pergunta_texto,
        resposta: o.resposta,
        observacao: o.observacao,
        textoDoAndamento: linha.andamento_id === null ? null : (textoDoAndamento.get(linha.andamento_id) ?? null),
        link: `${origem}/dashboard/eventos/painel-de-eventos/${o.id}`,
      });

      const idExterno = await enviarEmailDeOcorrencia({
        remetente,
        para: linha.destinatario,
        assunto,
        texto,
        chave: `ocorrencia-email-${linha.id}`,
      });

      await admin
        .from("ocorrencia_emails")
        .update({ status: "ENVIADO", enviado_em: new Date().toISOString(), id_externo: idExterno, erro: null })
        .eq("id", linha.id);
      enviados += 1;
    } catch (falha) {
      falhas += 1;
      const mensagem = falha instanceof Error ? falha.message : String(falha);
      const { data: atual } = await admin.from("ocorrencia_emails").select("tentativas").eq("id", linha.id).maybeSingle();
      await admin
        .from("ocorrencia_emails")
        .update({
          status: (atual?.tentativas ?? TENTATIVAS) >= TENTATIVAS ? "FALHOU" : "PENDENTE",
          erro: mensagem.slice(0, 500),
        })
        .eq("id", linha.id);
      erro(idRequisicao, `Fila de e-mails de ocorrência: falha no envio da linha ${linha.id}.`, mensagem);
    }
  }

  return { enviados, falhas };
}
