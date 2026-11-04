/**
 * Regras do formulario de analise e finalizacao (migration 0064) que valem
 * nos dois lados: o navegador (envia os anexos e monta o formulario) e a
 * Server Action (confere tudo de novo, porque o POST pode ser feito a mao).
 * Pura, sem React nem Supabase, para ser testada sozinha.
 */

import { lerListaDeEmails } from "@/lib/lista-de-emails";

export type TipoDeAndamento = "ANALISE" | "FINALIZACAO";

export const MAXIMO_DE_ARQUIVOS = 10;
/** O mesmo teto do bucket `ocorrencias` (10 MiB). */
export const MAXIMO_DE_BYTES = 10 * 1024 * 1024;
export const MAXIMO_DE_EMAILS = 10;
export const LIMITE_DO_TEXTO = 4000;

/**
 * Formatos que o sistema de referencia aceita: jpg, jpeg, png, zip, pdf, xls,
 * xlsx. O tipo enviado ao Storage sai DAQUI, pela extensao, e nao do
 * `file.type` do navegador -- que muda de um sistema para outro (o zip chega
 * como `application/x-zip-compressed` no Windows) e e declarado pelo cliente.
 */
const TIPO_POR_EXTENSAO: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
  zip: "application/zip",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const EXTENSOES_ACEITAS = Object.keys(TIPO_POR_EXTENSAO);
export const ACCEPT_DOS_ARQUIVOS = EXTENSOES_ACEITAS.map((e) => `.${e}`).join(",");

export function extensaoDe(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  return ponto < 0 ? "" : nome.slice(ponto + 1).toLowerCase();
}

export function tipoPorExtensao(nome: string): string | null {
  return TIPO_POR_EXTENSAO[extensaoDe(nome)] ?? null;
}

/** Tipos que o navegador mostra na propria aba; o resto vai como download. */
export function eImagem(tipo: string): boolean {
  return tipo === "image/png" || tipo === "image/jpeg";
}

/**
 * Os primeiros bytes confirmam o que a extensao diz. Nao e antivirus -- e o
 * que impede "relatorio.pdf" de ser um HTML renomeado.
 */
const ASSINATURAS: Record<string, number[][]> = {
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  png: [[0x89, 0x50, 0x4e, 0x47]],
  pdf: [[0x25, 0x50, 0x44, 0x46]],
  zip: [[0x50, 0x4b]],
  xlsx: [[0x50, 0x4b]],
  xls: [[0xd0, 0xcf, 0x11, 0xe0]],
};

export function assinaturaConfere(nome: string, inicio: Uint8Array): boolean {
  const aceitas = ASSINATURAS[extensaoDe(nome)];
  return Boolean(aceitas?.some((assinatura) => assinatura.every((byte, i) => inicio[i] === byte)));
}

/** Confere nome, tamanho e extensao de um arquivo antes de enviar. */
export function erroDoArquivo(arquivo: { name: string; size: number }): string | null {
  if (!tipoPorExtensao(arquivo.name)) {
    return `"${arquivo.name}": formato não aceito. Use ${EXTENSOES_ACEITAS.join(", ")}.`;
  }
  if (arquivo.size <= 0) return `"${arquivo.name}": arquivo vazio.`;
  if (arquivo.size > MAXIMO_DE_BYTES) return `"${arquivo.name}": acima de 10 MB.`;
  return null;
}

/** "Relatório final (1).PDF" -> "relatorio-final-1.pdf": o nome vai para o caminho. */
export function nomeSeguro(nome: string): string {
  const extensao = extensaoDe(nome);
  const base = (extensao ? nome.slice(0, -(extensao.length + 1)) : nome)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "arquivo"}.${extensao}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `{ocorrencia}/{uuid}-{nome-seguro}.{ext}`, o formato que o navegador monta. */
export function caminhoDoAnexo(ocorrenciaId: number, uuid: string, nome: string): string {
  return `${ocorrenciaId}/${uuid}-${nomeSeguro(nome)}`;
}

