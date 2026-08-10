"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const LISTAGEM = "/dashboard/cadastros/grupo-de-sites";

/** Limites de aplicacao, nao do banco: `nome` e `descricao` sao `text` sem
 * restricao de tamanho. Servem para recusar colagem acidental de um texto
 * enorme, nao para validar regra de negocio. */
const LIMITE_NOME = 200;
const LIMITE_DESCRICAO = 500;

export type ValoresDoGrupo = {
  nome: string;
  descricao: string;
  ativo: boolean;
  /** Migration 0024. */
  grupoPaiId: string;
  /** Ids (em texto, pre-validacao) dos sites marcados no multi-select. */
  siteIds: string[];
};

export type EstadoDoFormulario = {
  erro?: string;
  /** Devolvido para o formulario nao perder o que a pessoa digitou. */
  valores?: ValoresDoGrupo;
};

function extrairValores(formData: FormData): ValoresDoGrupo {
  return {
    nome: String(formData.get("nome") ?? "").trim(),
    descricao: String(formData.get("descricao") ?? "").trim(),
    grupoPaiId: String(formData.get("grupo_pai_id") ?? "").trim(),
    siteIds: formData.getAll("site_ids").map(String),
    // Select, nao mais checkbox: os dois valores possiveis sao "ativo" e
    // "inativo" (ver GrupoSiteForm), entao qualquer coisa diferente de
    // "inativo" cai no lado seguro para um cadastro novo.
    ativo: String(formData.get("status") ?? "") !== "inativo",
  };
}

type LinhaDoGrupo = {
  nome: string;
  descricao: string | null;
  ativo: boolean;
  grupo_pai_id: number | null;
};

/**
 * `idEmEdicao` para barrar o grupo apontar para si mesmo como pai -- mesmo
 * papel de `idEmEdicao` em `site-planta/actions.ts`. O banco tambem barra
 * (constraint da 0024), mas la a mensagem seria o texto cru do Postgres.
 */
function validar(
  valores: ValoresDoGrupo,
  idEmEdicao: number | null,
): { ok: true; linha: LinhaDoGrupo; siteIds: number[] } | { ok: false; erro: string } {
  if (!valores.nome) return { ok: false, erro: "Informe o nome do grupo." };
  if (valores.nome.length > LIMITE_NOME) {
    return { ok: false, erro: `O nome deve ter no máximo ${LIMITE_NOME} caracteres.` };
  }
  if (valores.descricao.length > LIMITE_DESCRICAO) {
    return { ok: false, erro: `A descrição deve ter no máximo ${LIMITE_DESCRICAO} caracteres.` };
  }

  let grupoPaiId: number | null = null;
  if (valores.grupoPaiId) {
    grupoPaiId = Number(valores.grupoPaiId);
    if (!Number.isInteger(grupoPaiId)) {
      return { ok: false, erro: "Grupo de site pai inválido." };
    }
    if (idEmEdicao !== null && grupoPaiId === idEmEdicao) {
      return { ok: false, erro: "Um grupo não pode ser pai de si mesmo." };
    }
  }

  if (valores.siteIds.length === 0) {
    return { ok: false, erro: "Selecione ao menos um site." };
  }
  const siteIds = valores.siteIds.map(Number);
  if (siteIds.some((n) => !Number.isInteger(n))) {
    return { ok: false, erro: "Site selecionado inválido." };
  }

  return {
    ok: true,
    siteIds,
    linha: {
      nome: valores.nome,
      descricao: valores.descricao || null,
      ativo: valores.ativo,
      grupo_pai_id: grupoPaiId,
    },
  };
}

/**
 * `nome` e unique (migration 0003). Sem esta traducao o usuario receberia o
 * texto cru do Postgres, que cita o nome da constraint e nao explica nada.
 */
const CODIGO_NOME_DUPLICADO = "23505";

/**
 * INSERT barrado pelo RLS. Diferente do UPDATE, que passa em silencio, o
 * insert falha alto -- e a mensagem generica ("tente novamente") faria a
 * pessoa repetir a acao para sempre, porque tentar de novo nao resolve.
 */
const CODIGO_SEM_PERMISSAO = "42501";

/** FK apontando para registro inexistente: o grupo pai foi apagado entre o
 * carregamento do formulario e o envio. */
const CODIGO_FK_INVALIDA = "23503";

function traduzirErro(codigo: string | undefined): string {
  if (codigo === CODIGO_NOME_DUPLICADO) return "Já existe um grupo de sites com esse nome.";
  if (codigo === CODIGO_SEM_PERMISSAO) return "Você não tem permissão para cadastrar grupos de sites.";
  if (codigo === CODIGO_FK_INVALIDA) return "Grupo pai não existe mais. Recarregue a página.";
  return "Não foi possível salvar o grupo. Tente novamente.";
}

export async function salvarGrupoSite(
  _estado: EstadoDoFormulario,
  formData: FormData,
): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);

  // O id vem antes da validacao porque ela precisa dele: um grupo nao pode
  // apontar para si mesmo como pai.
  const idBruto = formData.get("id");
  const id = idBruto ? Number(idBruto) : null;
  if (idBruto && !Number.isInteger(id)) {
    return { erro: "Registro inválido.", valores };
  }

  const validacao = validar(valores, id);
  if (!validacao.ok) return { erro: validacao.erro, valores };

  const supabase = await createClient();
  let grupoId: number;

  if (id === null) {
    /**
     * `.select().single()` porque o passo seguinte (vincular os sites
     * escolhidos) precisa do id gerado -- sem ele nao haveria como saber a
     * quem vincular.
     */
    const { data, error } = await supabase
      .from("grupos_sites")
      .insert(validacao.linha)
      .select("id")
      .single();

    if (error) return { erro: traduzirErro(error.code), valores };
    grupoId = data.id;
  } else {
    /**
     * O `.select()` nao e enfeite: um UPDATE barrado pelo RLS nao devolve
     * erro, devolve zero linhas alteradas. Sem conferir isso, quem nao tem
     * permissao veria a mensagem de sucesso e voltaria para a listagem com o
     * registro intacto, sem nunca saber que nada foi salvo.
     */
    const { data, error } = await supabase
      .from("grupos_sites")
      .update(validacao.linha)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return { erro: traduzirErro(error.code), valores };

    if (!data) {
      return {
        erro: "Você não tem permissão para editar este grupo, ou ele não existe mais.",
        valores,
      };
    }
    grupoId = data.id;
  }

  /**
   * Vincula os sites escolhidos a este grupo. `sites.grupo_site_id` e `not
   * null` (migration 0003): um site pertence a exatamente um grupo por vez,
   * entao marcar um site aqui o retira de qualquer outro grupo em que
   * estivesse. Por isso o campo e obrigatorio, e por isso desmarcar um site
   * que ja pertencia a este grupo nao o solta -- soltar exigiria escolher um
   * destino, que este formulario nao pergunta (ver o aviso ao lado do campo
   * "Sites" no formulario).
   */
  const { error: erroSites } = await supabase
    .from("sites")
    .update({ grupo_site_id: grupoId })
    .in("id", validacao.siteIds);

  if (erroSites) {
    return {
      erro: "O grupo foi salvo, mas não foi possível vincular os sites selecionados. Tente novamente.",
      valores,
    };
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}
