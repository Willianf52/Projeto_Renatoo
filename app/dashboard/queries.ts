import { createClient } from "@/lib/supabase/server";

/**
 * Dados do painel inicial. A agregacao mora nas views da migration 0017 --
 * contar visitas por site a partir do PostgREST exigiria trazer as linhas para
 * contar em memoria.
 */

export type ResumoDoMes = {
  visitas: number;
  leituras: number;
  sitesVisitados: number;
};

export type MetaDoSite = {
  siteId: number;
  site: string;
  grupo: string;
  esperadas: number;
  realizadas: number;
};

export async function getResumoDoMes(): Promise<ResumoDoMes> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("resumo_operacional_do_mes")
    .select("visitas, leituras, sites_visitados")
    .maybeSingle();

  // A view agrega sem `group by`, entao devolve uma linha mesmo sem dado
  // nenhum -- mas `maybeSingle` volta null se o RLS recusar tudo.
  return {
    visitas: Number(data?.visitas ?? 0),
    leituras: Number(data?.leituras ?? 0),
    sitesVisitados: Number(data?.sites_visitados ?? 0),
  };
}

/**
 * Meta x realizado por site no mes corrente.
 *
 * Ordenado pelo pior desempenho primeiro: o grafico existe para achar o site
 * que ficou para tras, e enterra-lo no fim da lista seria enterrar a unica
 * informacao acionavel. O desempate por nome mantem a ordem estavel entre
 * recargas quando dois sites tem a mesma razao.
 */
export async function getMetasDoMes(): Promise<MetaDoSite[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("resumo_metas_do_mes")
    .select("site_id, site, grupo, esperadas, realizadas")
    .order("site");

  const linhas = (data ?? []).map((linha) => ({
    siteId: Number(linha.site_id),
    site: String(linha.site),
    grupo: String(linha.grupo),
    esperadas: Number(linha.esperadas),
    realizadas: Number(linha.realizadas),
  }));

  return linhas.sort((a, b) => {
    const razao = (m: MetaDoSite) => (m.esperadas === 0 ? 1 : m.realizadas / m.esperadas);
    return razao(a) - razao(b) || a.site.localeCompare(b.site, "pt-BR");
  });
}

export type TotaisDeCadastro = {
  sitesAtivos: number;
  qrCodesAtivos: number;
};

/** Contagens de cadastro. `head: true` nao traz linha nenhuma -- so o
 * cabecalho com o total, que e tudo que a faixa de indicadores precisa. */
export async function getTotaisDeCadastro(): Promise<TotaisDeCadastro> {
  const supabase = await createClient();

  const [sites, qrCodes] = await Promise.all([
    supabase.from("sites").select("*", { count: "exact", head: true }).eq("ativo", true),
    supabase.from("qr_codes").select("*", { count: "exact", head: true }).eq("ativo", true),
  ]);

  return { sitesAtivos: sites.count ?? 0, qrCodesAtivos: qrCodes.count ?? 0 };
}

/** Soma das metas, para o indicador de cumprimento do mes. */
export function totalizarMetas(metas: MetaDoSite[]) {
  const esperadas = metas.reduce((total, meta) => total + meta.esperadas, 0);
  const realizadas = metas.reduce((total, meta) => total + meta.realizadas, 0);

  return {
    esperadas,
    realizadas,
    // Sem meta cadastrada nao ha percentual a mostrar -- e nao e "0%", que
    // leria como "nada foi feito".
    percentual: esperadas === 0 ? null : Math.round((realizadas / esperadas) * 100),
  };
}

/**
 * Rotulo do mes corrente, no fuso da operacao. Ex: "agosto de 2026".
 *
 * O fuso vai explicito para o rotulo nao discordar do recorte: as views da
 * migration 0017 cortam o mes em -03:00, e sem isto o servidor formataria no
 * proprio fuso -- na virada do mes, a tela diria "agosto" sobre dados de
 * julho. `America/Sao_Paulo` e `-03:00` coincidem desde 2019, quando o Brasil
 * deixou de observar horario de verao; o nome da zona e usado aqui porque
 * `Intl` trabalha com zonas IANA, nao com deslocamentos fixos.
 */
export function rotuloDoMes(agora = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(agora);
}
