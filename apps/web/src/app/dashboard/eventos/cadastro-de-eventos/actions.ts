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
  // Campos da 0083.
  finalizacaoQuantidade: string;
  finalizacaoUnidade: string;
  statusFinal: string;
  usuarioFinalId: string;
  responsavelAtendimentoId: string;
  enviarSuperiorImediato: boolean;
  emailsCopia: string;
  prorrogacaoQuantidade: string;
  prorrogacaoUnidade: string;
  alarme: boolean;
  finalizacaoAutomatica: boolean;
  finalizacaoPelaOcorrenciaInicio: boolean;
  nps: string;
  tipoClassificacaoId: string;
  grupoResponsavelId: string;
  /** "Setor Responsavel" (0086): id da lista, ou vazio. */
  setorResponsavelId: string;
  /** Permissoes de visualizacao (0089): ids de grupos, por canal. */
  permWebLocais: string[];
  permWebUsuarios: string[];
  permAppLocais: string[];
  permAppUsuarios: string[];
};

const CAMPOS_DE_PERMISSAO = [
  ["permWebLocais", "WEB", "grupo_site_id"],
  ["permWebUsuarios", "WEB", "grupo_usuario_id"],
  ["permAppLocais", "APP", "grupo_site_id"],
  ["permAppUsuarios", "APP", "grupo_usuario_id"],
] as const;

export type EstadoDoFormulario = { erro?: string; valores?: ValoresDoEvento };

