import { z } from "zod";
import { lerListaDeEmails } from "@/lib/lista-de-emails";
import { chaveDoNome } from "../grupo-de-sites/importacao";
import { esquemaDeTexto, lerCoordenada, lerRaio } from "./esquema";

/**
 * A regra do Importar sites, sem banco e sem arquivo: recebe as linhas ja
 * lidas do CSV e o que existe no portal, e devolve o PLANO -- o que vira site
 * novo, o que so e completado, o que nao muda e o que esta errado. A action
 * (`importar/actions.ts`) mostra o plano na pre-visualizacao e so o executa
 * quando a pessoa confirma.
 *
 * O FORMATO E O DO EXCEL DE SITE / PLANTA DO SISTEMA ANTIGO (lido em
 * 09/10/2026): 40 colunas de nome tecnico (`id`, `site_superior_id`,
 * `regional`, `nome`, `grupo_sites_nome`, `Hierarquia`...), que e tambem o
 * modelo do "Importar Sites" de la. As colunas sao achadas pelo NOME do
 * cabecalho, sem acento nem maiuscula; so `nome` e obrigatoria, e o que o
 * portal nao tem (perda, prevencao, curva, senhas, e-mails de ocorrencia e de
 * checklist, celulares) e ignorado.
 *
 * DECISAO DO DONO (09/10): COMPLETAR OS QUE JA EXISTEM E CRIAR OS QUE FALTAM.
 *   - Site com o mesmo nome (sem acento, maiuscula nem espaco sobrando) ja no
 *     portal NAO e recriado nem reescrito: so ganha `regional` e site superior,
 *     e so se estiverem VAZIOS la. Valor ja preenchido fica como esta.
 *   - Site sem nome igual e criado, com hierarquia, grupo e as marcacoes.
 *   Nome parecido mas diferente ("RAFARD" e "SICOOB RAFARD") NAO e reconhecido:
 *   vira site novo. Por isso a pre-visualizacao lista os novos.
 *
 * GRUPO: no antigo um site pode estar em varios grupos (`SICREDI;UP Servicos`);
 * aqui `sites.grupo_site_id` guarda um. Fica o grupo MAIS ESPECIFICO, o que
 * tem menos sites no proprio arquivo -- sem nome de grupo escrito a pedra.
 * Sem grupo nenhum, vale o grupo que tem o mesmo nome do site (os "sites de
 * grupo", como SICA e Cooplivre, vem assim).
 *
 * HIERARQUIA: `site_superior_id` e o id do ANTIGO, e se resolve DENTRO do
 * arquivo (coluna `id`). Pai fora do arquivo, ele mesmo ou ciclo sao erro.
 */

export const MAXIMO_DE_LINHAS = 1000;

/** Raio e sigla tem regra propria na importacao -- ver `esquemaDeImportacao`. */
const esquemaDeImportacao = esquemaDeTexto.extend({
  // O portal ja tem 65 sites com sigla acima de 20 (a maior, 36), carregados por
  // importacao, e no antigo a sigla e copia do nome (maior, 44). O limite de 20
  // e do formulario; aqui metade do arquivo seria recusada.
  sigla: z.string().max(50, "A sigla deve ter no máximo 50 caracteres."),
});

export type SiteExistente = {
  id: number;
  nome: string;
  grupoSiteId: number;
  regional: string | null;
  siteSuperiorId: number | null;
};
export type GrupoConhecido = { id: number; nome: string };
export type PessoaConhecida = { id: string; email: string };
export type TipoConhecido = { id: number; nome: string };

export type Referencias = {
  sites: SiteExistente[];
  grupos: GrupoConhecido[];
  pessoas: PessoaConhecida[];
  tipos: TipoConhecido[];
};

/** Quem e o superior: um site que ja existe, ou um novo (resolvido por nome
 * depois que o pai for criado). */
export type SuperiorDoSite = { tipo: "existente"; id: number } | { tipo: "novo"; chave: string } | null;

export type DadosDoSiteNovo = {
  nome: string;
  sigla: string | null;
  grupo_site_id: number;
  tipo_servico_id: number | null;
  responsavel_id: string | null;
  regional: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
  observacao: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  complemento: string | null;
  pais: string;
  raio_metros: number | null;
  cod_cliente: string | null;
  cod_posto: string | null;
  filial: string | null;
  info_adicional_1: string | null;
  info_adicional_2: string | null;
  emails_eventos: string[];
  recebe_visita: boolean;
  gerar_qrcode_automatico: boolean;
  gerar_registro_coletas: boolean;
  ativo: boolean;
};

