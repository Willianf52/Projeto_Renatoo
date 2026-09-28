import { supabase } from "../lib/supabase";
import { abrirFila, iniciarVisita, registrarLeitura } from "./fila";

/**
 * A ronda com leitor de QR: o que liga o codigo lido pela camera a fila
 * offline que ja existia (`fila.ts`) e a sincronizacao (`sincronizacao.ts`).
 *
 * DECISOES DO DONO (25/09/2026; mantidas sobre a #134 em 28/09):
 *   - "Inspecao" de quem registra visita (INSPETOR e GESTOR, migration 0060)
 *     abre direto a camera -- `TelaDeLeitura`;
 *   - a ronda fica aberta ate o inspetor tocar "Encerrar ronda";
 *   - ler um QR de OUTRO site com a ronda aberta pede confirmacao para
 *     encerrar a atual e comecar outra;
 *   - ao encerrar, com sinal, sincroniza e oferece o checklist.
 *
 * O QUE ESTE MODULO NAO DECIDE: se a leitura e valida para o banco. O trigger
 * `manutencao.validar_leitura_de_campo` (0054) recusa QR de outro site e hora
 * fora da janela -- a regra de `decidirLeitura` so evita oferecer ao inspetor o
 * que o banco vai recusar, pelo mesmo raciocinio de `CARGO_INSPETOR`.
 */

export type QrDoCatalogo = {
  id: number;
  codigo: string;
  siteId: number;
  siteNome: string;
  finalidade: string | null;
  ativo: boolean;
};

export type RondaAberta = {
  chave: string;
  siteId: number;
  siteNome: string | null;
  leituras: number;
  capturadoEm: string;
};

export type Decisao =
  | { tipo: "iniciar" }
  | { tipo: "adicionar" }
  | { tipo: "trocar-de-site" }
  | { tipo: "recusar"; motivo: string };

/**
 * O que fazer com um QR lido, dada a ronda aberta (ou nenhuma). Pura: e o
 * ponto que decide o fluxo inteiro, e por isso e o que tem teste.
 */
export function decidirLeitura(aberta: RondaAberta | null, qr: QrDoCatalogo): Decisao {
  if (!qr.ativo) {
    return { tipo: "recusar", motivo: `O QR-code ${qr.codigo} está desativado no cadastro.` };
  }
  if (!aberta) return { tipo: "iniciar" };
  if (aberta.siteId === qr.siteId) return { tipo: "adicionar" };
  return { tipo: "trocar-de-site" };
}

/**
 * FILTRO DA CAMERA. A camera entrega cada QR a cada quadro enquanto ele esta
 * na frente dela -- e, com dois QR no enquadramento, alterna entre eles.
 *
 * A primeira versao so ignorava "o mesmo codigo que o anterior" por 4 s, e no
 * primeiro teste real (25/09/2026) isso gravou ~160 leituras em 6 segundos: com
 * `TESTE-RONDA-1` e `-2` na mesma tela, a camera lia 1, 2, 1, 2... e nenhuma
 * leitura era "igual a anterior". Duas travas agora:
 *
 * - cada codigo fica ignorado por `JANELA_POR_CODIGO_MS` depois de visto --
 *   ninguem le o mesmo ponto de ronda duas vezes num minuto de proposito;
 * - entre duas leituras aceitas passa pelo menos `PAUSA_ENTRE_LEITURAS_MS`,
 *   qualquer que seja o codigo, para uma rajada nao virar varias leituras.
 *
 * Conta como "visto" tambem o codigo que nao e reconhecido, para um QR
 * estranho na frente da camera nao repetir o mesmo aviso de erro a cada quadro.
 */
export const JANELA_POR_CODIGO_MS = 60_000;
export const PAUSA_ENTRE_LEITURAS_MS = 1_500;

export type MemoriaDaCamera = { vistos: Map<string, number>; ultimaAceitaEm: number | null };

export function novaMemoriaDaCamera(): MemoriaDaCamera {
  return { vistos: new Map(), ultimaAceitaEm: null };
}

/**
 * A memoria da camera do APP, e nao da tela. Guardada num `useRef`, ela
 * zerava sempre que a tela da camera era montada de novo (voltar ao inicio e
 * tocar "Inspecao"): no teste de 28/09/2026 o mesmo QR entrou 4 vezes em 32 s.
 * Aqui dura a sessao inteira do app. Nao e a trava principal -- essa e a da
 * fila, em `registrarLeituraDeQr` --, so poupa a consulta repetida.
 */
export const memoriaDaCameraDoApp: MemoriaDaCamera = novaMemoriaDaCamera();

