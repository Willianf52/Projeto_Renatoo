import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

/**
 * Fila local da ronda -- o que o inspetor grava em campo antes de existir
 * rede.
 *
 * SQLite e nao AsyncStorage nem memoria: a premissa do plano ("Abrindo o
 * Portao") e que o aparelho esta offline por padrao, e o pior caso nao e o
 * app em segundo plano -- e o app morto pelo sistema no meio da ronda, com o
 * celular no bolso. Um banco em arquivo sobrevive a isso; um estado em
 * memoria some, e a ronda inteira vai junto.
 *
 * O QUE ESTA FILA *NAO* FAZ: ela nao decide o que e valido. A validacao mora
 * em `packages/shared/src/campo/esquemas.ts`, e o que sai daqui passa por la
 * antes de virar linha no Postgres. Aqui e so durabilidade e ordem.
 */

/**
 * Nome fixo, sem versao no nome: migracao de schema local se faz por
 * `PRAGMA user_version` (abaixo), nao trocando de arquivo -- trocar de
 * arquivo abandonaria a ronda que o inspetor tem no aparelho, que e
 * exatamente o dado que esta fila existe para nao perder.
 */
const ARQUIVO = "fila-de-campo.db";

const VERSAO_DO_SCHEMA = 2;

export type VisitaNaFila = {
  /** UUID cunhado no aparelho: e a chave de idempotencia da migration 0047. */
  chave: string;
  siteId: number;
  funcionarioId: string;
  /** Relogio do APARELHO no momento da primeira leitura. Ver `sincronizacao.ts`. */
  capturadoEm: string;
  visitaId: number | null;
  enviada: boolean;
};

export type LeituraNaFila = {
  id: number;
  chaveDaVisita: string;
  dataHora: string;
  areaId: number | null;
  qrCodeId: number | null;
  observacao: string | null;
  temLocalizacao: boolean;
  enviada: boolean;
};

/**
 * A ABERTURA EM VOO, NAO O BANCO JA ABERTO.
 *
 * Guardar o resultado (`let bancoAberto: SQLiteDatabase | null`) e so
 * atribui-lo no fim de `abrirDeFato` abria uma corrida real, nao teorica:
 * entre o primeiro `await` e a atribuicao final passam cinco idas ao disco, e
 * qualquer chamador que entre nessa janela ve `null` e abre o arquivo de novo.
 * `TelaInicial` faz exatamente isso -- `Promise.all([contarPendentes(),
 * ultimaSincronizacao()])` chama as duas no mesmo tick.
 *
 * O estrago nao era corrupcao (o `create table if not exists` e idempotente),
 * era vazamento: dois handles nativos do mesmo arquivo, o perdedor sem
 * ninguem para fecha-lo, a cada abertura do app. Memoizar a PROMESSA faz os
 * dois chamadores dividirem a mesma abertura.
 */
let abertura: Promise<SQLite.SQLiteDatabase> | null = null;

export function abrirFila(): Promise<SQLite.SQLiteDatabase> {
  abertura ??= abrirDeFato().catch((falha) => {
    // Falha nao pode envenenar o modulo. Sem este reset, um erro transitorio
    // de I/O na primeira abertura deixaria a fila inacessivel ate o app ser
    // reiniciado -- e a fila e justamente o que nao pode ficar inalcancavel.
    abertura = null;
    throw falha;
  });

  return abertura;
}

