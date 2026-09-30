"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TIPOS_DE_RESPOSTA, type TipoDeResposta } from "@projeto-renatoo/shared";
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
 *
 * Desde a 0061 toda pergunta pertence a um MODELO e tem um TIPO de resposta.
 * Os dois so entram no cadastro e nunca na edicao: o grant de UPDATE e por
 * coluna e deixa `modelo_id`/`tipo_resposta` de fora, porque mover ou retipar
 * uma pergunta ja respondida reinterpretaria as respostas antigas. Mandar os
 * dois no update levaria a um 42501 -- entao a linha de edicao nem os carrega.
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
  /** Id do modelo, em texto. So conta no cadastro -- ver o cabecalho. */
  modelo: string;
  tipoResposta: TipoDeResposta;
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
    modelo: texto(formData, "modelo"),
    // Valor fora da lista vira CNA aqui e a validacao nem precisa recusar: e o
    // tipo de toda pergunta anterior a 0061, e o select da tela nao oferece
    // outro valor.
    tipoResposta: (TIPOS_DE_RESPOSTA as readonly string[]).includes(texto(formData, "tipo_resposta"))
      ? (texto(formData, "tipo_resposta") as TipoDeResposta)
      : "CNA",
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

/** `ordem` e unica DENTRO do modelo (`perguntas_checklist_ordem_unica_no_modelo`, 0061). */
const MENSAGENS_DE_ERRO = {
  duplicado: "Já existe uma pergunta nessa ordem neste modelo. Escolha outro número.",
  semPermissao: "Você não tem permissão para cadastrar perguntas do checklist.",
  fkInvalida: "O modelo escolhido não existe mais. Recarregue a página.",
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
    const modeloId = Number(valores.modelo);
    if (!valores.modelo || !Number.isInteger(modeloId) || modeloId <= 0) {
      return { erro: "Escolha o modelo da pergunta.", valores };
    }

    const { error } = await supabase.from("perguntas_checklist").insert({
      ...validacao.linha,
      modelo_id: modeloId,
      tipo_resposta: valores.tipoResposta,
    });
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
  // Volta para a listagem filtrada pelo modelo: quem cadastra pergunta num
  // modelo quase sempre cadastra a proxima no mesmo.
  const filtro = valores.modelo ? `&modelo=${encodeURIComponent(valores.modelo)}` : "";
  redirect(`${LISTAGEM}?salvo=1${filtro}`);
}
