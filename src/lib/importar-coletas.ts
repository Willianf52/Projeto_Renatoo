/**
 * Leitura e validacao do lote de coletas enviado pela rota de importacao.
 *
 * Separado da rota pelo mesmo motivo de `lib/webhook-user-updated.ts`: da pra
 * testar o formato inteiro sem cliente do Supabase, sem service_role e sem
 * banco.
 *
 * O formato de entrada espelha a *saida* da tela de Coletas Importadas -- uma
 * linha achatada por leitura, com as referencias por nome e nao por id. Ids
 * internos nao existem do lado de quem exporta, e exigi-los tornaria o lote
 * impossivel de montar a partir de um relatorio do sistema de origem.
 */

import {
  chaveDaVisita,
  LIMITE_DO_LOTE,
  LIMITE_EMAIL,
  LIMITE_NOME,
  LIMITE_OBSERVACAO,
  normalizarInstante,
  temCoordenada,
} from "@projeto-renatoo/shared";

/**
 * Os limites, a regra de fuso e a derivacao de `tem_localizacao` moram em
 * `@projeto-renatoo/shared` porque o app dos inspetores aplica exatamente as
 * mesmas no formulario de campo. Mante-las duplicadas aqui era o caminho
 * curto para as duas versoes divergirem sem ninguem perceber -- um lote
 * aceito pela rota e recusado pelo app, ou pior, o contrario.
 *
 * As *mensagens* continuam sendo daqui: o publico desta rota e quem integra
 * por JSON e precisa saber o nome do campo que falhou (`"data_hora"`), nao o
 * inspetor lendo um rotulo de tela.
 */
export { LIMITE_DO_LOTE, chaveDaVisita };

export type ColetaImportada = {
  numeroColeta: number;
  site: string;
  funcionarioEmail: string | null;
  motivoVisita: string | null;
  coletorDados: string | null;
  area: string | null;
  qrCode: string | null;
  dataHora: string;
  evento: string | null;
  acao: string | null;
  qualificador: string | null;
  observacao: string | null;
  dataIntegracao: string | null;
  /** O aparelho obteve sinal ao registrar a leitura (migration 0023).
   * Derivado da presenca de `latitude`/`longitude` no lote -- a coordenada
   * em si nao e guardada desde a 0022. */
  temLocalizacao: boolean;
};

export type ResultadoDaLeitura =
  | { ok: true; coletas: ColetaImportada[] }
  | { ok: false; erro: string };

function textoOpcional(
  valor: unknown,
  campo: string,
  limite = LIMITE_NOME,
): { ok: true; valor: string | null } | { ok: false; erro: string } {
  if (valor === undefined || valor === null || valor === "") return { ok: true, valor: null };
  if (typeof valor !== "string") return { ok: false, erro: `"${campo}" deve ser texto` };

  const texto = valor.trim();
  if (texto === "") return { ok: true, valor: null };
  if (texto.length > limite) {
    return { ok: false, erro: `"${campo}" deve ter no máximo ${limite} caracteres` };
  }

  return { ok: true, valor: texto };
}

/**
 * Timestamp com deslocamento de fuso obrigatorio. A regra em si e
 * `normalizarInstante` do pacote compartilhado -- o mesmo cuidado que
 * `combinarDataHora` toma nos filtros da tela (coletas-importadas/queries.ts).
 * Aqui so a traducao do motivo para a mensagem desta rota.
 */
function instante(
  valor: unknown,
  campo: string,
  obrigatorio: boolean,
): { ok: true; valor: string | null } | { ok: false; erro: string } {
  if (valor === undefined || valor === null || valor === "") {
    if (obrigatorio) return { ok: false, erro: `"${campo}" é obrigatório` };
    return { ok: true, valor: null };
  }

  if (typeof valor !== "string") return { ok: false, erro: `"${campo}" deve ser texto` };

  const resultado = normalizarInstante(valor);
  if (!resultado.ok) {
    return {
      ok: false,
      erro:
        resultado.motivo === "sem-fuso"
          ? `"${campo}" precisa terminar com o fuso (ex: 2026-08-01T08:12:00-03:00)`
          : `"${campo}" não é uma data/hora válida`,
    };
  }

  return { ok: true, valor: resultado.iso };
}

