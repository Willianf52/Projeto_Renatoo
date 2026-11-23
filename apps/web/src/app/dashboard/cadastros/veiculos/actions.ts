"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { lerKm, normalizarPlaca, TIPOS_DE_MANUTENCAO } from "./regras";

/**
 * Gravacoes do cadastro de veiculos (0104). Quem pode o que mora no RLS:
 * cadastro e edicao so para quem administra cadastros; km e manutencao para
 * qualquer pessoa da UP. Aqui so validacao de formato e traducao de erro.
 */

const LISTAGEM = "/dashboard/cadastros/veiculos";

const esquemaDoVeiculo = z.object({
  modelo: z.string().min(1, "Informe o modelo.").max(80, "O modelo deve ter no máximo 80 caracteres."),
  cor: z.string().max(40, "A cor deve ter no máximo 40 caracteres."),
  empresa: z.string().max(120, "A empresa deve ter no máximo 120 caracteres."),
});

export type ValoresDoVeiculo = {
  placa: string;
  modelo: string;
  cor: string;
  empresa: string;
  kmUltimaRevisao: string;
  ativo: boolean;
};

export type EstadoDoFormulario = { erro?: string; valores?: ValoresDoVeiculo };

const MENSAGENS_DO_VEICULO = {
  duplicado: "Já existe um veículo com essa placa.",
  semPermissao: "Você não tem permissão para cadastrar veículos.",
  fkInvalida: "O usuário escolhido não existe mais.",
  generico: "Não foi possível salvar o veículo. Tente novamente.",
};

function extrairValores(formData: FormData): ValoresDoVeiculo {
  return {
    placa: texto(formData, "placa"),
    modelo: texto(formData, "modelo"),
    cor: texto(formData, "cor"),
    empresa: texto(formData, "empresa"),
    kmUltimaRevisao: texto(formData, "km_ultima_revisao"),
    ativo: texto(formData, "status") !== "inativo",
  };
}

export async function salvarVeiculo(_estado: EstadoDoFormulario, formData: FormData): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);
  const idBruto = formData.get("id");
  const id = idBruto ? Number(idBruto) : null;
  if (idBruto && !Number.isSafeInteger(id)) return { erro: "Veículo inválido.", valores };

  const placa = normalizarPlaca(valores.placa);
  if (!placa) return { erro: "Placa inválida. Use o formato ABC-1234 ou ABC-1D23.", valores };

  const validado = esquemaDoVeiculo.safeParse(valores);
  if (!validado.success) return { erro: validado.error.issues[0].message, valores };

  const kmUltimaRevisao = valores.kmUltimaRevisao === "" ? 0 : lerKm(valores.kmUltimaRevisao);
  if (kmUltimaRevisao === null) return { erro: "Km da última revisão inválido.", valores };

  // Sem "usuario do veiculo": decisao do dono (22/11/2026), o carro nao e de
  // uma pessoa especifica; no app, quem abre escolhe o carro do dia. A coluna
  // `usuario_id` segue no banco (0104), vazia, e o portal nao a mexe mais.
  const linha = {
    placa,
    modelo: validado.data.modelo,
    cor: validado.data.cor,
    empresa: validado.data.empresa,
    km_ultima_revisao: kmUltimaRevisao,
    ativo: valores.ativo,
  };

  const supabase = await createClient();
  if (id === null) {
    const { error } = await supabase.from("veiculos").insert(linha);
    if (error) return { erro: traduzirErroPostgres(error.code, MENSAGENS_DO_VEICULO), valores };
  } else {
    const resultado = await supabase.from("veiculos").update(linha).eq("id", id).select("id").maybeSingle();
    const verificacao = verificarEscritaComRls(
      resultado,
      MENSAGENS_DO_VEICULO,
      "Você não tem permissão para editar este veículo, ou ele não existe mais.",
    );
    if (!verificacao.ok) return { erro: verificacao.erro, valores };
  }

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}?salvo=1`);
}

// ---------------------------------------------------------------------------
// Km e manutencao (pagina do veiculo)
// ---------------------------------------------------------------------------

export type EstadoDoRegistro = { erro?: string; ok?: string };

const MENSAGENS_DO_REGISTRO = {
  duplicado: "Registro repetido.",
  semPermissao: "Sua conta não pode registrar km ou manutenção de veículo.",
  fkInvalida: "Este veículo não existe mais.",
  generico: "Não foi possível registrar. Tente novamente.",
};

function idDoVeiculo(formData: FormData): number | null {
  const id = Number(formData.get("veiculo_id"));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function registrarKm(_estado: EstadoDoRegistro, formData: FormData): Promise<EstadoDoRegistro> {
  const veiculoId = idDoVeiculo(formData);
  if (veiculoId === null) return { erro: "Veículo inválido." };
  const km = lerKm(texto(formData, "km"));
  if (km === null) return { erro: "Informe o km do painel, só números." };

  const supabase = await createClient();
  const { error } = await supabase.from("veiculo_km").insert({ veiculo_id: veiculoId, km });
  if (error) {
    // 22023: o banco recusa km menor que o ultimo (0104).
    if (error.code === "22023") return { erro: "O km informado é menor que o último registrado." };
    return { erro: traduzirErroPostgres(error.code, MENSAGENS_DO_REGISTRO) };
  }

  revalidatePath(`${LISTAGEM}/${veiculoId}`);
  revalidatePath(LISTAGEM);
  return { ok: "Km registrado." };
}

const TIPOS = new Set<string>(TIPOS_DE_MANUTENCAO.map((t) => t.value));

export async function registrarManutencao(_estado: EstadoDoRegistro, formData: FormData): Promise<EstadoDoRegistro> {
  const veiculoId = idDoVeiculo(formData);
  if (veiculoId === null) return { erro: "Veículo inválido." };

  const tipo = texto(formData, "tipo");
  if (!TIPOS.has(tipo)) return { erro: "Escolha o tipo da manutenção." };

  const data = texto(formData, "data");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data da manutenção." };

  const kmTexto = texto(formData, "km");
  const km = kmTexto === "" ? null : lerKm(kmTexto);
  if (kmTexto !== "" && km === null) return { erro: "Km inválido." };
  if (tipo === "REVISAO" && km === null) return { erro: "Na revisão, informe o km: é dele que conta a próxima." };

  const descricao = texto(formData, "descricao");
  if (descricao.length > 1000) return { erro: "A descrição deve ter no máximo 1000 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("veiculo_manutencoes")
    .insert({ veiculo_id: veiculoId, tipo, data, km, descricao });
  if (error) return { erro: traduzirErroPostgres(error.code, MENSAGENS_DO_REGISTRO) };

  revalidatePath(`${LISTAGEM}/${veiculoId}`);
  revalidatePath(LISTAGEM);
  return { ok: "Manutenção registrada." };
}
