import { caminhoValido, MAXIMO_DE_ARQUIVOS, type AnexoEnviado } from "../painel-de-eventos/andamentos";

/**
 * Registrar Evento (migration 0072): regras puras, para o navegador e para as
 * Server Actions, que conferem tudo de novo -- o POST pode ser feito a mao.
 */

export const LIMITE_DA_OBSERVACAO = 2000;

export type DadosDoRegistro = {
  siteId: number;
  eventoId: number;
  subeventoId: number | null;
  classificacaoId: number | null;
  observacao: string | null;
};

function id(valor: string): number | null {
  return /^[1-9]\d{0,14}$/.test(valor) ? Number(valor) : null;
}

export function lerRegistro(formData: FormData): { ok: true; dados: DadosDoRegistro } | { ok: false; erro: string } {
  const campo = (nome: string) => String(formData.get(nome) ?? "").trim();

  const siteId = id(campo("site_id"));
  if (siteId === null) return { ok: false, erro: "Escolha o site." };
  const eventoId = id(campo("evento_id"));
  if (eventoId === null) return { ok: false, erro: "Escolha o evento." };

  const subeventoTexto = campo("subevento_id");
  const subeventoId = subeventoTexto ? id(subeventoTexto) : null;
  if (subeventoTexto && subeventoId === null) return { ok: false, erro: "Subtipo inválido." };

  const classificacaoTexto = campo("classificacao_id");
  const classificacaoId = classificacaoTexto ? id(classificacaoTexto) : null;
  if (classificacaoTexto && classificacaoId === null) return { ok: false, erro: "Classificação inválida." };

  const observacao = campo("observacao");
  if (observacao.length > LIMITE_DA_OBSERVACAO) {
    return { ok: false, erro: `A observação deve ter no máximo ${LIMITE_DA_OBSERVACAO} caracteres.` };
  }

  return { ok: true, dados: { siteId, eventoId, subeventoId, classificacaoId, observacao: observacao || null } };
}

/** Os caminhos que o navegador diz ter enviado, conferidos contra a pasta da
 * ocorrencia -- o mesmo criterio dos anexos da analise (0064). */
export function lerAnexos(ocorrenciaId: number, bruto: unknown): AnexoEnviado[] | null {
  if (!Array.isArray(bruto) || bruto.length === 0 || bruto.length > MAXIMO_DE_ARQUIVOS) return null;
  const lidos: AnexoEnviado[] = [];
  for (const item of bruto) {
    const { storage_path, nome } = (item ?? {}) as Partial<AnexoEnviado>;
    if (typeof storage_path !== "string" || typeof nome !== "string") return null;
    if (!caminhoValido(ocorrenciaId, storage_path) || !nome.trim() || nome.length > 200) return null;
    lidos.push({ storage_path, nome: nome.trim() });
  }
  return lidos;
}

export type EventoParaRegistro = {
  id: number;
  nome: string;
  superiorId: number | null;
  /** Vazio: vale para todos os sites. */
  sites: number[];
};

/** Pura: os eventos de primeiro nivel que valem para o site escolhido. */
export function eventosDoSite(eventos: EventoParaRegistro[], siteId: number | null): EventoParaRegistro[] {
  return eventos.filter(
    (e) => e.superiorId === null && (e.sites.length === 0 || (siteId !== null && e.sites.includes(siteId))),
  );
}

/** Pura: os subtipos (filhos) do evento escolhido. */
export function subtiposDe(eventos: EventoParaRegistro[], eventoId: number | null): EventoParaRegistro[] {
  return eventoId === null ? [] : eventos.filter((e) => e.superiorId === eventoId);
}