async function abrirDeFato(): Promise<SQLite.SQLiteDatabase> {
  const banco = await SQLite.openDatabaseAsync(ARQUIVO);

  /**
   * WAL: sem ele, uma escrita interrompida (app morto no meio) pode deixar o
   * arquivo num estado que o proximo boot recusa. Com WAL o commit e
   * atomico contra o journal, que e o comportamento que faz "o app morreu no
   * bolso" nao virar "a ronda sumiu".
   *
   * `foreign_keys` e OFF por padrao no SQLite -- sem esta linha, a FK de
   * `leituras_na_fila` seria decoracao e uma leitura orfa passaria calada.
   */
  await banco.execAsync("pragma journal_mode = WAL; pragma foreign_keys = ON;");

  const { user_version: versao } = (await banco.getFirstAsync<{ user_version: number }>(
    "pragma user_version",
  )) ?? { user_version: 0 };

  if (versao < 1) {
    await banco.execAsync(`
      create table if not exists visitas_na_fila (
        chave           text primary key,
        site_id         integer not null,
        funcionario_id  text not null,
        capturado_em    text not null,
        visita_id       integer,
        enviada         integer not null default 0,
        tentativas      integer not null default 0,
        ultimo_erro     text
      );

      create table if not exists leituras_na_fila (
        id               integer primary key autoincrement,
        chave_da_visita  text not null references visitas_na_fila (chave) on delete cascade,
        data_hora        text not null,
        area_id          integer,
        qr_code_id       integer,
        observacao       text,
        tem_localizacao  integer not null default 0,
        enviada          integer not null default 0
      );

      create unique index if not exists leituras_na_fila_dedup
        on leituras_na_fila (chave_da_visita, ifnull(area_id, -1), data_hora);
    `);
  }

  if (versao < 2) {
    /**
     * Um par chave/valor so, e nao uma coluna nova em `visitas_na_fila`: o que
     * se guarda aqui e do APARELHO ("a ultima vez que este celular conversou
     * com o servidor"), nao de uma ronda. Pendurar isso numa linha de visita
     * daria uma resposta diferente para cada ronda a uma pergunta que so tem
     * uma resposta.
     */
    await banco.execAsync(`
      create table if not exists meta (
        chave text primary key,
        valor text not null
      );
    `);
  }

  if (versao < VERSAO_DO_SCHEMA) {
    await banco.execAsync(`pragma user_version = ${VERSAO_DO_SCHEMA}`);
  }

  return banco;
}

/**
 * Comeca uma ronda. A chave nasce aqui, no aparelho, sem rede -- e o ponto
 * inteiro da migration 0047: nao ha contador para consultar em campo, e dois
 * inspetores no mesmo site chegariam ao mesmo inteiro.
 */
export async function iniciarVisita(entrada: {
  siteId: number;
  funcionarioId: string;
  capturadoEm: string;
}): Promise<string> {
  const banco = await abrirFila();
  const chave = Crypto.randomUUID();

  await banco.runAsync(
    "insert into visitas_na_fila (chave, site_id, funcionario_id, capturado_em) values (?, ?, ?, ?)",
    chave,
    entrada.siteId,
    entrada.funcionarioId,
    entrada.capturadoEm,
  );

  return chave;
}

/**
 * Grava uma leitura na ronda.
 *
 * O indice unico local espelha `unique (visita_id, area_id, data_hora) nulls
 * not distinct` (migration 0017) -- com `ifnull(area_id, -1)` de proposito:
 * no SQLite dois NULL sao *distintos* num indice unico, ao contrario do
 * Postgres com `nulls not distinct`. Sem o `ifnull`, a fila aceitaria uma
 * duplicata que o servidor recusa, e o inspetor veria "2 leituras" no
 * aparelho e 1 no portal -- a pior forma de divergencia, porque parece
 * perda de dado.
 *
 * Devolve `false` quando a leitura ja estava na fila (mesma area, mesmo
 * instante): tocar o QR duas vezes por engano nao e evento novo.
 */
export async function registrarLeitura(entrada: {
  chaveDaVisita: string;
  dataHora: string;
  areaId?: number | null;
  qrCodeId?: number | null;
  observacao?: string | null;
  temLocalizacao?: boolean;
}): Promise<boolean> {
  const banco = await abrirFila();

  const resultado = await banco.runAsync(
    `insert or ignore into leituras_na_fila
       (chave_da_visita, data_hora, area_id, qr_code_id, observacao, tem_localizacao)
     values (?, ?, ?, ?, ?, ?)`,
    entrada.chaveDaVisita,
    entrada.dataHora,
    entrada.areaId ?? null,
    entrada.qrCodeId ?? null,
    entrada.observacao ?? null,
    entrada.temLocalizacao ? 1 : 0,
  );

  return resultado.changes > 0;
}

