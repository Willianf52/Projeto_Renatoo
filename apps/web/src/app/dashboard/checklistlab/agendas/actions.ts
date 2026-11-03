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

export type EstadoDoEncerramento = { erro?: string };

/**
 * "Exclusão de Agendamentos" do sistema de referencia: os agendamentos a
 * partir da data escolhida deixam de existir e a agenda fica inativa. Aqui os
 * agendamentos saem da recorrencia (0084), entao basta encerrar a agenda na
 * vespera da data; os checklists ja feitos ficam, porque sao do campo.
 */
export async function encerrarAgenda(_estado: EstadoDoEncerramento, formData: FormData): Promise<EstadoDoEncerramento> {
  const id = texto(formData, "id");
  const data = texto(formData, "data");
  if (!ID.test(id)) return { erro: "Agenda inválida." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(`${data}T12:00:00Z`))) {
    return { erro: "Escolha a data a partir da qual os agendamentos saem." };
  }

  const supabase = await createClient();
  const { data: agenda } = await supabase.from("agendas").select("data_inicial").eq("id", Number(id)).maybeSingle();
  if (!agenda) return { erro: "Agenda não encontrada ou sem permissão." };

  // A vespera da data; antes do inicio, a agenda fica so com o primeiro dia
  // (o CHECK da 0084 nao aceita fim antes do inicio) -- e inativa, nao gera nada.
  const vespera = new Date(Date.parse(`${data}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const fim = vespera < agenda.data_inicial ? agenda.data_inicial : vespera;

  const { data: alterada, error } = await supabase
    .from("agendas")
    .update({ data_final: fim, ativo: false })
    .eq("id", Number(id))
    .select("id")
    .maybeSingle();
  if (error || !alterada) {
    if (error) registrarErro(gerarIdDeRequisicao(), "Criar Agenda: falha ao encerrar:", error);
    return { erro: "Não foi possível excluir os agendamentos. Tente de novo." };
  }

  revalidatePath(LISTAGEM);
  revalidatePath(AGENDAMENTOS);
  redirect(`${LISTAGEM}?salvo=1`);
}
