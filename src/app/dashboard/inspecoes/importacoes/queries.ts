import { formatarDataHora } from "@/lib/data-hora";
import { createClient } from "@/lib/supabase/server";
import { paginar } from "@/lib/supabase/query-helpers";

/**
 * Lista as tentativas de lote gravadas em `importacoes` (migration 0033) --
 * sucesso ou recusa, uma linha por chamada que passou do segredo e do limite
 * de taxa em `api/importar/coletas/route.ts`. Ver o cabecalho da migration
 * para o porque 401/429 nunca aparecem aqui.
 *
 * Tabela pequena por natureza (uma linha por requisicao de integracao, nao
 * por leitura) -- ao contrario de `coletas-importadas`, conta exata em vez de
 * estimada e sem cache de opcoes de filtro.
 */

export const PAGE_SIZE = 25;

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export type Filtros = {
  dataInicial?: string;
  dataFinal?: string;
  status?: string;
  pagina: number;
};

export function extrairFiltros(params: SearchParams): Filtros {
  return {
    dataInicial: primeiro(params.data_inicial),
    dataFinal: primeiro(params.data_final),
    status: primeiro(params.status),
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

/** Mesma lista de `StatusImportacao` em `api/importar/coletas/route.ts` --
 * não reaproveitada de lá de propósito: importar de dentro de `app/api/`
 * puxaria a rota (e suas dependências de servidor) para o bundle da tela. */
export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "sucesso", label: "Sucesso" },
  { value: "corpo_invalido", label: "Corpo inválido" },
  { value: "lote_invalido", label: "Lote inválido" },
  { value: "referencia_desconhecida", label: "Referência desconhecida" },
  { value: "falha_ao_consultar_referencias", label: "Falha ao consultar referências" },
  { value: "falha_ao_gravar_visitas", label: "Falha ao gravar visitas" },
  { value: "falha_ao_gravar_leituras", label: "Falha ao gravar leituras" },
];

const ROTULO_POR_STATUS = new Map(STATUS_OPTIONS.map((opcao) => [opcao.value, opcao.label]));

/** Status desconhecido (schema mudou e a tela não) cai no próprio valor bruto
 * em vez de sumir da tela. */
export function rotuloDoStatus(status: string): string {
  return ROTULO_POR_STATUS.get(status) ?? status;
}

export type ImportacaoRow = {
  id: number;
  criado_em: string;
  status: string;
  http_status: number;
  origem: string;
  linhas_recebidas: number;
  visitas_gravadas: number;
  leituras_novas: number;
  mensagem: string | null;
};

const FUSO_OPERACIONAL = "-03:00";

type FiltrosSemPagina = Omit<Filtros, "pagina">;

/** `query: any` pelo mesmo motivo das demais telas: `createClient()` (sessão
 * do usuário) não carrega o generic `Database`, então o builder do PostgREST
 * não devolve um tipo próprio para reencadear `.eq()`/`.gte()`/`.lte()`. */
function aplicarFiltros(query: any, filtros: FiltrosSemPagina) {
  let q = query;

  if (filtros.status) q = q.eq("status", filtros.status);
  if (filtros.dataInicial) q = q.gte("criado_em", `${filtros.dataInicial}T00:00:00${FUSO_OPERACIONAL}`);
  if (filtros.dataFinal) q = q.lte("criado_em", `${filtros.dataFinal}T23:59:59${FUSO_OPERACIONAL}`);

  return q;
}

export async function getImportacoes(
  filtros: Filtros,
): Promise<{ rows: ImportacaoRow[]; totalItems: number }> {
  const supabase = await createClient();
  const { from, to } = paginar(filtros.pagina, PAGE_SIZE);

  const query = aplicarFiltros(
    supabase
      .from("importacoes")
      .select(
        "id, criado_em, status, http_status, origem, linhas_recebidas, visitas_gravadas, leituras_novas, mensagem",
        { count: "exact" },
      )
      .order("criado_em", { ascending: false })
      // Desempate obrigatorio: mais de uma linha pode nascer no mesmo
      // segundo (retentativa imediata apos corrigir o lote).
      .order("id", { ascending: false })
      .range(from, to),
    filtros,
  );

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as ImportacaoRow[], totalItems: count ?? 0 };
}

export { formatarDataHora };

export function toTableRow(linha: ImportacaoRow): string[] {
  return [
    formatarDataHora(linha.criado_em),
    rotuloDoStatus(linha.status),
    String(linha.http_status),
    linha.origem,
    String(linha.linhas_recebidas),
    String(linha.visitas_gravadas),
    String(linha.leituras_novas),
    linha.mensagem ?? "",
  ];
}
