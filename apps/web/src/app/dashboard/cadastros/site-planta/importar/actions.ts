"use server";

import { revalidatePath } from "next/cache";
import { lerCsv } from "@/lib/csv";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import { createClient } from "@/lib/supabase/server";
import {
  planejarImportacaoDeSites,
  type PlanoDeSites,
  type SiteExistente,
  type SuperiorDoSite,
} from "../importacao";

const LISTAGEM = "/dashboard/cadastros/site-planta";

/**
 * Abaixo do teto de 1 MB do corpo de uma Server Action. O Excel do antigo
 * (246 sites, 40 colunas) tem cerca de 40 KB.
 */
const TAMANHO_MAXIMO = 512 * 1024;

/** O que a pre-visualizacao mostra. Nada disto foi gravado. */
export type ResumoDaPrevia = {
  novos: { linha: number; nome: string; grupo: string; superior: string | null }[];
  completar: { linha: number; nome: string; regional: string | null; superior: string | null }[];
  semMudanca: number;
  semResponsavel: number;
};

export type ResultadoDaImportacaoDeSites = { criados: number; completados: number };

export type EstadoDaImportacaoDeSites = {
  erro?: string;
  /** Linhas do arquivo com problema: com qualquer uma, nada e importado. */
  erros?: { linha: number; mensagem: string }[];
  previa?: ResumoDaPrevia;
  resultado?: ResultadoDaImportacaoDeSites;
};

const MENSAGENS_DE_ERRO = {
  // So acontece se alguem cadastrar o mesmo site entre a leitura e o insert.
  duplicado:
    "Um dos sites foi cadastrado por outra pessoa enquanto o arquivo era enviado. Envie o arquivo de novo: o que já entrou não é repetido.",
  semPermissao: "Você não tem permissão para cadastrar sites.",
  fkInvalida: "Um grupo, tipo de serviço, responsável ou superior deixou de existir. Envie o arquivo de novo.",
  generico: "Não foi possível importar os sites. Tente novamente.",
};

export async function importarSites(
  _estado: EstadoDaImportacaoDeSites,
  formData: FormData,
): Promise<EstadoDaImportacaoDeSites> {
  // A tela ja nao aparece para quem nao administra, mas a action e um endpoint
  // proprio. O RLS tambem recusaria a escrita: esta checagem so troca o erro
  // cru por uma frase.
  if (!(await podeAdministrarCadastros())) return { erro: MENSAGENS_DE_ERRO.semPermissao };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o arquivo .csv com os sites." };
  }
  if (!arquivo.name.toLowerCase().endsWith(".csv")) {
    return { erro: "O arquivo precisa ser .csv. No Excel: Arquivo › Salvar como › CSV." };
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { erro: "O arquivo passa de 512 KB. Divida em arquivos menores." };
  }

  // Sem o campo, so mostra o plano: gravar exige pedir "importar".
  const importar = String(formData.get("modo") ?? "") === "importar";

  const idRequisicao = gerarIdDeRequisicao();
  const supabase = await createClient();

  let plano: PlanoDeSites;
  try {
    const [sites, grupos, pessoas, tipos] = await Promise.all([
      buscarEmPaginas<{
        id: number;
        nome: string;
        grupo_site_id: number;
        regional: string | null;
        site_superior_id: number | null;
      }>((de, ate) =>
        supabase
          .from("sites")
          .select("id, nome, grupo_site_id, regional, site_superior_id")
          .order("id")
          .range(de, ate),
      ),
      buscarEmPaginas<{ id: number; nome: string }>((de, ate) =>
        supabase.from("grupos_sites").select("id, nome").order("id").range(de, ate),
      ),
      buscarEmPaginas<{ id: string; email: string }>((de, ate) =>
        supabase.from("profiles").select("id, email").eq("ativo", true).order("id").range(de, ate),
      ),
      buscarEmPaginas<{ id: number; nome: string }>((de, ate) =>
        supabase.from("tipos_servico").select("id, nome").eq("ativo", true).order("id").range(de, ate),
      ),
    ]);

    plano = planejarImportacaoDeSites(lerCsv(decodificar(await arquivo.arrayBuffer())), {
      sites: sites.linhas.map(
        (s): SiteExistente => ({
          id: s.id,
          nome: s.nome,
          grupoSiteId: s.grupo_site_id,
          regional: s.regional,
          siteSuperiorId: s.site_superior_id,
        }),
      ),
      grupos: grupos.linhas,
      pessoas: pessoas.linhas,
      tipos: tipos.linhas,
    });
  } catch (falha) {
    registrarErro(idRequisicao, "Importar sites: falha ao ler o que ja existe:", falha);
    return { erro: MENSAGENS_DE_ERRO.generico };
  }

  if (!plano.ok) return { erro: plano.erro };

  /**
   * TUDO OU NADA quando ha linha com erro, como no Importar de grupos:
   * importar so as boas deixaria a pessoa com metade do cadastro dentro e a
   * duvida de quais entraram -- e um site cujo pai falhou nasceria solto.
   */
  if (plano.erros.length > 0) {
    return {
      erro: "Nenhum site foi importado. Corrija as linhas abaixo e envie o arquivo de novo.",
      erros: plano.erros,
    };
  }

  if (!importar) return { previa: resumir(plano) };

  const feito = await executar(supabase, plano, idRequisicao);
  if (!feito.ok) return { erro: feito.erro };

  revalidatePath(LISTAGEM);
  revalidatePath("/dashboard/cadastros/grupo-de-sites");

  return { resultado: { criados: feito.criados, completados: feito.completados } };
}