/** `true` se a leitura deve seguir; ja registra o codigo como visto. */
export function aceitarDaCamera(memoria: MemoriaDaCamera, lido: string, agora: number): boolean {
  const codigo = normalizarCodigo(lido);
  const vistoEm = memoria.vistos.get(codigo);

  if (vistoEm !== undefined && agora - vistoEm < JANELA_POR_CODIGO_MS) return false;
  if (memoria.ultimaAceitaEm !== null && agora - memoria.ultimaAceitaEm < PAUSA_ENTRE_LEITURAS_MS) return false;

  memoria.vistos.set(codigo, agora);
  memoria.ultimaAceitaEm = agora;
  return true;
}

/**
 * O texto lido pela camera vira a chave do catalogo. `trim` porque etiqueta
 * gerada por outro sistema pode vir com quebra de linha no fim; caixa e
 * preservada -- `codigo` e unique no banco com a caixa que foi cadastrado.
 */
export function normalizarCodigo(lido: string): string {
  return lido.trim();
}

// ---------------------------------------------------------------------------
// Catalogo de QR no aparelho
// ---------------------------------------------------------------------------

/** Pagina de 500: abaixo do `max_rows` (1000) do PostgREST, com folga. */
const TAMANHO_DA_PAGINA = 500;

type LinhaDoServidor = {
  id: number;
  codigo: string;
  site_id: number;
  finalidade: string | null;
  ativo: boolean;
  sites: { nome: string } | null;
};

function doServidor(linha: LinhaDoServidor): QrDoCatalogo {
  return {
    id: linha.id,
    codigo: linha.codigo,
    siteId: linha.site_id,
    siteNome: linha.sites?.nome ?? `Site ${linha.site_id}`,
    finalidade: linha.finalidade,
    ativo: linha.ativo,
  };
}

/**
 * Baixa o catalogo inteiro e troca o local numa transacao so. Inclui os
 * desativados de proposito: sem eles, um QR desativado lido em campo cairia em
 * "nao cadastrado", e a mensagem certa e outra.
 *
 * Chamada com rede ao abrir a tela da ronda. Falha (sem sinal) nao apaga nada:
 * o catalogo anterior continua valendo -- e e exatamente para isso que ele
 * existe.
 */
export async function atualizarCatalogo(): Promise<number> {
  const todos: QrDoCatalogo[] = [];

  for (let de = 0; ; de += TAMANHO_DA_PAGINA) {
    const { data, error } = await supabase
      .from("qr_codes")
      .select("id, codigo, site_id, finalidade, ativo, sites ( nome )")
      .order("id")
      .range(de, de + TAMANHO_DA_PAGINA - 1);

    if (error) throw error;
    const pagina = (data ?? []) as unknown as LinhaDoServidor[];
    todos.push(...pagina.map(doServidor));
    if (pagina.length < TAMANHO_DA_PAGINA) break;
  }

  const banco = await abrirFila();
  await banco.withTransactionAsync(async () => {
    await banco.runAsync("delete from catalogo_de_qr");
    for (const qr of todos) {
      await gravarNoCatalogo(qr);
    }
  });

  await banco.runAsync(
    "insert into meta (chave, valor) values ('catalogo_atualizado_em', ?) on conflict (chave) do update set valor = excluded.valor",
    new Date().toISOString(),
  );

  return todos.length;
}

async function gravarNoCatalogo(qr: QrDoCatalogo): Promise<void> {
  const banco = await abrirFila();
  await banco.runAsync(
    `insert into catalogo_de_qr (codigo, id, site_id, site_nome, finalidade, ativo)
     values (?, ?, ?, ?, ?, ?)
     on conflict (codigo) do update set
       id = excluded.id, site_id = excluded.site_id, site_nome = excluded.site_nome,
       finalidade = excluded.finalidade, ativo = excluded.ativo`,
    qr.codigo,
    qr.id,
    qr.siteId,
    qr.siteNome,
    qr.finalidade,
    qr.ativo ? 1 : 0,
  );
}

export async function tamanhoDoCatalogo(): Promise<number> {
  const banco = await abrirFila();
  const linha = await banco.getFirstAsync<{ n: number }>("select count(*) as n from catalogo_de_qr");
  return linha?.n ?? 0;
}

/**
 * Traduz o codigo lido: primeiro no aparelho; se nao estiver la (QR cadastrado
 * depois da ultima atualizacao), tenta o servidor e guarda o resultado. Sem
 * rede e fora do catalogo, devolve `null` -- quem chama diz ao inspetor.
 */
