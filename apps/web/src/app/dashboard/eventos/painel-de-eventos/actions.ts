"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { podeVerTodaAOperacao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { lerAndamento } from "./andamentos";

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