export function caminhoValido(ocorrenciaId: number, caminho: string): boolean {
  const prefixo = `${ocorrenciaId}/`;
  if (!caminho.startsWith(prefixo)) return false;
  const resto = caminho.slice(prefixo.length);
  return /^[0-9a-f-]{36}-[a-z0-9-]{1,80}\.[a-z0-9]{2,4}$/.test(resto) && UUID.test(resto.slice(0, 36)) && Boolean(tipoPorExtensao(resto));
}

export type AnexoEnviado = { storage_path: string; nome: string };

/** "a@x.com; b@y.com, a@x.com" -> ["a@x.com", "b@y.com"], ou o erro. */
export function lerEmails(texto: string): { ok: true; emails: string[] } | { ok: false; erro: string } {
  return lerListaDeEmails(texto, MAXIMO_DE_EMAILS, "e-mails externos");
}

export type DadosDoAndamento = {
  ocorrenciaId: number;
  tipo: TipoDeAndamento;
  tipoAnaliseId: number;
  classificacaoId: number | null;
  texto: string;
  responsavelId: string | null;
  grupoUsuarioId: number | null;
  apoio: string[];
  avisar: string[];
  emailsExternos: string[];
  arquivos: AnexoEnviado[];
};

function idPositivo(valor: string): number | null {
  return /^\d{1,15}$/.test(valor) && Number(valor) > 0 ? Number(valor) : null;
}

function uuids(valores: FormDataEntryValue[]): string[] | null {
  const lista = Array.from(new Set(valores.map((v) => String(v).trim()).filter(Boolean)));
  return lista.every((v) => UUID.test(v)) && lista.length <= 50 ? lista : null;
}

/** Le e confere o formulario. Os anexos ja subiram; aqui chegam so os caminhos. */
export function lerAndamento(formData: FormData): { ok: true; dados: DadosDoAndamento } | { ok: false; erro: string } {
  const campo = (nome: string) => String(formData.get(nome) ?? "").trim();

  const ocorrenciaId = idPositivo(campo("ocorrencia_id"));
  if (ocorrenciaId === null) return { ok: false, erro: "Ocorrência inválida." };

  const tipo = campo("tipo");
  if (tipo !== "ANALISE" && tipo !== "FINALIZACAO") return { ok: false, erro: "Tipo de registro inválido." };

  const tipoAnaliseId = idPositivo(campo("tipo_analise_id"));
  if (tipoAnaliseId === null) return { ok: false, erro: "Escolha o tipo de análise." };

  const classificacaoTexto = campo("tipo_classificacao_id");
  const classificacaoId = classificacaoTexto ? idPositivo(classificacaoTexto) : null;
  if (classificacaoTexto && classificacaoId === null) return { ok: false, erro: "Classificação inválida." };

  const texto = campo("texto");
  if (!texto) {
    return { ok: false, erro: tipo === "ANALISE" ? "Escreva a análise do evento." : "Informe as ações realizadas." };
  }
  if (texto.length > LIMITE_DO_TEXTO) return { ok: false, erro: `O texto deve ter no máximo ${LIMITE_DO_TEXTO} caracteres.` };

  const responsavelTexto = campo("responsavel_id");
  if (responsavelTexto && !UUID.test(responsavelTexto)) return { ok: false, erro: "Responsável inválido." };

  const grupoTexto = campo("grupo_usuario_id");
  const grupoUsuarioId = grupoTexto ? idPositivo(grupoTexto) : null;
  if (grupoTexto && grupoUsuarioId === null) return { ok: false, erro: "Grupo inválido." };

  const apoio = uuids(formData.getAll("apoio"));
  const avisar = uuids(formData.getAll("avisar"));
  if (apoio === null || avisar === null) return { ok: false, erro: "Seleção de usuários inválida." };

  const emails = lerEmails(campo("emails_externos"));
  if (!emails.ok) return emails;

  let arquivos: AnexoEnviado[] = [];
  const bruto = campo("arquivos_enviados");
  if (bruto) {
    try {
      const lido: unknown = JSON.parse(bruto);
      if (!Array.isArray(lido)) throw new Error("não é lista");
      arquivos = lido.map((item) => {
        const { storage_path, nome } = item as Partial<AnexoEnviado>;
        if (typeof storage_path !== "string" || typeof nome !== "string") throw new Error("item inválido");
        if (!caminhoValido(ocorrenciaId, storage_path) || !nome.trim() || nome.length > 200) throw new Error("caminho inválido");
        return { storage_path, nome: nome.trim() };
      });
    } catch {
      return { ok: false, erro: "Anexos inválidos. Anexe os arquivos de novo." };
    }
    if (arquivos.length > MAXIMO_DE_ARQUIVOS) return { ok: false, erro: `No máximo ${MAXIMO_DE_ARQUIVOS} arquivos.` };
  }

  return {
    ok: true,
    dados: {
      ocorrenciaId,
      tipo,
      tipoAnaliseId,
      classificacaoId: tipo === "ANALISE" ? classificacaoId : null,
      texto,
      responsavelId: tipo === "ANALISE" && responsavelTexto ? responsavelTexto : null,
      grupoUsuarioId: tipo === "ANALISE" ? grupoUsuarioId : null,
      apoio: tipo === "ANALISE" ? apoio : [],
      avisar: tipo === "FINALIZACAO" ? avisar : [],
      emailsExternos: emails.emails,
      arquivos,
    },
  };
}

