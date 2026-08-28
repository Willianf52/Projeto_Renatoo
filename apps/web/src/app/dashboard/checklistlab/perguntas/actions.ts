"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Cadastro das perguntas do checklist de CONSULTORIA.
 *
 * Escreve com o token da propria pessoa e deixa o RLS decidir -- como
 * `grupo-de-sites` e `site-planta`, e ao contrario de `usuarios`. A migration
 * 0043 registra por que: o texto de uma pergunta nao concede acesso a nada,
 * entao nao ha motivo para `service_role` aqui. A policy
 * `pode_administrar_cadastros()` e o portao de verdade; a checagem nas telas
 * (`novo/page.tsx`, `[id]/editar/page.tsx`) e so para nao deixar alguem
 * preencher um formulario inteiro antes de levar a recusa.
 *
 * Sem action de exclusao, de proposito: `perguntas_checklist` nao tem grant de
 * DELETE (0043), porque apagar pergunta ja respondida apagaria historico de
 * inspecao. Despublicar e o campo Status.
 */

const LISTAGEM = "/dashboard/checklistlab/perguntas";

/**
 * `texto` e `text` no banco, sem restricao de tamanho -- o limite aqui e de
 * aplicacao, como em `grupo-de-sites`: recusa colagem acidental de um texto
 * enorme. 300 e generoso para uma pergunta que precisa caber legivel na tela
 * de um celular segurado em pe.
 *
 * `ordem` e `smallint` no banco. O teto de 9999 nao vem do tipo (smallint vai
 * a 32767) e sim do mesmo raciocinio: uma "ordem" de cinco digitos e erro de
 * digitacao, nao intencao.
 */
const esquemaDaPergunta = z.object({
  texto: z
    .string()
    .min(1, "Informe o texto da pergunta.")
    .max(300, "A pergunta deve ter no máximo 300 caracteres."),
  ordem: z
    .number({ error: "Informe a ordem da pergunta." })
    .int("A ordem deve ser um número inteiro.")
    .min(1, "A ordem deve ser maior que zero.")
    .max(9999, "A ordem deve ser no máximo 9999."),
});

export type ValoresDaPergunta = {
  texto: string;
  /** Em texto, pre-validacao -- o campo do formulario devolve string. */
  ordem: string;
  ativo: boolean;
};

export type EstadoDoFormulario = {
  erro?: string;
  /** Devolvido para o formulario nao perder o que a pessoa digitou. */
  valores?: ValoresDaPergunta;
};

function extrairValores(formData: FormData): ValoresDaPergunta {
  return {
    texto: texto(formData, "texto"),
    ordem: texto(formData, "ordem"),
    // Mesmo select de duas opcoes de `grupo-de-sites`: qualquer coisa
    // diferente de "inativo" cai no lado seguro para um cadastro novo.
    ativo: String(formData.get("status") ?? "") !== "inativo",
  };
}

type LinhaDaPergunta = { texto: string; ordem: number; ativo: boolean };

function validar(
  valores: ValoresDaPergunta,
): { ok: true; linha: LinhaDaPergunta } | { ok: false; erro: string } {
  // `Number("")` e 0 e `Number("abc")` e NaN -- os dois sao recusados pelo
  // `.int()`/`.min(1)` do schema, entao nao ha checagem imperativa antes.
  const validado = esquemaDaPergunta.safeParse({
    texto: valores.texto,
    ordem: valores.ordem === "" ? Number.NaN : Number(valores.ordem),
  });

  if (!validado.success) return { ok: false, erro: validado.error.issues[0].message };

  return {
    ok: true,
    linha: { texto: validado.data.texto, ordem: validado.data.ordem, ativo: valores.ativo },
  };
}

/** `ordem` e unique (constraint `perguntas_checklist_ordem_unica`, 0042). */
const MENSAGENS_DE_ERRO = {
  duplicado: "Já existe uma pergunta nessa ordem. Escolha outro número.",
  semPermissao: "Você não tem permissão para cadastrar perguntas do checklist.",
  generico: "Não foi possível salvar a pergunta. Tente novamente.",
};

export async function salvarPergunta(
  _estado: EstadoDoFormulario,
  formData: FormData,
): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);

  const idBruto = formData.get("id");
  const id = idBruto ? Number(idBruto) : null;
  if (idBruto && !Number.isInteger(id)) {
    return { erro: "Registro inválido.", valores };
  }

  const validacao = validar(valores);
  if (!validacao.ok) return { erro: validacao.erro, valores };

  const supabase = await createClient();

  if (id === null) {
    const { error } = await supabase.from("perguntas_checklist").insert(validacao.linha);
    if (error) return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO), valores };
  } else {
    // Ver `lib/escrita-rls.ts`: um UPDATE barrado pelo RLS nao devolve erro,
    // devolve zero linhas alteradas.
    const resultado = await supabase
      .from("perguntas_checklist")
      .update(validacao.linha)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    const verificacao = verificarEscritaComRls(
      resultado,
      MENSAGENS_DE_ERRO,
      "Você não tem permissão para editar esta pergunta, ou ela não existe mais.",
    );
    if (!verificacao.ok) return { erro: verificacao.erro, valores };
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}