function lerColeta(valor: unknown): { ok: true; coleta: ColetaImportada } | { ok: false; erro: string } {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    return { ok: false, erro: "cada item deve ser um objeto" };
  }

  const bruto = valor as Record<string, unknown>;

  const numeroBruto =
    typeof bruto.numero_coleta === "string" ? Number(bruto.numero_coleta) : bruto.numero_coleta;
  if (typeof numeroBruto !== "number" || !Number.isInteger(numeroBruto) || numeroBruto <= 0) {
    return { ok: false, erro: '"numero_coleta" deve ser um inteiro positivo' };
  }

  const site = textoOpcional(bruto.site, "site");
  if (!site.ok) return site;
  if (!site.valor) return { ok: false, erro: '"site" é obrigatório' };

  const dataHora = instante(bruto.data_hora, "data_hora", true);
  if (!dataHora.ok) return dataHora;

  const dataIntegracao = instante(bruto.data_integracao, "data_integracao", false);
  if (!dataIntegracao.ok) return dataIntegracao;

  // `latitude` e `longitude` continuam sendo ACEITAS no corpo do lote (0022):
  // recusar quebraria quem ja integra. A coordenada nao e guardada, mas a
  // PRESENCA dela vira `tem_localizacao` (0023), que e o que o filtro
  // Com/Sem Localizacao da tela sempre precisou -- ele nunca mostrou o
  // numero. Ver docs/importacao-de-coletas.md.
  //
  // Sem validar intervalo: nao guardamos o valor, entao uma latitude 91 nao
  // corrompe nada -- e recusar o lote por causa dela seria rigor sobre um
  // campo que o sistema declarou nao usar.
  const temLocalizacao = temCoordenada(bruto.latitude) && temCoordenada(bruto.longitude);

  const opcionais = {
    funcionarioEmail: textoOpcional(bruto.funcionario_email, "funcionario_email", LIMITE_EMAIL),
    motivoVisita: textoOpcional(bruto.motivo_visita, "motivo_visita"),
    coletorDados: textoOpcional(bruto.coletor_dados, "coletor_dados"),
    area: textoOpcional(bruto.area, "area"),
    qrCode: textoOpcional(bruto.qr_code, "qr_code"),
    evento: textoOpcional(bruto.evento, "evento"),
    acao: textoOpcional(bruto.acao, "acao"),
    qualificador: textoOpcional(bruto.qualificador, "qualificador"),
    observacao: textoOpcional(bruto.observacao, "observacao", LIMITE_OBSERVACAO),
  };

  for (const resultado of Object.values(opcionais)) {
    if (!resultado.ok) return resultado;
  }

  // O laco acima ja garantiu que todos deram certo; o TypeScript nao consegue
  // estreitar o tipo atraves de Object.values, daí a assercao.
  const valores = opcionais as unknown as Record<keyof typeof opcionais, { valor: string | null }>;

  return {
    ok: true,
    coleta: {
      numeroColeta: numeroBruto,
      site: site.valor,
      dataHora: dataHora.valor as string,
      dataIntegracao: dataIntegracao.valor,
      funcionarioEmail: valores.funcionarioEmail.valor,
      motivoVisita: valores.motivoVisita.valor,
      coletorDados: valores.coletorDados.valor,
      area: valores.area.valor,
      qrCode: valores.qrCode.valor,
      evento: valores.evento.valor,
      acao: valores.acao.valor,
      qualificador: valores.qualificador.valor,
      observacao: valores.observacao.valor,
      temLocalizacao,
    },
  };
}

/**
 * Aceita tanto `{ "coletas": [...] }` quanto um array cru no corpo. O envelope
 * e o formato documentado; o array solto e aceito porque e o que sai de um
 * `JSON.stringify` de planilha convertida, e recusa-lo nao protegeria nada.
 */