function resumir(plano: Extract<PlanoDeSites, { ok: true }>): ResumoDaPrevia {
  return {
    novos: plano.novos.map((s) => ({
      linha: s.linha,
      nome: s.dados.nome,
      grupo: s.grupoNome,
      superior: s.superiorNome,
    })),
    completar: plano.completar.map((s) => ({
      linha: s.linha,
      nome: s.nome,
      regional: s.regional,
      superior: s.superiorNome,
    })),
    semMudanca: plano.semMudanca.length,
    semResponsavel: plano.semResponsavel,
  };
}

/**
 * Grava o plano. Os novos entram NIVEL A NIVEL (primeiro os sem pai novo, depois
 * os filhos deles...): cada insert e uma instrucao, entao atomico, e o filho so
 * e enviado quando o pai ja tem id. Os que ja existiam recebem regional e
 * superior em updates agrupados pelo mesmo valor.
 *
 * NAO e uma transacao unica: se algo falhar no meio, o que ja entrou fica. E
 * seguro reenviar o arquivo -- o site que ja entrou casa pelo nome e so e
 * completado, nunca duplicado -- e a mensagem diz isso.
 */
async function executar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  plano: Extract<PlanoDeSites, { ok: true }>,
  idRequisicao: string,
): Promise<{ ok: true; criados: number; completados: number } | { ok: false; erro: string }> {
  const idPorChave = new Map<string, number>();
  let criados = 0;
  let completados = 0;

  const resolver = (superior: SuperiorDoSite): number | null => {
    if (superior === null) return null;
    if (superior.tipo === "existente") return superior.id;
    return idPorChave.get(superior.chave) ?? null;
  };

  const paradaNoMeio = (mensagem: string) =>
    criados + completados === 0
      ? mensagem
      : `${mensagem} A importação parou no meio (${criados} ${criados === 1 ? "site criado" : "sites criados"}, ${completados} completados). Envie o arquivo de novo: o que já entrou não é repetido.`;

  const niveis = [...new Set(plano.novos.map((s) => s.nivel))].sort((a, b) => a - b);

  for (const nivel of niveis) {
    const doNivel = plano.novos.filter((s) => s.nivel === nivel);
    const chavePorNomeEGrupo = new Map(doNivel.map((s) => [`${s.dados.grupo_site_id}|${s.dados.nome}`, s.chave]));

    const { data, error } = await supabase
      .from("sites")
      .insert(doNivel.map((s) => ({ ...s.dados, site_superior_id: resolver(s.superior) })))
      .select("id, nome, grupo_site_id");

    if (error) {
      registrarErro(idRequisicao, `Importar sites: insert do nivel ${nivel} recusado:`, error);
      return { ok: false, erro: paradaNoMeio(traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO)) };
    }

    for (const criado of data ?? []) {
      const chave = chavePorNomeEGrupo.get(`${criado.grupo_site_id}|${criado.nome}`);
      if (chave) idPorChave.set(chave, criado.id);
    }
    criados += data?.length ?? 0;
  }

  // Os que ja existiam: um update por combinacao de valores (sao poucas).
  const lotes = new Map<string, { regional: string | null; superiorId: number | null; ids: number[] }>();
  for (const site of plano.completar) {
    const superiorId = resolver(site.superior);
    if (site.superior !== null && superiorId === null) {
      return { ok: false, erro: paradaNoMeio(MENSAGENS_DE_ERRO.generico) };
    }
    const chave = `${site.regional ?? ""}|${superiorId ?? ""}`;
    const lote = lotes.get(chave) ?? { regional: site.regional, superiorId, ids: [] };
    lote.ids.push(site.id);
    lotes.set(chave, lote);
  }

  for (const lote of lotes.values()) {
    const alteracao: { regional?: string; site_superior_id?: number } = {};
    if (lote.regional !== null) alteracao.regional = lote.regional;
    if (lote.superiorId !== null) alteracao.site_superior_id = lote.superiorId;

    // `.select()` nao e enfeite: um UPDATE barrado pelo RLS devolve zero linhas, nao erro.
    const { data, error } = await supabase.from("sites").update(alteracao).in("id", lote.ids).select("id");

    if (error) {
      registrarErro(idRequisicao, "Importar sites: update recusado:", error);
      return { ok: false, erro: paradaNoMeio(traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO)) };
    }
    if ((data?.length ?? 0) !== lote.ids.length) {
      return { ok: false, erro: paradaNoMeio(MENSAGENS_DE_ERRO.semPermissao) };
    }
    completados += lote.ids.length;
  }

  return { ok: true, criados, completados };
}

/**
 * UTF-8 primeiro (o "CSV UTF-8" do Excel). Se nao for UTF-8 valido, cai para
 * Windows-1252, o que o Excel em pt-BR grava no "CSV (separado por virgulas)":
 * sem este ramo, "Hiraço" chegaria como "Hira��o".
 */
function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