export async function acharQr(lido: string): Promise<QrDoCatalogo | null> {
  const codigo = normalizarCodigo(lido);
  if (codigo === "") return null;

  const banco = await abrirFila();
  const local = await banco.getFirstAsync<{
    codigo: string;
    id: number;
    site_id: number;
    site_nome: string;
    finalidade: string | null;
    ativo: number;
  }>("select codigo, id, site_id, site_nome, finalidade, ativo from catalogo_de_qr where codigo = ?", codigo);

  if (local) {
    return {
      id: local.id,
      codigo: local.codigo,
      siteId: local.site_id,
      siteNome: local.site_nome,
      finalidade: local.finalidade,
      ativo: local.ativo === 1,
    };
  }

  try {
    const { data, error } = await supabase
      .from("qr_codes")
      .select("id, codigo, site_id, finalidade, ativo, sites ( nome )")
      .eq("codigo", codigo)
      .maybeSingle();

    if (error || !data) return null;
    const qr = doServidor(data as unknown as LinhaDoServidor);
    await gravarNoCatalogo(qr);
    return qr;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ronda aberta
// ---------------------------------------------------------------------------

export async function rondaAberta(funcionarioId: string): Promise<RondaAberta | null> {
  const banco = await abrirFila();
  const linha = await banco.getFirstAsync<{
    chave: string;
    site_id: number;
    capturado_em: string;
    site_nome: string | null;
    leituras: number;
  }>(
    `select v.chave, v.site_id, v.capturado_em,
            (select c.site_nome from catalogo_de_qr c where c.site_id = v.site_id limit 1) as site_nome,
            (select count(*) from leituras_na_fila l where l.chave_da_visita = v.chave) as leituras
       from visitas_na_fila v
      where v.funcionario_id = ? and v.encerrada = 0
      order by v.capturado_em desc
      limit 1`,
    funcionarioId,
  );

  if (!linha) return null;
  return {
    chave: linha.chave,
    siteId: linha.site_id,
    siteNome: linha.site_nome,
    leituras: linha.leituras,
    capturadoEm: linha.capturado_em,
  };
}

/**
 * Grava o QR lido na ronda: abre uma nova (a primeira leitura e o que cria a
 * visita, com o site do QR) ou soma a aberta. `trocar-de-site` e `recusar` nao
 * chegam aqui -- a tela resolve com o inspetor antes.
 *
 * `repetida`: o mesmo QR ja lido NESTA ronda ha menos de `JANELA_POR_CODIGO_MS`.
 * E a trava que vale -- conferida na fila, que esta em disco, entao sobrevive a
 * tela reaberta e ao app reiniciado. A memoria da camera (`aceitarDaCamera`)
 * e so a primeira peneira; sozinha, falhou no teste de 28/09/2026.
 */
export async function registrarLeituraDeQr(entrada: {
  funcionarioId: string;
  qr: QrDoCatalogo;
  aberta: RondaAberta | null;
  agora?: Date;
}): Promise<{ chave: string; nova: boolean; repetida: boolean }> {
  const agora = entrada.agora ?? new Date();
  const dataHora = agora.toISOString();
  const mesmaRonda = entrada.aberta && entrada.aberta.siteId === entrada.qr.siteId ? entrada.aberta : null;

  if (mesmaRonda && (await lidoHaPouco(mesmaRonda.chave, entrada.qr.id, agora))) {
    return { chave: mesmaRonda.chave, nova: false, repetida: true };
  }

  const chave = mesmaRonda
    ? mesmaRonda.chave
    : await iniciarVisita({
          siteId: entrada.qr.siteId,
          funcionarioId: entrada.funcionarioId,
          capturadoEm: dataHora,
        });

  const gravou = await registrarLeitura({
    chaveDaVisita: chave,
    dataHora,
    qrCodeId: entrada.qr.id,
  });

  return { chave, nova: chave !== entrada.aberta?.chave, repetida: !gravou };
}

/** O QR ja entrou nesta ronda dentro da janela? `data_hora` e ISO em UTC, que ordena como texto. */
async function lidoHaPouco(chave: string, qrCodeId: number, agora: Date): Promise<boolean> {
  const banco = await abrirFila();
  const desde = new Date(agora.getTime() - JANELA_POR_CODIGO_MS).toISOString();
  const linha = await banco.getFirstAsync<{ n: number }>(
    "select count(*) as n from leituras_na_fila where chave_da_visita = ? and qr_code_id = ? and data_hora > ?",
    chave,
    qrCodeId,
    desde,
  );
  return (linha?.n ?? 0) > 0;
}

export async function encerrarRonda(chave: string): Promise<void> {
  const banco = await abrirFila();
  await banco.runAsync("update visitas_na_fila set encerrada = 1 where chave = ?", chave);
}
