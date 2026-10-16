"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { texto } from "@/lib/form-data";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { esquemaDeTexto, LISTAGEM, lerEmailsDoEvento, paraMinutos } from "./regras";

export type ValoresDoEvento = {
  nome: string;
  descricao: string;
  superiorId: string;
  sites: string[];
  emails: string;
  tempoQuantidade: string;
  tempoUnidade: string;
  bloqueioQuantidade: string;
  bloqueioUnidade: string;
  ativo: boolean;
};

export type EstadoDoFormulario = { erro?: string; valores?: ValoresDoEvento };

function extrairValores(formData: FormData): ValoresDoEvento {
  return {
    nome: texto(formData, "nome"),
    descricao: texto(formData, "descricao"),
    superiorId: texto(formData, "superior_id"),
    sites: formData.getAll("sites").map(String).filter(Boolean),
    emails: texto(formData, "emails"),
    tempoQuantidade: texto(formData, "tempo_quantidade"),
    tempoUnidade: texto(formData, "tempo_unidade"),
    bloqueioQuantidade: texto(formData, "bloqueio_quantidade"),
    bloqueioUnidade: texto(formData, "bloqueio_unidade"),
    ativo: texto(formData, "status") !== "inativo",
  };
}

const ID = /^[1-9]\d{0,17}$/;

const MENSAGENS_DE_ERRO = {
  duplicado: "Já existe um evento com esse nome.",
  semPermissao: "Somente o Gestor cadastra e edita eventos.",
  generico: "Não foi possível salvar. Tente novamente.",
};

export async function salvarEvento(_estado: EstadoDoFormulario, formData: FormData): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);

  const idBruto = texto(formData, "id");
  if (idBruto && !ID.test(idBruto)) return { erro: "Registro inválido.", valores };
  const id = idBruto ? Number(idBruto) : null;

  const textoValidado = esquemaDeTexto.safeParse({ nome: valores.nome, descricao: valores.descricao });
  if (!textoValidado.success) return { erro: textoValidado.error.issues[0].message, valores };

  if (valores.superiorId && !ID.test(valores.superiorId)) return { erro: "Evento superior inválido.", valores };
  if (id !== null && valores.superiorId === String(id)) {
    return { erro: "Um evento não pode ser superior de si mesmo.", valores };
  }
  if (valores.sites.some((s) => !ID.test(s))) return { erro: "Site inválido.", valores };

  const emails = lerEmailsDoEvento(valores.emails);
  if (!emails.ok) return { erro: emails.erro, valores };

  const tempo = paraMinutos(valores.tempoQuantidade, valores.tempoUnidade, "Tempo para Atendimento");
  if (!tempo.ok) return { erro: tempo.erro, valores };
  const bloqueio = paraMinutos(valores.bloqueioQuantidade, valores.bloqueioUnidade, "Bloqueio de Repetição");
  if (!bloqueio.ok) return { erro: bloqueio.erro, valores };

  const supabase = await createClient();
  // Evento, sites e e-mails numa transacao so (`salvar_evento`, 0072). As
  // policies sao o portao: quem nao e GESTOR recebe 42501.
  const { error } = await supabase.rpc("salvar_evento", {
    // O tipo gerado nao marca os parametros que aceitam nulo; a funcao aceita.
    p_id: id as number,
    p_nome: valores.nome,
    p_descricao: (valores.descricao || null) as string,
    p_superior_id: (valores.superiorId ? Number(valores.superiorId) : null) as number,
    p_tempo_atendimento_minutos: tempo.minutos as number,
    p_bloqueio_repeticao_minutos: bloqueio.minutos as number,
    p_ativo: valores.ativo,
    p_sites: valores.sites.map(Number),
    p_emails: emails.emails,
  });

  if (error) {
    // 23514: a regra de um nivel do superior (trigger da 0072), com a frase
    // do proprio banco -- ela e nossa e ja esta em portugues.
    if (error.code === "23514" && /superior|subtipo/i.test(error.message)) {
      return { erro: error.message, valores };
    }
    if (error.code !== "23505" && error.code !== "42501") {
      registrarErro(gerarIdDeRequisicao(), "Cadastro de Eventos: falha ao salvar:", error);
    }
    return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO), valores };
  }

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}?salvo=1`);
}
