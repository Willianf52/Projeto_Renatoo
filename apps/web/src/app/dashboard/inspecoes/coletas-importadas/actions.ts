"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { idNaUrl } from "@/lib/id-na-url";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { lerCadastroManual } from "./cadastro-manual";

const LISTAGEM = "/dashboard/inspecoes/coletas-importadas";

export type EstadoDaColeta = { erro?: string };

/** Campos do cadastro manual, devolvidos no erro para o formulario nao voltar
 * em branco -- mesmo arranjo de `grupo-de-sites/actions.ts`. */
const CAMPOS_DO_CADASTRO = [
  "data",
  "hora",
  "coletor_dados_id",
  "funcionario_id",
  "site_id",
  "area_id",
  "evento_id",
  "acao_id",
  "qualificador_id",
  "quantidade",
] as const;

export type ValoresDoCadastro = Partial<Record<(typeof CAMPOS_DO_CADASTRO)[number], string>>;

export type EstadoDoCadastro = { erro?: string; valores?: ValoresDoCadastro };

function valoresDe(formData: FormData): ValoresDoCadastro {
  return Object.fromEntries(
    CAMPOS_DO_CADASTRO.map((campo) => [campo, String(formData.get(campo) ?? "")]),
  ) as ValoresDoCadastro;
}

/**
 * Cadastro manual de coletas (migration 0067). Quem decide e o banco -- as
 * policies de INSERT so deixam o GESTOR gravar em nome de outro funcionario
 * --; a checagem de cargo aqui so poupa a viagem e da a mensagem certa.
 *
 * Volta para a listagem filtrada no dia da coleta: a tela so lista com
 * periodo fechado, e sem isto as coletas recem-cadastradas nao apareceriam.
 */
export async function cadastrarColetas(
  _estado: EstadoDoCadastro,
  formData: FormData,
): Promise<EstadoDoCadastro> {
  const valores = valoresDe(formData);
  const lido = lerCadastroManual(formData);
  if (!lido.ok) return { erro: lido.erro, valores };
  const dados = lido.dados;

  if (!(await podeAdministrarUsuarios())) {
    return { erro: "Sua conta não pode cadastrar coletas.", valores };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cadastrar_coletas_manuais", {
    p_site_id: dados.siteId,
    p_funcionario_id: dados.funcionarioId,
    p_data_hora: dados.dataHora,
    p_quantidade: dados.quantidade,
    p_coletor_dados_id: dados.coletorDadosId ?? undefined,
    p_area_id: dados.areaId ?? undefined,
    p_evento_id: dados.eventoId ?? undefined,
    p_acao_id: dados.acaoId ?? undefined,
    p_qualificador_id: dados.qualificadorId ?? undefined,
  });

  if (error) {
    // 22008: fora da janela de 30 dias (0054/0067). 23503: local, funcionario
    // ou cadastro auxiliar que nao existe mais. 42501: o RLS negou.
    if (error.code === "22008") {
      return { erro: "A data da coleta deve ficar entre os últimos 30 dias e agora.", valores };
    }
    if (error.code === "23503") {
      return { erro: "Um dos itens escolhidos não existe mais. Atualize a página e tente de novo.", valores };
    }
    if (error.code === "42501") return { erro: "Sua conta não pode cadastrar coletas.", valores };
    erro(gerarIdDeRequisicao(), "Falha ao cadastrar coletas manuais:", error.message);
    return { erro: "Não foi possível cadastrar as coletas. Tente de novo.", valores };
  }

  revalidatePath(LISTAGEM);
  const destino = new URLSearchParams({ data_inicial: dados.data, data_final: dados.data, salvo: "1" });
  redirect(`${LISTAGEM}?${destino.toString()}`);
}

/**
 * Exclui uma coleta (uma linha da tabela). So GESTOR, pela policy da 0067; o
 * trigger recusa coleta de visita com checklist (23514) e apaga a visita que
 * ficar vazia. Volta para a mesma listagem filtrada, com o aviso.
 */
export async function excluirColeta(_estado: EstadoDaColeta, formData: FormData): Promise<EstadoDaColeta> {
  const id = idNaUrl(String(formData.get("leitura_id") ?? ""));
  if (id === null) return { erro: "Coleta inválida." };

  if (!(await podeAdministrarUsuarios())) {
    return { erro: "Sua conta não pode excluir coletas." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("leituras").delete().eq("id", id).select("id");

  if (error) {
    if (error.code === "23514") {
      return {
        erro: "Esta coleta é de uma visita com checklist enviado. Exclua o checklist no Histórico de Checklist.",
      };
    }
    erro(gerarIdDeRequisicao(), "Falha ao excluir a coleta:", error.message);
    return { erro: "Não foi possível excluir a coleta. Tente de novo." };
  }
  if (!data?.length) return { erro: "Coleta não encontrada. Ela pode já ter sido excluída." };

  // Relido por `URLSearchParams`: o campo vem do formulario e so pode virar
  // querystring, nunca caminho.
  const filtros = new URLSearchParams(String(formData.get("filtros") ?? ""));
  filtros.delete("salvo");
  filtros.set("excluido", "1");

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}?${filtros.toString()}`);
}
