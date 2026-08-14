import { createClient } from "@/lib/supabase/server";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export type Filtros = {
  /** "yyyy-mm". Sem valor -> mes atual (ver extrairFiltros). */
  mes: string;
  site?: string;
};

const MES_ATUAL = () => {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
};

/** Igual as demais telas: mes fora do formato yyyy-mm (ou com mes fora de
 * 01-12, tipo "2026-13") cai no mes atual em vez de virar uma consulta que
 * nunca bate com nada. */
function mesValido(valor: string | undefined): valor is string {
  if (!valor) return false;
  const encontrado = /^\d{4}-(\d{2})$/.exec(valor);
  if (!encontrado) return false;
  const mes = Number(encontrado[1]);
  return mes >= 1 && mes <= 12;
}

export function extrairFiltros(params: SearchParams): Filtros {
  const mes = primeiro(params.mes);
  return {
    mes: mesValido(mes) ? mes : MES_ATUAL(),
    site: primeiro(params.site),
  };
}

export type Opcao = { value: string; label: string };

/** Sites para o select do filtro, com o grupo no rotulo -- mesmo padrao de
 * "Grupo - Site" usado nos demais selects de site do app. */
type SiteBruto = {
  id: number;
  nome: string;
  grupos_sites: { nome: string } | null;
};

export async function getOpcoesSites(): Promise<Opcao[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("sites")
    .select("id, nome, grupos_sites ( nome )")
    .eq("ativo", true)
    .order("nome");

  return ((data ?? []) as unknown as SiteBruto[]).map((site) => ({
    value: String(site.id),
    label: site.grupos_sites?.nome ? `${site.grupos_sites.nome} - ${site.nome}` : site.nome,
  }));
}

export type VisitaDeSupervisao = {
  visitaId: number;
  /** Leitura mais antiga da visita (tipicamente a de "Inicio"). */
  dataHora: string | null;
  funcionario: string;
  local: string;
  temLocalizacao: boolean;
  motivoVisita: string;
  observacao: string;
};

export type HistoricoDeSupervisao = {
  meta: number | null;
  realizado: number;
  visitas: VisitaDeSupervisao[];
};

type LeituraBruta = {
  id: number;
  data_hora: string;
  tem_localizacao: boolean;
  observacao: string | null;
  visitas: {
    id: number;
    profiles: { nome_completo: string } | null;
    motivos_visita: { nome: string } | null;
    sites: { nome: string } | null;
  } | null;
};

/**
 * Uma visita normalmente tem duas leituras (Inicio e Termino, ver migration
 * 0004) e o relatorio mostra uma linha por VISITA, nao por leitura -- por
 * isso o agrupamento em memoria em vez de devolver a leitura crua. Sem uma
 * `group by` no Postgres/PostgREST para "uma linha por visita com o dado da
 * leitura mais antiga", isto teria que ser uma view ou funcao no banco; feito
 * aqui porque o volume por mes/site e pequeno (visitas de supervisao, nao
 * o historico inteiro de coletas).
 */
function agruparPorVisita(leituras: LeituraBruta[]): VisitaDeSupervisao[] {
  const porVisita = new Map<number, VisitaDeSupervisao>();

  for (const leitura of leituras) {
    const visita = leitura.visitas;
    if (!visita) continue;

    const atual = porVisita.get(visita.id);
    const ehMaisAntiga = !atual || !atual.dataHora || leitura.data_hora < atual.dataHora;

    if (!atual) {
      porVisita.set(visita.id, {
        visitaId: visita.id,
        dataHora: leitura.data_hora,
        funcionario: visita.profiles?.nome_completo ?? "",
        local: visita.sites?.nome ?? "",
        temLocalizacao: leitura.tem_localizacao,
        motivoVisita: visita.motivos_visita?.nome ?? "",
        observacao: leitura.observacao ?? "",
      });
    } else {
      // Localizacao e observacao vem de qualquer leitura da visita que as
      // tenha, nao so da mais antiga -- um sinal perdido no Inicio nao deve
      // esconder um sinal obtido no Termino.
      if (leitura.tem_localizacao) atual.temLocalizacao = true;
      if (!atual.observacao && leitura.observacao) atual.observacao = leitura.observacao;
      if (ehMaisAntiga) atual.dataHora = leitura.data_hora;
    }
  }

  return Array.from(porVisita.values()).sort((a, b) =>
    (b.dataHora ?? "").localeCompare(a.dataHora ?? ""),
  );
}

/**
 * Fuso da operacao (Brasilia), mesmo criterio de FUSO_OPERACIONAL em
 * coletas-importadas/queries.ts: fixo em -03:00 porque o Brasil nao observa
 * mais horario de verao desde 2019. Sem o deslocamento explicito, o limite
 * do mes seria calculado em UTC e uma visita no fim do dia (horario local)
 * cairia no mes seguinte do relatorio.
 */
const FUSO_OPERACIONAL = "-03:00";

/**
 * `site` obrigatorio: Meta e Realizado sao por site (metas_visitas.site_id),
 * entao sem site escolhido nao ha o que calcular -- ver a checagem em
 * page.tsx antes de chamar isto.
 */
export async function getHistoricoDeSupervisao(filtros: Filtros): Promise<HistoricoDeSupervisao> {
  const supabase = await createClient();

  const [ano, mes] = filtros.mes.split("-").map(Number);
  const anoFim = mes === 12 ? ano + 1 : ano;
  const mesFim = mes === 12 ? 1 : mes + 1;
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01T00:00:00${FUSO_OPERACIONAL}`;
  const fim = `${anoFim}-${String(mesFim).padStart(2, "0")}-01T00:00:00${FUSO_OPERACIONAL}`;
  const competencia = `${ano}-${String(mes).padStart(2, "0")}-01`;

  const [leiturasResultado, metaResultado] = await Promise.all([
    supabase
      .from("leituras")
      .select(
        `
          id, data_hora, tem_localizacao, observacao,
          visitas!inner (
            id,
            profiles ( nome_completo ),
            motivos_visita ( nome ),
            sites ( nome )
          )
        `,
      )
      .eq("visitas.site_id", Number(filtros.site))
      .gte("data_hora", inicio)
      .lt("data_hora", fim),
    // Visivel so para gestao (RLS da 0014): um CLIENTE simplesmente nao
    // recebe linha nenhuma aqui, e "meta: null" -> "-" e exatamente o
    // comportamento certo para quem nao tem acesso a meta contratada.
    supabase
      .from("metas_visitas")
      .select("quantidade_esperada")
      .eq("site_id", Number(filtros.site))
      .eq("competencia", competencia)
      .maybeSingle(),
  ]);

  const visitas = agruparPorVisita((leiturasResultado.data ?? []) as unknown as LeituraBruta[]);

  return {
    meta: metaResultado.data?.quantidade_esperada ?? null,
    realizado: visitas.length,
    visitas,
  };
}