export type SiteParaCriar = {
  /** Numero da linha na planilha, contando o cabecalho como 1. */
  linha: number;
  chave: string;
  /** 0 = o pai ja existe (ou nao tem); N = N sites novos acima, criados antes. */
  nivel: number;
  superior: SuperiorDoSite;
  superiorNome: string | null;
  grupoNome: string;
  dados: DadosDoSiteNovo;
};

export type SiteParaCompletar = {
  linha: number;
  id: number;
  nome: string;
  /** So preenchido quando o site esta sem regional no portal. */
  regional: string | null;
  /** So preenchido quando o site esta sem superior no portal. */
  superior: SuperiorDoSite;
  superiorNome: string | null;
};

export type LinhaSemMudanca = { linha: number; nome: string; motivo: string };

export type PlanoDeSites =
  | { ok: false; erro: string }
  | {
      ok: true;
      novos: SiteParaCriar[];
      completar: SiteParaCompletar[];
      semMudanca: LinhaSemMudanca[];
      /** Sites novos cujo `email_responsavel` nao e de nenhuma conta do portal. */
      semResponsavel: number;
      erros: { linha: number; mensagem: string }[];
    };

type Linha = {
  linha: number;
  nome: string;
  chave: string;
  idAntigo: string;
  superiorAntigo: string;
  grupos: string[];
  campos: string[];
};

type Destino = { tipo: "existente"; existente: SiteExistente } | { tipo: "novo" };

const SIM = new Set(["sim", "s", "1", "true", "verdadeiro"]);
const NAO = new Set(["nao", "n", "0", "false", "falso"]);

/** `null` = em branco (cai no padrao do banco); `"invalido"` = nao entendi. */
function lerSimNao(valor: string): boolean | null | "invalido" {
  const chave = chaveDoNome(valor);
  if (chave === "") return null;
  if (SIM.has(chave)) return true;
  if (NAO.has(chave)) return false;
  return "invalido";
}

