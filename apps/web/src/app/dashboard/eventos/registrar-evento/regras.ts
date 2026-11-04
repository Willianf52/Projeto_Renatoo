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
  /** "Local do evento" (0082): texto livre, ate 200 caracteres. */
  local: string | null;
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

  const local = campo("local").replace(/\s+/g, " ");
  if (local.length > 200) return { ok: false, erro: "O local do evento deve ter no máximo 200 caracteres." };

  return {
    ok: true,
    dados: { siteId, eventoId, subeventoId, classificacaoId, observacao: observacao || null, local: local || null },
  };
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

export type PermissaoDoEvento = { eventoId: number; grupoSiteId: number | null; grupoUsuarioId: number | null };

/**
 * Pura: aplica as permissoes de visualizacao do canal WEB (0089), como no
 * sistema de referencia.
 *   - Com Grupo de Usuarios no evento, so quem e de um deles ve o evento.
 *   - Com Grupo de Locais, o evento so vale para os sites desses grupos
 *     (somados aos "Sites" do cadastro, se houver: fica a intersecao).
 * Sem permissao nenhuma, o evento continua como era. Evento que nao vale para
 * site nenhum leva `sites: [-1]` (nunca bate), porque lista vazia quer dizer
 * "todos".
 */
export function aplicarPermissoesWeb(
  eventos: EventoParaRegistro[],
  permissoes: readonly PermissaoDoEvento[],
  meusGrupos: ReadonlySet<number>,
  grupoDoSite: ReadonlyMap<number, number>,
): EventoParaRegistro[] {
  const porEvento = new Map<number, { locais: Set<number>; usuarios: Set<number> }>();
  for (const p of permissoes) {
    const e = porEvento.get(p.eventoId) ?? { locais: new Set<number>(), usuarios: new Set<number>() };
    if (p.grupoSiteId !== null) e.locais.add(p.grupoSiteId);
    if (p.grupoUsuarioId !== null) e.usuarios.add(p.grupoUsuarioId);
    porEvento.set(p.eventoId, e);
  }
  const saida: EventoParaRegistro[] = [];
  for (const evento of eventos) {
    const regra = porEvento.get(evento.id);
    if (!regra) {
      saida.push(evento);
      continue;
    }
    if (regra.usuarios.size > 0 && ![...regra.usuarios].some((g) => meusGrupos.has(g))) continue;
    if (regra.locais.size === 0) {
      saida.push(evento);
      continue;
    }
    const dosGrupos = [...grupoDoSite.entries()].filter(([, grupo]) => regra.locais.has(grupo)).map(([site]) => site);
    const permitidos = evento.sites.length === 0 ? dosGrupos : evento.sites.filter((s) => dosGrupos.includes(s));
    saida.push({ ...evento, sites: permitidos.length > 0 ? permitidos : [-1] });
  }
  return saida;
}
