"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { podeVerTodaAOperacao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { lerConfiguracaoDoCliente } from "@/lib/configuracao-do-cliente";
import { erroDoMinimoDeTexto, lerAndamento, lerEnvio, STATUS_ENCERRADOS } from "./andamentos";
import { STATUS } from "./status";

const PAINEL = "/dashboard/eventos/painel-de-eventos";

export type EstadoDoAndamento = { erro?: string };

/**
 * Analisa ou finaliza uma ocorrencia (migration 0064).
 *
 * OS ANEXOS NAO PASSAM POR AQUI. A Vercel limita o corpo de uma funcao a
 * 4,5 MB, e o sistema de referencia aceita arquivo de ate 10 MB: o navegador
 * envia os arquivos direto ao Storage, com a sessao da pessoa (a policy do
 * bucket `ocorrencias` confere o cargo e a pasta), e so os CAMINHOS chegam
 * nesta action, que os confere de novo -- o POST pode ser montado a mao.
 *
 * Quem pode e o banco que decide (`registrar_andamento_da_ocorrencia` e as
 * policies da 0064); a checagem de cargo aqui so poupa a viagem e da a
 * mensagem certa. Falha de leitura de permissao nega.
 */
export async function registrarAndamento(
  _estado: EstadoDoAndamento,
  formData: FormData,
): Promise<EstadoDoAndamento> {
  const lido = lerAndamento(formData);
  if (!lido.ok) return { erro: lido.erro };
  const dados = lido.dados;

  if (!(await podeVerTodaAOperacao())) {
    return { erro: "Sua conta não pode analisar nem finalizar ocorrências." };
  }

  const supabase = await createClient();
  const minimo = erroDoMinimoDeTexto(dados.tipo, dados.texto, await lerConfiguracaoDoCliente(supabase));
  if (minimo) return { erro: minimo };
  const { error } = await supabase.rpc("registrar_andamento_da_ocorrencia", {
    p_ocorrencia_id: dados.ocorrenciaId,
    p_tipo: dados.tipo,
    p_tipo_analise_id: dados.tipoAnaliseId,
    p_texto: dados.texto,
    p_classificacao_id: dados.classificacaoId ?? undefined,
    p_responsavel_id: dados.responsavelId ?? undefined,
    p_grupo_usuario_id: dados.grupoUsuarioId ?? undefined,
    p_apoio: dados.apoio,
    p_avisar: dados.avisar,
    p_emails_externos: dados.emailsExternos,
    p_arquivos: dados.arquivos,
  });

  if (error) {
    const idRequisicao = gerarIdDeRequisicao();
    // 23514: o trigger recusou (ocorrencia ja encerrada) ou um check falhou.
    // 42501: o RLS negou. Nenhum dos dois e falha do servidor.
    if (error.code === "23514") {
      return { erro: "Esta ocorrência já foi encerrada. Atualize a página." };
    }
    if (error.code === "42501") {
      return { erro: "Sem permissão para registrar nesta ocorrência." };
    }
    erro(idRequisicao, "Falha ao registrar andamento da ocorrência:", error.message);
    return { erro: "Não foi possível salvar. Tente de novo." };
  }

  revalidatePath(PAINEL);
  revalidatePath(`${PAINEL}/${dados.ocorrenciaId}`);
  redirect(`${PAINEL}/${dados.ocorrenciaId}?salvo=1`);
}

export type EstadoDoEnvio = { erro?: string };

/**
 * "Enviar Evento" (migration 0081): enfileira o evento para o e-mail das
 * pessoas escolhidas; a fila da 0065 entrega. Quem pode e o banco que decide
 * (`enviar_ocorrencia_por_email`), como no andamento.
 */
export async function enviarEventoPorEmail(_estado: EstadoDoEnvio, formData: FormData): Promise<EstadoDoEnvio> {
  const lido = lerEnvio(formData);
  if (!lido.ok) return { erro: lido.erro };
  const { ocorrenciaId, destinatarios } = lido.dados;

  if (!(await podeVerTodaAOperacao())) {
    return { erro: "Sua conta não pode enviar eventos por e-mail." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("enviar_ocorrencia_por_email", {
    p_ocorrencia_id: ocorrenciaId,
    p_destinatarios: destinatarios,
  });

  if (error) {
    // 22023: a funcao recusou a lista (vazia, grande demais, ninguem com
    // e-mail) e a mensagem dela ja e a certa para a tela.
    if (error.code === "22023") return { erro: error.message };
    if (error.code === "42501") return { erro: "Sem permissão para enviar este evento por e-mail." };
    if (error.code === "P0002") return { erro: "Este evento não existe mais. Atualize a página." };
    erro(gerarIdDeRequisicao(), "Falha ao enviar o evento por e-mail:", error.message);
    return { erro: "Não foi possível enviar. Tente de novo." };
  }

  revalidatePath(`${PAINEL}/${ocorrenciaId}`);
  redirect(`${PAINEL}/${ocorrenciaId}?enviado=1`);
}

/**
 * Arrastar o cartao no Quadro, como no sistema de referencia (0089). A troca
 * vira um andamento com autor e o texto "Status alterado no Quadro", e o
 * trigger aplica `status_novo`: o historico continua mostrando quem mudou e
 * quando. Encerrar (Atendido, Concluido, Nao Realizado, Cancelado) registra
 * como finalizacao.
 */
export async function moverNoQuadro(ocorrenciaId: number, status: string): Promise<{ erro?: string }> {
  const destino = STATUS.find((s) => s.value === status);
  if (!Number.isInteger(ocorrenciaId) || ocorrenciaId <= 0 || !destino) return { erro: "Movimento inválido." };
  if (!(await podeVerTodaAOperacao())) return { erro: "Sua conta não pode mudar o status de ocorrências." };

  const supabase = await createClient();
  const { data: tipo } = await supabase
    .from("tipos_de_analise")
    .select("id")
    .eq("ativo", true)
    .order("id")
    .limit(1)
    .maybeSingle();
  if (!tipo) return { erro: "Cadastre um Tipo de Análise antes de mover os eventos." };

  const encerra = (STATUS_ENCERRADOS as readonly string[]).includes(destino.value);
  const { error } = await supabase.from("ocorrencia_andamentos").insert({
    ocorrencia_id: ocorrenciaId,
    tipo: encerra ? "FINALIZACAO" : "ANALISE",
    tipo_analise_id: tipo.id,
    texto: `Status alterado no Quadro para ${destino.label}.`,
    status_novo: destino.value,
  });
  if (error) {
    if (error.code === "23514") return { erro: "Esta ocorrência já foi encerrada. Atualize a página." };
    if (error.code === "42501") return { erro: "Sem permissão para mudar esta ocorrência." };
    erro(gerarIdDeRequisicao(), "Falha ao mover ocorrência no Quadro:", error.message);
    return { erro: "Não foi possível mudar o status. Tente de novo." };
  }

  revalidatePath(PAINEL);
  revalidatePath(`${PAINEL}/${ocorrenciaId}`);
  return {};
}
