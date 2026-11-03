"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { texto } from "@/lib/form-data";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { AGENDAMENTOS, LISTAGEM, validarAgenda, type ValoresDaAgenda } from "./regras";

export type EstadoDoFormulario = { erro?: string; valores?: ValoresDaAgenda };

const ID = /^[1-9]\d{0,17}$/;

const MENSAGENS_DE_ERRO = {
  duplicado: "Já existe uma agenda igual a esta.",
  semPermissao: "Somente quem administra cadastros cria agendas.",
  fkInvalida: "O checklist, um site ou o responsável deixou de existir. Recarregue a página.",
  generico: "Não foi possível salvar a agenda. Tente novamente.",
};

function extrairValores(formData: FormData): ValoresDaAgenda {
  return {
    nome: texto(formData, "nome"),
    modeloId: texto(formData, "modelo_id"),
    responsavelId: texto(formData, "responsavel_id"),
    grupoUsuarioId: texto(formData, "grupo_usuario_id"),
    dataInicial: texto(formData, "data_inicial"),
    dataFinal: texto(formData, "data_final"),
    recorrencia: texto(formData, "recorrencia"),
    toleranciaDias: texto(formData, "tolerancia_dias"),
    ativo: texto(formData, "status") !== "inativo",
    sites: formData.getAll("sites").map(String).filter(Boolean),
  };
}

/** Agenda e sites numa transacao so (`salvar_agenda`, 0084). */
export async function salvarAgenda(_estado: EstadoDoFormulario, formData: FormData): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);
  const idBruto = texto(formData, "id");
  if (idBruto && !ID.test(idBruto)) return { erro: "Registro inválido.", valores };

  const validado = validarAgenda(valores);
  if (!validado.ok) return { erro: validado.erro, valores };
  const a = validado.agenda;

  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_agenda", {
    // O tipo gerado nao marca os parametros que aceitam nulo; a funcao aceita.
    p_id: (idBruto ? Number(idBruto) : null) as number,
    p_nome: a.nome,
    p_modelo_id: a.modeloId,
    p_responsavel_id: a.responsavelId as string,
    p_grupo_usuario_id: a.grupoUsuarioId as number,
    p_data_inicial: a.dataInicial,
    p_data_final: a.dataFinal,
    p_recorrencia: a.recorrencia,
    p_tolerancia_dias: a.toleranciaDias,
    p_ativo: a.ativo,
    p_sites: a.sites,
  });

  if (error) {
    if (error.code === "22023") return { erro: error.message, valores };
    if (!["42501", "23503"].includes(error.code)) {
      registrarErro(gerarIdDeRequisicao(), "Criar Agenda: falha ao salvar:", error);
    }
    return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO), valores };
  }

  revalidatePath(LISTAGEM);
  revalidatePath(AGENDAMENTOS);
  redirect(`${LISTAGEM}?salvo=1`);
}

/**
 * "Exclusão Física da Agenda", como no antigo. Os agendamentos nao sao
 * gravados (saem da recorrencia), entao some tudo junto; os checklists ja
 * feitos ficam, porque sao do campo e nao da agenda.
 */
export async function excluirAgenda(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  if (!ID.test(id)) redirect(LISTAGEM);

  const supabase = await createClient();
  const { error } = await supabase.from("agendas").delete().eq("id", Number(id));
  if (error) registrarErro(gerarIdDeRequisicao(), "Criar Agenda: falha ao excluir:", error);

  revalidatePath(LISTAGEM);
  revalidatePath(AGENDAMENTOS);
  redirect(`${LISTAGEM}?excluido=1`);
}