/**
 * O QUE ESTA FILA DEVE AO INSPETOR DA SESSAO, E SO A ELE.
 *
 * O arquivo SQLite e do APARELHO, e o aparelho e compartilhado -- quinze
 * inspetores, um lote de celulares. Sem o recorte por `funcionario_id`, a
 * ronda que A deixou pendente ao sair e drenada pela sessao de B, e o
 * `linhaDeVisita` leva `funcionario_id = A` num insert assinado com o token
 * de B. A policy da migration 0036 (`with check (... and funcionario_id =
 * auth.uid())`) recusa, `registrarFalha` conta mais uma tentativa, e a ronda
 * de A fica presa para sempre atras de um erro que B nao tem como resolver.
 *
 * O `SessaoProvider` ja etiqueta o perfil carregado com o id de quem ele e,
 * pelo mesmo motivo e com a mesma frase ("dois inspetores dividindo o mesmo
 * aparelho"). A fila tinha ficado de fora dessa regra.
 *
 * O recorte NAO apaga nada de ninguem: a ronda de A continua no arquivo,
 * intacta, e volta a ser drenavel assim que A entrar de novo.
 */
export async function visitasPendentes(funcionarioId: string): Promise<VisitaNaFila[]> {
  const banco = await abrirFila();

  const linhas = await banco.getAllAsync<{
    chave: string;
    site_id: number;
    funcionario_id: string;
    capturado_em: string;
    visita_id: number | null;
    enviada: number;
  }>(
    `select chave, site_id, funcionario_id, capturado_em, visita_id, enviada
       from visitas_na_fila
      where funcionario_id = ?
        and (enviada = 0
             or exists (select 1 from leituras_na_fila l
                         where l.chave_da_visita = visitas_na_fila.chave and l.enviada = 0))
      order by capturado_em`,
    funcionarioId,
  );

  return linhas.map((l) => ({
    chave: l.chave,
    siteId: l.site_id,
    funcionarioId: l.funcionario_id,
    capturadoEm: l.capturado_em,
    visitaId: l.visita_id,
    enviada: l.enviada === 1,
  }));
}

export async function leiturasPendentes(chaveDaVisita: string): Promise<LeituraNaFila[]> {
  const banco = await abrirFila();

  const linhas = await banco.getAllAsync<{
    id: number;
    chave_da_visita: string;
    data_hora: string;
    area_id: number | null;
    qr_code_id: number | null;
    observacao: string | null;
    tem_localizacao: number;
    enviada: number;
  }>(
    `select id, chave_da_visita, data_hora, area_id, qr_code_id, observacao,
            tem_localizacao, enviada
       from leituras_na_fila
      where chave_da_visita = ? and enviada = 0
      order by data_hora`,
    chaveDaVisita,
  );

  return linhas.map((l) => ({
    id: l.id,
    chaveDaVisita: l.chave_da_visita,
    dataHora: l.data_hora,
    areaId: l.area_id,
    qrCodeId: l.qr_code_id,
    observacao: l.observacao,
    temLocalizacao: l.tem_localizacao === 1,
    enviada: l.enviada === 1,
  }));
}

export async function marcarVisitaEnviada(chave: string, visitaId: number): Promise<void> {
  const banco = await abrirFila();
  await banco.runAsync(
    "update visitas_na_fila set enviada = 1, visita_id = ?, ultimo_erro = null where chave = ?",
    visitaId,
    chave,
  );
}

export async function marcarLeiturasEnviadas(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const banco = await abrirFila();
  const lacunas = ids.map(() => "?").join(", ");
  await banco.runAsync(`update leituras_na_fila set enviada = 1 where id in (${lacunas})`, ...ids);
}

