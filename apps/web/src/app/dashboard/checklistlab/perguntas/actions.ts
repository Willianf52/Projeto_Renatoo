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
  peso: z
    .number({ error: "Informe o peso da pergunta." })
    .int("O peso deve ser um número inteiro.")
    .min(1, "O peso deve ser de 1 a 10.")
    .max(10, "O peso deve ser de 1 a 10."),
});

const GATILHOS = ["SIM", "NAO", "NA"] as const;

export type ValoresDaPergunta = {
  texto: string;
  /** Em texto, pre-validacao -- o campo do formulario devolve string. */
  ordem: string;
  ativo: boolean;
  /** Id do modelo, em texto. So conta no cadastro -- ver o cabecalho. */
  modelo: string;
  tipoResposta: TipoDeResposta;
  /** Ids em texto; vazio = sem grupo / sem evento proprio (0073). */
  grupo: string;
  evento: string;
  /** "Obrigatorio" do sistema de referencia (0099): falso, o app deixa pular. */
  obrigatoria: boolean;
  /** Peso na nota, em texto (0108). */
  peso: string;
  /** Condicional (0108): id da pergunta base em texto (vazio: sempre aparece) e a resposta que a mostra. */
  base: string;
  gatilho: string;
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
    grupo: texto(formData, "grupo"),
    evento: texto(formData, "evento"),
    // Mesmo raciocinio do status: so "nao" desliga; o resto e o padrao seguro.
    obrigatoria: String(formData.get("obrigatoria") ?? "") !== "nao",
    peso: texto(formData, "peso") || "1",
    base: texto(formData, "base"),
    gatilho: texto(formData, "gatilho"),
  };
}

/**
 * Grupo e evento vao no INSERT e no UPDATE (grants da 0073): trocar o tipo de
 * evento nao reinterpreta o que ja foi respondido -- a ocorrencia guarda o
 * proprio `evento_id`.
 */
type LinhaDaPergunta = {
  texto: string;
  ordem: number;
  ativo: boolean;
  grupo_pergunta_id: number | null;
  evento_id: number | null;
  obrigatoria: boolean;
  peso: number;
  pergunta_base_id: number | null;
  resposta_gatilho: string | null;
};

const ID = /^[1-9]\d{0,14}$/;

function validar(
  valores: ValoresDaPergunta,
): { ok: true; linha: LinhaDaPergunta } | { ok: false; erro: string } {
  // `Number("")` e 0 e `Number("abc")` e NaN -- os dois sao recusados pelo
  // `.int()`/`.min(1)` do schema, entao nao ha checagem imperativa antes.
  const validado = esquemaDaPergunta.safeParse({
    texto: valores.texto,
    ordem: valores.ordem === "" ? Number.NaN : Number(valores.ordem),
    peso: Number(valores.peso),
  });

  if (!validado.success) return { ok: false, erro: validado.error.issues[0].message };

  // O POST pode ser montado a mao: os dois vao para FK `bigint`.
  if (valores.grupo && !ID.test(valores.grupo)) return { ok: false, erro: "Grupo de perguntas inválido." };
  if (valores.evento && !ID.test(valores.evento)) return { ok: false, erro: "Tipo de evento inválido." };
  if (valores.base && !ID.test(valores.base)) return { ok: false, erro: "Pergunta base inválida." };
  if (valores.base && !(GATILHOS as readonly string[]).includes(valores.gatilho)) {
    return { ok: false, erro: "Escolha a resposta da pergunta base que faz esta aparecer." };
  }

  return {
    ok: true,
    linha: {
      texto: validado.data.texto,
      ordem: validado.data.ordem,
      ativo: valores.ativo,
      grupo_pergunta_id: valores.grupo ? Number(valores.grupo) : null,
      evento_id: valores.evento ? Number(valores.evento) : null,
      obrigatoria: valores.obrigatoria,
      peso: validado.data.peso,
      pergunta_base_id: valores.base ? Number(valores.base) : null,
      resposta_gatilho: valores.base ? valores.gatilho : null,
    },
  };
}