export function planejarImportacaoDeSites(linhas: string[][], ref: Referencias): PlanoDeSites {
  const [cabecalho, ...dados] = linhas;
  if (!cabecalho) return { ok: false, erro: "O arquivo está vazio." };

  const indices = new Map<string, number>();
  cabecalho.forEach((coluna, i) => {
    const chave = chaveDoNome(coluna);
    if (chave && !indices.has(chave)) indices.set(chave, i);
  });
  const coluna = (nome: string) => indices.get(nome) ?? -1;
  const ler = (campos: string[], nome: string) => {
    const i = coluna(nome);
    return i === -1 ? "" : (campos[i] ?? "").trim();
  };

  if (coluna("nome") === -1) {
    return {
      ok: false,
      erro: 'A primeira linha precisa ter a coluna "nome". Use o Excel de Site / Planta do sistema antigo como modelo.',
    };
  }

  const brutas = dados
    .map((campos, i) => ({ linha: i + 2, campos }))
    .filter(({ campos }) => campos.some((celula) => celula.trim() !== ""));
  if (brutas.length === 0) return { ok: false, erro: "O arquivo não tem nenhum site." };
  if (brutas.length > MAXIMO_DE_LINHAS) {
    return { ok: false, erro: `O arquivo passa de ${MAXIMO_DE_LINHAS} linhas. Divida em arquivos menores.` };
  }

  if (coluna("site_superior_id") !== -1 && coluna("id") === -1) {
    const temSuperior = brutas.some(({ campos }) => {
      const valor = ler(campos, "site_superior_id");
      return valor !== "" && valor !== "0";
    });
    if (temSuperior) {
      return {
        ok: false,
        erro: 'O arquivo tem a coluna "site_superior_id" mas não tem a coluna "id": sem ela não dá para saber quem é o superior de cada site.',
      };
    }
  }

  const erros: { linha: number; mensagem: string }[] = [];

  // --- 1. As linhas do arquivo ---------------------------------------------
  const arquivo: Linha[] = [];
  const porChave = new Map<string, Linha>();
  const porIdAntigo = new Map<string, Linha>();

  for (const { linha, campos } of brutas) {
    const nome = ler(campos, "nome").replace(/\s+/g, " ");
    if (!nome) {
      erros.push({ linha, mensagem: "Informe o nome do site." });
      continue;
    }

    const chave = chaveDoNome(nome);
    const repetida = porChave.get(chave);
    if (repetida) {
      erros.push({ linha, mensagem: `"${nome}" repete o site da linha ${repetida.linha}.` });
      continue;
    }

    const idAntigo = ler(campos, "id");
    const mesmoId = idAntigo ? porIdAntigo.get(idAntigo) : undefined;
    if (mesmoId) {
      erros.push({ linha, mensagem: `O id ${idAntigo} já aparece na linha ${mesmoId.linha}.` });
      continue;
    }

    const item: Linha = {
      linha,
      nome,
      chave,
      idAntigo,
      superiorAntigo: ler(campos, "site_superior_id"),
      grupos: ler(campos, "grupo_sites_nome")
        .split(";")
        .map((grupo) => grupo.trim())
        .filter(Boolean),
      campos,
    };
    arquivo.push(item);
    porChave.set(chave, item);
    if (idAntigo) porIdAntigo.set(idAntigo, item);
  }

  // --- 2. Grupo de cada site -----------------------------------------------
  const grupoPorChave = new Map(ref.grupos.map((grupo) => [chaveDoNome(grupo.nome), grupo]));
  const tamanhoDoGrupo = new Map<string, number>();
  for (const item of arquivo) {
    for (const chave of new Set(item.grupos.map(chaveDoNome))) {
      tamanhoDoGrupo.set(chave, (tamanhoDoGrupo.get(chave) ?? 0) + 1);
    }
  }

  function escolherGrupo(item: Linha): { ok: true; grupo: GrupoConhecido } | { ok: false; erro: string } {
    const candidatos = [...new Set(item.grupos.map(chaveDoNome))];

    if (candidatos.length === 0) {
      const proprio = grupoPorChave.get(item.chave);
      return proprio
        ? { ok: true, grupo: proprio }
        : { ok: false, erro: `"${item.nome}" não tem grupo, e não existe um grupo com esse nome.` };
    }

    const conhecidos = candidatos.filter((chave) => grupoPorChave.has(chave));
    if (conhecidos.length === 0) {
      return { ok: false, erro: `Grupo não encontrado no portal: ${item.grupos.join("; ")}.` };
    }

    // O mais especifico: o que tem menos sites no proprio arquivo.
    conhecidos.sort((a, b) => (tamanhoDoGrupo.get(a) ?? 0) - (tamanhoDoGrupo.get(b) ?? 0) || a.localeCompare(b));
    return { ok: true, grupo: grupoPorChave.get(conhecidos[0])! };
  }

  // --- 3. Novo ou ja existente ---------------------------------------------
  const existentesPorChave = new Map<string, SiteExistente[]>();
  for (const site of ref.sites) {
    const chave = chaveDoNome(site.nome);
    existentesPorChave.set(chave, [...(existentesPorChave.get(chave) ?? []), site]);
  }

  const grupoDe = new Map<Linha, ReturnType<typeof escolherGrupo>>();
  const destino = new Map<Linha, Destino>();
  const linhaPorIdExistente = new Map<number, Linha>();

  for (const item of arquivo) {
    const grupo = escolherGrupo(item);
    grupoDe.set(item, grupo);

    const parecidos = existentesPorChave.get(item.chave);
    if (!parecidos) {
      destino.set(item, { tipo: "novo" });
      continue;
    }

    // Mesmo nome em mais de um grupo e permitido no banco (unique e por grupo):
    // vale o do grupo escolhido, ou o mais antigo.
    const doGrupo = grupo.ok ? parecidos.find((site) => site.grupoSiteId === grupo.grupo.id) : undefined;
    const existente = doGrupo ?? [...parecidos].sort((a, b) => a.id - b.id)[0];
    destino.set(item, { tipo: "existente", existente });
    linhaPorIdExistente.set(existente.id, item);
  }

  // --- 4. Hierarquia ---------------------------------------------------------
  const paiDe = new Map<Linha, Linha>();
  for (const item of arquivo) {
    if (item.superiorAntigo === "" || item.superiorAntigo === "0") continue;

    const pai = porIdAntigo.get(item.superiorAntigo);
    if (!pai) {
      erros.push({ linha: item.linha, mensagem: `O site superior (id ${item.superiorAntigo}) não está no arquivo.` });
    } else if (pai === item) {
      erros.push({ linha: item.linha, mensagem: "Um site não pode ser superior de si mesmo." });
    } else {
      paiDe.set(item, pai);
    }
  }

  // Sobe a cadeia como ela ficaria DEPOIS da importacao: site que ja tem
  // superior no portal o mantem; so os sem superior ganham o do arquivo.
  function proximo(item: Linha): Linha | null {
    const d = destino.get(item)!;
    if (d.tipo === "existente" && d.existente.siteSuperiorId !== null) {
      return linhaPorIdExistente.get(d.existente.siteSuperiorId) ?? null;
    }
    return paiDe.get(item) ?? null;
  }

  for (const item of arquivo) {
    const visto = new Set<Linha>([item]);
    let atual = proximo(item);
    while (atual) {
      if (atual === item) {
        erros.push({ linha: item.linha, mensagem: "A hierarquia do arquivo dá uma volta: este site é superior de si mesmo." });
        break;
      }
      if (visto.has(atual)) break;
      visto.add(atual);
      atual = proximo(atual);
    }
  }

  const superiorDe = (item: Linha): { superior: SuperiorDoSite; nome: string | null } => {
    const pai = paiDe.get(item);
    if (!pai) return { superior: null, nome: null };
    const d = destino.get(pai)!;
    return {
      superior: d.tipo === "existente" ? { tipo: "existente", id: d.existente.id } : { tipo: "novo", chave: pai.chave },
      nome: pai.nome,
    };
  };

  // --- 5. Montar o plano -----------------------------------------------------
  const pessoaPorEmail = new Map(ref.pessoas.map((p) => [p.email.trim().toLowerCase(), p.id]));
  const tipoPorChave = new Map(ref.tipos.map((t) => [chaveDoNome(t.nome), t.id]));

  const novos: Omit<SiteParaCriar, "nivel">[] = [];
  const completar: SiteParaCompletar[] = [];
  const semMudanca: LinhaSemMudanca[] = [];
  let semResponsavel = 0;

  for (const item of arquivo) {
    const d = destino.get(item)!;
    const { superior, nome: superiorNome } = superiorDe(item);
    const regional = ler(item.campos, "regional");

    if (d.tipo === "existente") {
      if (regional.length > 100) {
        erros.push({ linha: item.linha, mensagem: "A regional deve ter no máximo 100 caracteres." });
        continue;
      }

      const preencherRegional = !(d.existente.regional ?? "").trim() && regional !== "";
      const preencherSuperior = d.existente.siteSuperiorId === null && superior !== null;

      if (!preencherRegional && !preencherSuperior) {
        semMudanca.push({
          linha: item.linha,
          nome: item.nome,
          motivo: "já existe, e a regional e o superior já estão preenchidos ou não vêm no arquivo",
        });
        continue;
      }

      completar.push({
        linha: item.linha,
        id: d.existente.id,
        nome: d.existente.nome,
        regional: preencherRegional ? regional : null,
        superior: preencherSuperior ? superior : null,
        superiorNome: preencherSuperior ? superiorNome : null,
      });
      continue;
    }

    // --- Site novo: valida tudo, como o formulario ---
    const grupo = grupoDe.get(item)!;
    if (!grupo.ok) {
      erros.push({ linha: item.linha, mensagem: grupo.erro });
      continue;
    }

    const uf = ler(item.campos, "uf").toUpperCase();
    const textoValidado = esquemaDeImportacao.safeParse({
      nome: item.nome,
      sigla: ler(item.campos, "sigla"),
      regional,
      cidade: ler(item.campos, "cidade"),
      observacao: ler(item.campos, "observacao"),
      cep: ler(item.campos, "cep"),
      endereco: ler(item.campos, "endereco"),
      numero: ler(item.campos, "numero"),
      bairro: ler(item.campos, "bairro"),
      complemento: ler(item.campos, "complemento"),
      pais: "",
      codCliente: ler(item.campos, "cod_cliente"),
      codPosto: ler(item.campos, "cod_posto"),
      filial: ler(item.campos, "filial"),
      infoAdicional1: ler(item.campos, "informacoes_adicionais_1"),
      infoAdicional2: ler(item.campos, "informacoes_adicionais_2"),
    });
    if (!textoValidado.success) {
      erros.push({ linha: item.linha, mensagem: textoValidado.error.issues[0].message });
      continue;
    }
    const texto = textoValidado.data;

    if (uf !== "" && !/^[A-Z]{2}$/.test(uf)) {
      erros.push({ linha: item.linha, mensagem: "A UF deve ter exatamente 2 letras (ex: SP)." });
      continue;
    }

    const raio = lerRaio(ler(item.campos, "raio"));
    if (!raio.ok) {
      erros.push({ linha: item.linha, mensagem: raio.erro });
      continue;
    }
    const latitude = lerCoordenada(ler(item.campos, "latitude"), 90, "A latitude");
    if (!latitude.ok) {
      erros.push({ linha: item.linha, mensagem: latitude.erro });
      continue;
    }
    const longitude = lerCoordenada(ler(item.campos, "longitude"), 180, "A longitude");
    if (!longitude.ok) {
      erros.push({ linha: item.linha, mensagem: longitude.erro });
      continue;
    }

    const emails = lerListaDeEmails(ler(item.campos, "emails_eventos"), 20, "e-mails de eventos");
    if (!emails.ok) {
      erros.push({ linha: item.linha, mensagem: emails.erro });
      continue;
    }

    const status = chaveDoNome(ler(item.campos, "status"));
    if (status !== "" && status !== "ativo" && status !== "inativo") {
      erros.push({ linha: item.linha, mensagem: 'O status deve ser "Ativo" ou "Inativo".' });
      continue;
    }

    const qr = lerSimNao(ler(item.campos, "qrcode"));
    const coletas = lerSimNao(ler(item.campos, "gerar_local_coleta_importada"));
    if (qr === "invalido" || coletas === "invalido") {
      erros.push({
        linha: item.linha,
        mensagem: `${qr === "invalido" ? "qrcode" : "gerar_local_coleta_importada"} deve ser "Sim" ou "Não".`,
      });
      continue;
    }

    let tipoServicoId: number | null = null;
    const tipoNome = ler(item.campos, "tipos_servicos").split(/[;,]/)[0]?.trim() ?? "";
    if (tipoNome) {
      const achado = tipoPorChave.get(chaveDoNome(tipoNome));
      if (achado === undefined) {
        erros.push({ linha: item.linha, mensagem: `Tipo de serviço não encontrado no portal: ${tipoNome}.` });
        continue;
      }
      tipoServicoId = achado;
    }

    const emailDoResponsavel = ler(item.campos, "email_responsavel").toLowerCase();
    const responsavelId = emailDoResponsavel ? (pessoaPorEmail.get(emailDoResponsavel) ?? null) : null;
    if (emailDoResponsavel && responsavelId === null) semResponsavel += 1;

    novos.push({
      linha: item.linha,
      chave: item.chave,
      superior,
      superiorNome,
      grupoNome: grupo.grupo.nome,
      dados: {
        nome: item.nome,
        sigla: texto.sigla || null,
        grupo_site_id: grupo.grupo.id,
        tipo_servico_id: tipoServicoId,
        responsavel_id: responsavelId,
        regional: texto.regional || null,
        cidade: texto.cidade || null,
        uf: uf || null,
        latitude: latitude.valor,
        longitude: longitude.valor,
        observacao: texto.observacao || null,
        cep: texto.cep || null,
        endereco: texto.endereco || null,
        numero: texto.numero || null,
        bairro: texto.bairro || null,
        complemento: texto.complemento || null,
        pais: "Brasil",
        // "0" e como o antigo guarda "sem raio": um raio de zero metro, aqui,
        // seria uma cerca que nenhuma leitura cumpre.
        raio_metros: raio.valor === 0 ? null : raio.valor,
        cod_cliente: texto.codCliente || null,
        cod_posto: texto.codPosto || null,
        filial: texto.filial || null,
        info_adicional_1: texto.infoAdicional1 || null,
        info_adicional_2: texto.infoAdicional2 || null,
        emails_eventos: emails.emails,
        recebe_visita: true,
        gerar_qrcode_automatico: qr ?? true,
        gerar_registro_coletas: coletas ?? false,
        ativo: status !== "inativo",
      },
    });
  }

  // --- 6. Ordem de criacao: o pai antes do filho --------------------------
  const nivelDe = new Map<string, number>();
  const linhaPorChave = new Map(arquivo.map((item) => [item.chave, item]));
  const calcularNivel = (chave: string, profundidade = 0): number => {
    const memo = nivelDe.get(chave);
    if (memo !== undefined) return memo;
    // Teto contra ciclo que escapou: ja e erro, mas nunca trava.
    if (profundidade > arquivo.length) return 0;

    const item = linhaPorChave.get(chave)!;
    const pai = paiDe.get(item);
    const paiNovo = pai && destino.get(pai)?.tipo === "novo" ? pai : null;
    const nivel = paiNovo ? calcularNivel(paiNovo.chave, profundidade + 1) + 1 : 0;
    nivelDe.set(chave, nivel);
    return nivel;
  };

  const novosOrdenados = novos
    .map((site) => ({ ...site, nivel: calcularNivel(site.chave) }))
    .sort((a, b) => a.nivel - b.nivel || a.linha - b.linha);

  return { ok: true, novos: novosOrdenados, completar, semMudanca, semResponsavel, erros };
}