export async function registrarFalha(chave: string, erro: string): Promise<void> {
  const banco = await abrirFila();
  await banco.runAsync(
    "update visitas_na_fila set tentativas = tentativas + 1, ultimo_erro = ? where chave = ?",
    erro,
    chave,
  );
}

/**
 * Devolve a ronda inteira ao estado "pendente", sem apagar nada.
 *
 * Existe para o roteiro do marco 03 e para o caso real que ele imita: o app
 * envia, o servidor grava, e a resposta se perde no caminho (rede caindo no
 * exato instante do commit). O aparelho nao tem como saber que deu certo, e
 * a proxima sincronizacao reenvia tudo. E este o momento em que a chave de
 * idempotencia prova que serve para alguma coisa.
 */
export async function reabrirParaReenvio(): Promise<void> {
  const banco = await abrirFila();
  await banco.execAsync(
    "update visitas_na_fila set enviada = 0; update leituras_na_fila set enviada = 0;",
  );
}

export async function contarNaFila(): Promise<{ visitas: number; leituras: number }> {
  const banco = await abrirFila();
  const visitas = await banco.getFirstAsync<{ n: number }>(
    "select count(*) as n from visitas_na_fila",
  );
  const leituras = await banco.getFirstAsync<{ n: number }>(
    "select count(*) as n from leituras_na_fila",
  );
  return { visitas: visitas?.n ?? 0, leituras: leituras?.n ?? 0 };
}

/**
 * Quantas rondas e quantas leituras ainda nao chegaram ao servidor, do
 * inspetor da sessao.
 *
 * Recortado por `funcionario_id` pelo mesmo motivo de `visitasPendentes` --
 * e o numero que a tela inicial pinta no distintivo de "Sincronizar", e ele
 * precisa contar exatamente o que aquele toque vai enviar. Contando a fila
 * inteira, o inspetor que entra depois de outro ve um distintivo que nao e
 * dele e que o botao dele nao consegue zerar.
 *
 * Diferente de `contarNaFila`, que conta tudo que existe no aparelho --
 * incluindo o que ja subiu e o que e de outra sessao.
 */
export async function contarPendentes(
  funcionarioId: string,
): Promise<{ visitas: number; leituras: number }> {
  const banco = await abrirFila();
  const visitas = await banco.getFirstAsync<{ n: number }>(
    "select count(*) as n from visitas_na_fila where funcionario_id = ? and enviada = 0",
    funcionarioId,
  );
  // A leitura nao carrega `funcionario_id` -- ela pertence a uma visita, e e
  // a visita que tem dono. O join e o que mantem as duas contagens falando do
  // mesmo inspetor.
  const leituras = await banco.getFirstAsync<{ n: number }>(
    `select count(*) as n
       from leituras_na_fila l
       join visitas_na_fila v on v.chave = l.chave_da_visita
      where v.funcionario_id = ? and l.enviada = 0`,
    funcionarioId,
  );
  return { visitas: visitas?.n ?? 0, leituras: leituras?.n ?? 0 };
}

const CHAVE_DA_ULTIMA_SINCRONIZACAO = "ultima_sincronizacao";

/** Registra o instante do ultimo sync que chegou ao fim sem falha. */
export async function marcarSincronizacao(quando: string): Promise<void> {
  const banco = await abrirFila();
  await banco.runAsync(
    "insert into meta (chave, valor) values (?, ?) on conflict (chave) do update set valor = excluded.valor",
    CHAVE_DA_ULTIMA_SINCRONIZACAO,
    quando,
  );
}

export async function ultimaSincronizacao(): Promise<string | null> {
  const banco = await abrirFila();
  const linha = await banco.getFirstAsync<{ valor: string }>(
    "select valor from meta where chave = ?",
    CHAVE_DA_ULTIMA_SINCRONIZACAO,
  );
  return linha?.valor ?? null;
}

/** So para o roteiro de teste comecar de uma fila limpa. */
export async function esvaziarFila(): Promise<void> {
  const banco = await abrirFila();
  await banco.execAsync("delete from leituras_na_fila; delete from visitas_na_fila;");
}