export function lerLoteDeColetas(valor: unknown): ResultadoDaLeitura {
  const lista = Array.isArray(valor)
    ? valor
    : typeof valor === "object" && valor !== null
      ? (valor as Record<string, unknown>).coletas
      : undefined;

  if (!Array.isArray(lista)) {
    return { ok: false, erro: 'corpo deve ser um array ou { "coletas": [...] }' };
  }

  if (lista.length === 0) return { ok: false, erro: "lote vazio" };
  if (lista.length > LIMITE_DO_LOTE) {
    return {
      ok: false,
      erro: `lote com ${lista.length} linhas excede o limite de ${LIMITE_DO_LOTE}; divida em partes`,
    };
  }

  const coletas: ColetaImportada[] = [];
  for (const [indice, item] of lista.entries()) {
    const resultado = lerColeta(item);
    // O indice vai na mensagem porque um lote de mil linhas com "campo
    // obrigatorio ausente" e indistinguivel de ruido: sem a posicao, quem
    // enviou nao tem por onde comecar a procurar.
    if (!resultado.ok) return { ok: false, erro: `linha ${indice + 1}: ${resultado.erro}` };
    coletas.push(resultado.coleta);
  }

  return { ok: true, coletas };
}

export type IndicePorNome = {
  mapa: Map<string, number>;
  /** Nomes que aparecem em mais de uma linha -- ver `ambiguos` abaixo. */
  ambiguos: Set<string>;
};

/**
 * Indexa uma tabela de referencia por nome para resolver os nomes do lote em
 * ids. A comparacao ignora caixa (mas nao acento): "início" e "Início" sao o
 * mesmo registro, "Inicio" sem acento nao e.
 *
 * Perdoar o acento tambem exigiria normalizar, e ai "Ação" e "Acao" virariam
 * a mesma coisa -- o que e conveniente ate o dia em que dois registros
 * legitimos colidem e um sobrescreve o outro em silencio.
 *
 * `ambiguos` existe por causa de `sites`: das tabelas consultadas aqui, e a
 * unica cujo nome nao e `unique` no banco (migration 0003 -- so o par
 * grupo/nome faria sentido, e nem esse foi declarado). Duas unidades chamadas
 * "Agencia Centro" em grupos diferentes sao um cadastro legitimo, e escolher
 * uma delas pela ordem que o banco devolveu penduraria a visita no site
 * errado sem erro nenhum. Melhor recusar a linha e pedir desambiguacao.
 */
export function indexarPorNome<T extends { id: number }>(
  linhas: T[] | null,
  campo: keyof T,
): IndicePorNome {
  const mapa = new Map<string, number>();
  const ambiguos = new Set<string>();

  for (const linha of linhas ?? []) {
    const nome = linha[campo];
    if (typeof nome !== "string") continue;

    const chave = nome.toLowerCase();
    if (mapa.has(chave)) {
      ambiguos.add(chave);
      continue;
    }
    mapa.set(chave, linha.id);
  }

  return { mapa, ambiguos };
}

/**
 * Resolve um nome do lote no id correspondente. Devolve o motivo em vez de
 * `null` silencioso: nome desconhecido virando FK nula faria a coleta entrar
 * com a coluna vazia na tela, indistinguivel de um campo que o dispositivo
 * legitimamente nao preencheu.
 */
export function resolverReferencia(
  indice: IndicePorNome,
  nome: string | null,
  rotulo: string,
): { ok: true; id: number | null } | { ok: false; erro: string } {
  if (nome === null) return { ok: true, id: null };

  const chave = nome.toLowerCase();
  if (indice.ambiguos.has(chave)) {
    return { ok: false, erro: `${rotulo} "${nome}" corresponde a mais de um cadastro` };
  }

  const id = indice.mapa.get(chave);
  if (id === undefined) return { ok: false, erro: `${rotulo} "${nome}" não está cadastrado` };

  return { ok: true, id };
}
