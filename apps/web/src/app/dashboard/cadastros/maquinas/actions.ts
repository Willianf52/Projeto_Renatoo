"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { ehTipoDeItem, ehTipoDeManutencao, lerQuantidade } from "./regras";

/**
 * Gravacoes das maquinas e dos acessorios e produtos (0111). Quem pode o que
 * mora no RLS: cadastro de maquina e de acessorio com quem administra
 * cadastros; manutencao de maquina com qualquer pessoa ativa que enxergue o
 * site, ate o CLIENTE. Aqui so formato e traducao de erro.
 */

const LISTAGEM = "/dashboard/cadastros/maquinas";
const ACESSORIOS = "/dashboard/cadastros/acessorios-e-produtos";

const esquemaDaMaquina = z.object({
  modelo: z.string().min(1, "Informe o modelo.").max(120, "O modelo deve ter no máximo 120 caracteres."),
  patrimonio: z.string().max(60, "O patrimônio deve ter no máximo 60 caracteres."),
  descricao: z.string().max(500, "A descrição deve ter no máximo 500 caracteres."),
});

export type ValoresDaMaquina = {
  siteId: string;
  modelo: string;
  patrimonio: string;
  descricao: string;
  ativo: boolean;
};

export type EstadoDoFormulario = { erro?: string; valores?: ValoresDaMaquina };

const MENSAGENS_DA_MAQUINA = {
  duplicado: "Já existe uma máquina com esse patrimônio.",
  semPermissao: "Você não tem permissão para cadastrar máquinas.",
  fkInvalida: "O site escolhido não existe mais.",
  generico: "Não foi possível salvar a máquina. Tente novamente.",
};

export async function salvarMaquina(_estado: EstadoDoFormulario, formData: FormData): Promise<EstadoDoFormulario> {
  const valores: ValoresDaMaquina = {
    siteId: texto(formData, "site_id"),
    modelo: texto(formData, "modelo"),
    patrimonio: texto(formData, "patrimonio"),
    descricao: texto(formData, "descricao"),
    ativo: texto(formData, "status") !== "inativo",
  };
  const idBruto = formData.get("id");
  const id = idBruto ? Number(idBruto) : null;
  if (idBruto && !Number.isSafeInteger(id)) return { erro: "Máquina inválida.", valores };

  const siteId = Number(valores.siteId);
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return { erro: "Escolha o site.", valores };

  const validado = esquemaDaMaquina.safeParse(valores);
  if (!validado.success) return { erro: validado.error.issues[0].message, valores };

  const linha = {
    site_id: siteId,
    modelo: validado.data.modelo,
    patrimonio: validado.data.patrimonio,
    descricao: validado.data.descricao,
    ativo: valores.ativo,
  };

  const supabase = await createClient();
  if (id === null) {
    const { error } = await supabase.from("maquinas").insert(linha);
    if (error) return { erro: traduzirErroPostgres(error.code, MENSAGENS_DA_MAQUINA), valores };
  } else {
    const resultado = await supabase.from("maquinas").update(linha).eq("id", id).select("id").maybeSingle();
    const verificacao = verificarEscritaComRls(
      resultado,
      MENSAGENS_DA_MAQUINA,
      "Você não tem permissão para editar esta máquina, ou ela não existe mais.",
    );
    if (!verificacao.ok) return { erro: verificacao.erro, valores };
  }

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}?salvo=1`);
}

export type EstadoDoRegistro = { erro?: string; ok?: string };

export async function registrarManutencaoDeMaquina(
  _estado: EstadoDoRegistro,
  formData: FormData,
): Promise<EstadoDoRegistro> {
  const maquinaId = Number(formData.get("maquina_id"));
  if (!Number.isSafeInteger(maquinaId) || maquinaId <= 0) return { erro: "Máquina inválida." };

  const tipo = texto(formData, "tipo");
  if (!ehTipoDeManutencao(tipo)) return { erro: "Escolha o tipo da manutenção." };

  const data = texto(formData, "data");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data da manutenção." };

  const descricao = texto(formData, "descricao");
  if (descricao.length > 1000) return { erro: "A descrição deve ter no máximo 1000 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.from("maquina_manutencoes").insert({ maquina_id: maquinaId, tipo, data, descricao });
  if (error) {
    return {
      erro: traduzirErroPostgres(error.code, {
        duplicado: "Registro repetido.",
        semPermissao: "Sua conta não pode registrar manutenção desta máquina.",
        fkInvalida: "Esta máquina não existe mais.",
        generico: "Não foi possível registrar. Tente novamente.",
      }),
    };
  }

  revalidatePath(`${LISTAGEM}/${maquinaId}`);
  return { ok: "Manutenção registrada." };
}

// ---------------------------------------------------------------------------
// Acessorios e produtos do site
// ---------------------------------------------------------------------------

export async function adicionarItem(_estado: EstadoDoRegistro, formData: FormData): Promise<EstadoDoRegistro> {
  const siteId = Number(formData.get("site_id"));
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return { erro: "Escolha o site." };

  const tipo = texto(formData, "tipo");
  if (!ehTipoDeItem(tipo)) return { erro: "Escolha se é acessório ou produto." };

  const nome = texto(formData, "nome");
  if (nome === "" || nome.length > 120) return { erro: "Informe o nome (até 120 caracteres)." };

  const quantidade = lerQuantidade(texto(formData, "quantidade") || "1");
  if (quantidade === null) return { erro: "Quantidade inválida." };

  const observacao = texto(formData, "observacao");
  if (observacao.length > 500) return { erro: "A observação deve ter no máximo 500 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.from("site_itens").insert({ site_id: siteId, tipo, nome, quantidade, observacao });
  if (error) {
    return {
      erro: traduzirErroPostgres(error.code, {
        duplicado: "Item repetido.",
        semPermissao: "Você não tem permissão para cadastrar acessórios e produtos.",
        fkInvalida: "Este site não existe mais.",
        generico: "Não foi possível salvar. Tente novamente.",
      }),
    };
  }

  revalidatePath(ACESSORIOS);
  return { ok: "Item adicionado." };
}

export async function excluirItem(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return;
  const supabase = await createClient();
  // Barrado pelo RLS, apaga zero linhas: a lista simplesmente nao muda.
  await supabase.from("site_itens").delete().eq("id", id);
  revalidatePath(ACESSORIOS);
}