/** Status que ainda aceitam analise e finalizacao (o trigger da 0064 recusa os outros). */
/** Os status de encerramento (0064 e 0089): nao recebem mais andamento. */
export const STATUS_ENCERRADOS = ["ATENDIDO", "CANCELADO", "CONCLUIDO", "NAO_REALIZADO"] as const;

export function aceitaAndamento(status: string): boolean {
  return !(STATUS_ENCERRADOS as readonly string[]).includes(status);
}

/** Teto do "Enviar Evento", o mesmo da funcao do banco (0081). */
export const MAXIMO_DE_DESTINATARIOS = 20;

/**
 * Le e confere o "Enviar Evento" (0081): o evento e as pessoas escolhidas. O
 * banco confere de novo (permissao, pessoa ativa, e-mail cadastrado); aqui so
 * se poupa a viagem e se da a mensagem certa.
 */
export function lerEnvio(
  formData: FormData,
): { ok: true; dados: { ocorrenciaId: number; destinatarios: string[] } } | { ok: false; erro: string } {
  const ocorrenciaId = idPositivo(String(formData.get("ocorrencia_id") ?? "").trim());
  if (ocorrenciaId === null) return { ok: false, erro: "Evento inválido." };

  const destinatarios = uuids(formData.getAll("destinatarios"));
  if (destinatarios === null) return { ok: false, erro: "Seleção de destinatários inválida." };
  if (destinatarios.length === 0) return { ok: false, erro: "Escolha ao menos um destinatário." };
  if (destinatarios.length > MAXIMO_DE_DESTINATARIOS) {
    return { ok: false, erro: `Escolha no máximo ${MAXIMO_DE_DESTINATARIOS} destinatários.` };
  }

  return { ok: true, dados: { ocorrenciaId, destinatarios } };
}

/**
 * "Qtd. Minima de Caracteres da Descricao / Acoes Realizadas" (Cadastros >
 * Cliente, 0085): a analise conta como descricao, a finalizacao como acoes
 * realizadas. Zero: sem minimo. Pura.
 */
export function erroDoMinimoDeTexto(
  tipo: "ANALISE" | "FINALIZACAO",
  texto: string,
  minimos: { minCaracteresDescricao: number; minCaracteresAcoes: number },
): string | null {
  const minimo = tipo === "ANALISE" ? minimos.minCaracteresDescricao : minimos.minCaracteresAcoes;
  if (minimo <= 0 || texto.trim().length >= minimo) return null;
  return tipo === "ANALISE"
    ? `A análise deve ter pelo menos ${minimo} caracteres.`
    : `As ações realizadas devem ter pelo menos ${minimo} caracteres.`;
}