/**
 * A condicional (0108) passa pelo banco de qualquer jeito: o gatilho
 * `validar_pergunta_condicional` recusa com 23514. Esta conferencia so troca
 * o "nao foi possivel salvar" por uma frase que diga o que corrigir.
 */
async function conferirCondicional(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: number | null,
  modeloId: number,
  linha: LinhaDaPergunta,
): Promise<string | null> {
  if (linha.pergunta_base_id === null) return null;
  if (linha.pergunta_base_id === id) return "A pergunta não pode depender dela mesma.";

  const { data: base } = await supabase
    .from("perguntas_checklist")
    .select("modelo_id, tipo_resposta, pergunta_base_id")
    .eq("id", linha.pergunta_base_id)
    .maybeSingle();
  if (!base) return "A pergunta base não existe mais. Recarregue a página.";
  if (base.modelo_id !== modeloId) return "A pergunta base precisa ser do mesmo modelo.";
  if (base.pergunta_base_id !== null) return "A pergunta base também é condicional: escolha uma pergunta comum.";
  if (linha.resposta_gatilho === "NA" && base.tipo_resposta !== "CNA") {
    return "A pergunta base não tem a resposta \"Não se aplica\".";
  }
  if (id !== null) {
    const { count } = await supabase
      .from("perguntas_checklist")
      .select("id", { count: "exact", head: true })
      .eq("pergunta_base_id", id);
    if ((count ?? 0) > 0) return "Outras perguntas dependem desta, então ela não pode depender de outra.";
  }
  return null;
}

const ERRO_DA_CONDICAO = "A condição escolhida não é válida. Confira a pergunta base e a resposta.";

/** `ordem` e unica DENTRO do modelo (`perguntas_checklist_ordem_unica_no_modelo`, 0061). */
const MENSAGENS_DE_ERRO = {
  duplicado: "Já existe uma pergunta nessa ordem neste modelo. Escolha outro número.",
  semPermissao: "Você não tem permissão para cadastrar perguntas do checklist.",
  fkInvalida: "O modelo, o grupo ou o evento escolhido não existe mais. Recarregue a página.",
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

  const modeloId = Number(valores.modelo);
  if (validacao.linha.pergunta_base_id !== null) {
    const problema = await conferirCondicional(supabase, id, modeloId, validacao.linha);
    if (problema) return { erro: problema, valores };
  }

  if (id === null) {
    if (!valores.modelo || !Number.isInteger(modeloId) || modeloId <= 0) {
      return { erro: "Escolha o modelo da pergunta.", valores };
    }

    const { error } = await supabase.from("perguntas_checklist").insert({
      ...validacao.linha,
      modelo_id: modeloId,
      tipo_resposta: valores.tipoResposta,
    });
    if (error?.code === "23514") return { erro: ERRO_DA_CONDICAO, valores };
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

    if (resultado.error?.code === "23514") return { erro: ERRO_DA_CONDICAO, valores };
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

/**
 * Seta para cima/baixo da lista (filtrada por modelo): troca a pergunta com a
 * vizinha numa transacao (`mover_pergunta`, 0073). Form POST, sem JS: volta
 * para a mesma lista.
 */
export async function moverPergunta(formData: FormData): Promise<void> {
  const id = Number(texto(formData, "id"));
  const modelo = texto(formData, "modelo");
  const paraCima = texto(formData, "direcao") === "cima";
  const volta = /^\d+$/.test(modelo) ? `${LISTAGEM}?modelo=${modelo}` : LISTAGEM;
  if (!Number.isSafeInteger(id) || id <= 0) return redirect(volta);

  const supabase = await createClient();
  const { error } = await supabase.rpc("mover_pergunta", { p_pergunta_id: id, p_para_cima: paraCima });
  // Sem tela de erro para uma seta: quem nao pode reordenar nem ve o botao
  // ativo, e o banco recusa de qualquer jeito (42501). O resultado aparece na
  // lista, que volta igual.
  if (!error) revalidatePath(LISTAGEM);
  redirect(volta);
}