function extrairValores(formData: FormData): ValoresDoEvento {
  return {
    nome: texto(formData, "nome"),
    descricao: texto(formData, "descricao"),
    superiorId: texto(formData, "superior_id"),
    sites: formData.getAll("sites").map(String).filter(Boolean),
    permWebLocais: formData.getAll("perm_web_locais").map(String).filter(Boolean),
    permWebUsuarios: formData.getAll("perm_web_usuarios").map(String).filter(Boolean),
    permAppLocais: formData.getAll("perm_app_locais").map(String).filter(Boolean),
    permAppUsuarios: formData.getAll("perm_app_usuarios").map(String).filter(Boolean),
    emails: texto(formData, "emails"),
    tempoQuantidade: texto(formData, "tempo_quantidade"),
    tempoUnidade: texto(formData, "tempo_unidade"),
    bloqueioQuantidade: texto(formData, "bloqueio_quantidade"),
    bloqueioUnidade: texto(formData, "bloqueio_unidade"),
    ativo: texto(formData, "status") !== "inativo",
    finalizacaoQuantidade: texto(formData, "finalizacao_quantidade"),
    finalizacaoUnidade: texto(formData, "finalizacao_unidade"),
    statusFinal: texto(formData, "status_final"),
    usuarioFinalId: texto(formData, "usuario_final_id"),
    responsavelAtendimentoId: texto(formData, "responsavel_atendimento_id"),
    enviarSuperiorImediato: texto(formData, "enviar_superior_imediato") === "sim",
    emailsCopia: texto(formData, "emails_copia"),
    prorrogacaoQuantidade: texto(formData, "prorrogacao_quantidade"),
    prorrogacaoUnidade: texto(formData, "prorrogacao_unidade"),
    alarme: texto(formData, "alarme") === "sim",
    finalizacaoAutomatica: texto(formData, "finalizacao_automatica") === "sim",
    finalizacaoPelaOcorrenciaInicio: texto(formData, "finalizacao_pela_ocorrencia_inicio") === "sim",
    nps: texto(formData, "nps"),
    tipoClassificacaoId: texto(formData, "tipo_classificacao_id"),
    grupoResponsavelId: texto(formData, "grupo_responsavel_id"),
    setorResponsavelId: texto(formData, "setor_responsavel_id"),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (CAMPOS_DE_PERMISSAO.some(([campo]) => valores[campo].some((g) => !ID.test(g)))) {
    return { erro: "Grupo inválido nas permissões.", valores };
  }

  const emails = lerEmailsDoEvento(valores.emails);
  if (!emails.ok) return { erro: emails.erro, valores };

  const tempo = paraMinutos(valores.tempoQuantidade, valores.tempoUnidade, "Tempo para Atendimento");
  if (!tempo.ok) return { erro: tempo.erro, valores };
  const bloqueio = paraMinutos(valores.bloqueioQuantidade, valores.bloqueioUnidade, "Bloqueio de Repetição");
  if (!bloqueio.ok) return { erro: bloqueio.erro, valores };

  // Campos da 0083.
  const finalizacao = paraMinutos(valores.finalizacaoQuantidade, valores.finalizacaoUnidade, "Tempo para Finalização");
  if (!finalizacao.ok) return { erro: finalizacao.erro, valores };
  const prorrogacao = paraMinutos(
    valores.prorrogacaoQuantidade,
    valores.prorrogacaoUnidade,
    "Tempo de Prorrogação de Atendimento",
  );
  if (!prorrogacao.ok) return { erro: prorrogacao.erro, valores };
  if (valores.finalizacaoAutomatica && finalizacao.minutos === null) {
    return { erro: "Para a finalização automática, informe o Tempo para Finalização.", valores };
  }
  if (valores.statusFinal && !["ATENDIDO", "CANCELADO"].includes(valores.statusFinal)) {
    return { erro: "Status final inválido.", valores };
  }
  if (valores.nps && !["POSITIVO", "NEUTRO", "NEGATIVO"].includes(valores.nps)) {
    return { erro: "NPS inválido.", valores };
  }
  for (const uuid of [valores.usuarioFinalId, valores.responsavelAtendimentoId]) {
    if (uuid && !UUID.test(uuid)) return { erro: "Usuário inválido.", valores };
  }
  for (const idTexto of [valores.tipoClassificacaoId, valores.grupoResponsavelId, valores.setorResponsavelId]) {
    if (idTexto && !ID.test(idTexto)) return { erro: "Classificação ou grupo inválido.", valores };
  }
  const emailsCopia = lerEmailsDoEvento(valores.emailsCopia);
  if (!emailsCopia.ok) return { erro: `E-mails (cópia): ${emailsCopia.erro}`, valores };

  const supabase = await createClient();
  // Evento, sites e e-mails numa transacao so (`salvar_evento`, 0072). As
  // policies sao o portao: quem nao e GESTOR recebe 42501.
  const { data: eventoId, error } = await supabase.rpc("salvar_evento", {
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
    p_extras: {
      tempo_finalizacao_minutos: finalizacao.minutos,
      status_final: valores.statusFinal || null,
      usuario_final_id: valores.usuarioFinalId || null,
      responsavel_atendimento_id: valores.responsavelAtendimentoId || null,
      enviar_superior_imediato: valores.enviarSuperiorImediato,
      emails_copia: emailsCopia.emails,
      prorrogacao_minutos: prorrogacao.minutos,
      alarme: valores.alarme,
      finalizacao_automatica: valores.finalizacaoAutomatica,
      finalizacao_pela_ocorrencia_inicio: valores.finalizacaoPelaOcorrenciaInicio,
      nps: valores.nps || null,
      tipo_classificacao_id: valores.tipoClassificacaoId ? Number(valores.tipoClassificacaoId) : null,
      grupo_responsavel_id: valores.grupoResponsavelId ? Number(valores.grupoResponsavelId) : null,
      setor_responsavel_id: valores.setorResponsavelId ? Number(valores.setorResponsavelId) : null,
    },
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

  // Permissoes de visualizacao (0089): troca o conjunto do evento. Se a
  // segunda escrita falhar, o evento fica sem permissao -- o mesmo que "vale
  // para todos", que era o comportamento antes da 0089 -- e a tela avisa.
  const idDoEvento = typeof eventoId === "number" ? eventoId : id;
  if (idDoEvento !== null) {
    const linhas = CAMPOS_DE_PERMISSAO.flatMap(([campo, canal, coluna]) =>
      valores[campo].map((g) => ({
        evento_id: idDoEvento,
        canal,
        grupo_site_id: coluna === "grupo_site_id" ? Number(g) : null,
        grupo_usuario_id: coluna === "grupo_usuario_id" ? Number(g) : null,
      })),
    );
    const removidas = await supabase.from("evento_permissoes").delete().eq("evento_id", idDoEvento);
    const gravadas = linhas.length > 0 ? await supabase.from("evento_permissoes").insert(linhas) : { error: null };
    if (removidas.error || gravadas.error) {
      registrarErro(gerarIdDeRequisicao(), "Cadastro de Eventos: falha nas permissões:", removidas.error ?? gravadas.error);
      return { erro: "O evento foi salvo, mas as permissões de visualização não. Tente salvar de novo.", valores };
    }
  }

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}?salvo=1`);
}
