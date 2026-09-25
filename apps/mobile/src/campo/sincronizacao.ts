import {
  esquemaDeVisitaDeCampo,
  linhaDeLeitura,
  linhaDeVisita,
  type VisitaDeCampo,
} from "@projeto-renatoo/shared";

import { capturarFalhaDeCampo } from "../lib/observabilidade";
import { supabase } from "../lib/supabase";
import {
  leiturasPendentes,
  marcarLeiturasEnviadas,
  marcarSincronizacao,
  marcarVisitaEnviada,
  registrarFalha,
  visitasPendentes,
} from "./fila";

/**
 * Drena a fila local para o Postgres.
 *
 * REENVIO NAO E UPSERT AQUI, E DE PROPOSITO. A migration 0036 abriu **so
 * INSERT** em `visitas`/`leituras` -- decisao de produto registrada la: o app
 * nao edita leitura ja enviada. Isso descarta o upsert com `DO UPDATE` que
 * seria o reflexo natural (`.upsert()` do supabase-js), porque o ramo de
 * update pediria uma policy de UPDATE que ninguem quer criar. O que sobra e
 * o `DO NOTHING` (`ignoreDuplicates: true`) e, quando ele nao devolve linha
 * nenhuma -- que e exatamente o caso do reenvio --, uma leitura para
 * recuperar o id de quem ja estava la.
 *
 * Descoberto ao escrever esta funcao, nao depois de a UI existir: e para isso
 * que o marco 03 do plano vem antes de qualquer tela.
 *
 * DOIS RELOGIOS. `data_hora` carrega o instante do *aparelho* no scan e viaja
 * da fila; `criado_em` e `default now()` no Postgres, ou seja, o instante em
 * que a linha chegou. Guardar os dois e o que permite marcar como suspeita
 * uma ronda cujo aparelho estava com a hora errada -- sem isso o relatorio de
 * permanencia herda o erro calado (Parte IV do plano).
 *
 * DRENA A FILA DE UM INSPETOR SO. `funcionarioId` nao e conveniencia de
 * assinatura: e o token da sessao que assina os inserts, e a policy da 0036
 * exige `funcionario_id = auth.uid()`. Drenar a fila inteira num aparelho
 * compartilhado mandaria a ronda do inspetor anterior com o token do atual, e
 * o RLS recusaria -- prendendo a ronda alheia atras de um erro que a sessao
 * atual nao tem como resolver. Ver o cabecalho de `visitasPendentes`.
 */

export type ResultadoDaSincronizacao = {
  visitasCriadas: number;
  visitasJaExistiam: number;
  leiturasCriadas: number;
  leiturasJaExistiam: number;
  falhas: { chave: string; erro: string }[];
};

/**
 * UMA DRENAGEM POR VEZ, E A SEGUNDA PEGA CARONA NA PRIMEIRA.
 *
 * A guarda da `TelaInicial` (`if (sincronizando) return`) le ESTADO, e o
 * estado so vira `true` no render seguinte -- a mesma janela que
 * `envioEmVoo` fecha no checklist. Dois toques em "Sincronizar" nesse
 * intervalo rodavam duas drenagens sobre a mesma fila: o banco nao duplicava
 * nada (as chaves de idempotencia seguram), mas cada uma contava a outra como
 * "ja existia", a tela anunciava numeros errados e uma falha virava duas
 * tentativas em `registrarFalha`. Memoizar a PROMESSA, como `abrirFila`, faz
 * o segundo chamador receber o resultado do primeiro.
 *
 * Por inspetor: a troca de sessao no aparelho compartilhado nao pode herdar a
 * drenagem de quem saiu.
 */
const drenagemEmVoo = new Map<string, Promise<ResultadoDaSincronizacao>>();

export function sincronizar(funcionarioId: string): Promise<ResultadoDaSincronizacao> {
  const emVoo = drenagemEmVoo.get(funcionarioId);
  if (emVoo) return emVoo;

  const drenagem = drenar(funcionarioId).finally(() => {
    drenagemEmVoo.delete(funcionarioId);
  });
  drenagemEmVoo.set(funcionarioId, drenagem);
  return drenagem;
}

async function drenar(funcionarioId: string): Promise<ResultadoDaSincronizacao> {
  const resultado: ResultadoDaSincronizacao = {
    visitasCriadas: 0,
    visitasJaExistiam: 0,
    leiturasCriadas: 0,
    leiturasJaExistiam: 0,
    falhas: [],
  };

  for (const visita of await visitasPendentes(funcionarioId)) {
    const leituras = await leiturasPendentes(visita.chave);

    /**
     * Visita sem leitura pendente nao tem o que enviar -- em nenhum dos dois
     * casos em que ela chega aqui assim. `esquemaDeVisitaDeCampo` recusaria
     * (minimo de 1 leitura), e recusar aqui seria tratar o normal como erro.
     *
     * A guarda ja teve um `&& visita.visitaId !== null` que anulava metade do
     * proprio motivo de existir: a ronda ABERTA -- o inspetor a caminho do
     * primeiro checkpoint -- e justamente a que ainda nao tem id do servidor,
     * entao ela escapava por aqui e ia morrer no `safeParse` logo abaixo. O
     * inspetor que iniciava a ronda e sincronizava antes do primeiro scan
     * levava "Registre ao menos uma leitura na visita" em vermelho, e o
     * carimbo do rodape -- que so entra quando `falhas` esta vazio -- nunca
     * era escrito. Ou seja: a tela dizia que nada tinha subido, no exato
     * cenario em que nao havia nada para subir.
     *
     * O outro caso (`visitaId !== null`, visita ja enviada e sem leitura
     * pendente) continua coberto: nao ha o que fazer com ela nesta passada.
     */
    if (leituras.length === 0) continue;

    const conferida = esquemaDeVisitaDeCampo.safeParse({
      numeroColeta: visita.chave,
      siteId: visita.siteId,
      funcionarioId: visita.funcionarioId,
      leituras: leituras.map((l) => ({
        dataHora: l.dataHora,
        areaId: l.areaId,
        qrCodeId: l.qrCodeId,
        observacao: l.observacao,
      })),
    } satisfies Record<string, unknown>);

    if (!conferida.success) {
      const erro = conferida.error.issues.map((i) => i.message).join(" ");
      await falhar(resultado, "validacao", visita.chave, erro);
      continue;
    }

    const visitaValida: VisitaDeCampo = conferida.data;

    const idDaVisita = await garantirVisita(visitaValida, resultado);
    if (typeof idDaVisita !== "number") {
      await falhar(resultado, "visita", visita.chave, idDaVisita.erro);
      continue;
    }

    await marcarVisitaEnviada(visita.chave, idDaVisita);

    const linhas = visitaValida.leituras.map((l) => linhaDeLeitura(l, idDaVisita));

    /**
     * `ignoreDuplicates: true` -> `on conflict do nothing`. O que volta em
     * `data` sao as leituras que a chamada de fato inseriu; as que ja
     * estavam la (reenvio) nao voltam, e e assim que se conta uma coisa e
     * outra sem precisar de consulta extra.
     */
    const { data, error } = await supabase
      .from("leituras")
      .upsert(linhas, { onConflict: "visita_id,area_id,data_hora", ignoreDuplicates: true })
      .select("id");

    if (error) {
      await falhar(resultado, "leituras", visita.chave, error);
      continue;
    }

    const criadas = data?.length ?? 0;
    resultado.leiturasCriadas += criadas;
    resultado.leiturasJaExistiam += linhas.length - criadas;

    await marcarLeiturasEnviadas(leituras.map((l) => l.id));
  }

  /**
   * O carimbo so entra quando NADA falhou. Um sync que subiu duas rondas e
   * tropecou na terceira nao pode escrever "sincronizado agora" no rodape --
   * e a linha que o inspetor olha para decidir se pode fechar o dia.
   */
  if (resultado.falhas.length === 0) {
    await marcarSincronizacao(new Date().toISOString());
  }

  return resultado;
}

/**
 * Os tres desfechos de falha de uma ronda, num lugar so.
 *
 * Os tres ja faziam a mesma dupla de coisas -- gravar o erro na fila local e
 * acumular em `resultado.falhas` --, e agora fazem uma terceira: mandar para
 * o Sentry. Extrair foi o que evitou espalhar a terceira linha por tres
 * pontos e descobrir meses depois que um deles ficou de fora.
 *
 * `etapa` e o que separa "o esquema recusou" (bug nosso, ou dado que o app
 * deixou entrar errado) de "o banco recusou" (policy, rede, contrato) quando
 * os eventos estiverem agregados no Sentry. Sem ela seriam todos "falhou".
 *
 * A gravacao local continua sendo a fonte de verdade para a TELA: o inspetor
 * precisa ver o que houve com a ronda dele mesmo sem sinal, e e `ultimo_erro`
 * na fila que sustenta isso. O envio e observabilidade para quem opera o
 * sistema -- nao substitui nada do que ja existia.
 */
async function falhar(
  resultado: ResultadoDaSincronizacao,
  etapa: "validacao" | "visita" | "leituras",
  chave: string,
  erro: string | FalhaDoBanco,
): Promise<void> {
  // Fila e Sentry guardam o texto cru -- e ele que diagnostica. Quem le a
  // versao traduzida e so a tela.
  const cru = typeof erro === "string" ? erro : erro.message;
  await registrarFalha(chave, cru);
  resultado.falhas.push({ chave, erro: typeof erro === "string" ? erro : paraOInspetor(erro) });
  capturarFalhaDeCampo(etapa, chave, cru);
}

/** O pedaco do `PostgrestError` que a traducao usa. */
type FalhaDoBanco = { message: string; code?: string };

/**
 * O que o inspetor le quando o banco recusa -- e o que ele pode FAZER a
 * respeito.
 *
 * O aviso da `TelaInicial` pintava `error.message` cru: "JWT expired" ou
 * "TypeError: Network request failed", em ingles, sem dizer que a ronda
 * continua salva nem o que fazer. Os dois casos mais comuns em campo tem
 * saida conhecida (entrar de novo; esperar sinal), entao ganham frase propria.
 * O resto segue cru, porque nao ha conselho honesto a dar sobre ele.
 *
 * PGRST301/PGRST303 sao os codigos do PostgREST para JWT invalido/vencido. A
 * sessao vence quando o aparelho fica dias sem rede e o refresh token expira
 * junto -- o `autoRefreshToken` nao tem como renovar o que ja morreu.
 */
export function paraOInspetor(erro: FalhaDoBanco): string {
  if (erro.code === "PGRST301" || erro.code === "PGRST303" || /jwt/i.test(erro.message)) {
    return "Sua sessão expirou. Saia e entre de novo para enviar — as leituras continuam salvas no aparelho.";
  }

  if (/network request failed|failed to fetch|fetch failed/i.test(erro.message)) {
    return "Sem conexão com o servidor. As leituras continuam salvas; tente de novo com sinal.";
  }

  return erro.message;
}

/**
 * Insere a visita, ou recupera o id da que ja existe com a mesma chave.
 *
 * O `select` do segundo ramo passa pela policy de leitura (0006/0014), que ja
 * tem o ramo "funcionario_id = auth.uid()" -- o inspetor enxerga a propria
 * visita, entao nao ha portao novo a abrir para o reenvio funcionar.
 */
async function garantirVisita(
  visita: VisitaDeCampo,
  resultado: ResultadoDaSincronizacao,
): Promise<number | { erro: FalhaDoBanco }> {
  const { data: inserida, error: erroDoInsert } = await supabase
    .from("visitas")
    .upsert(linhaDeVisita(visita), {
      onConflict: "numero_coleta,site_id",
      ignoreDuplicates: true,
    })
    .select("id")
    .maybeSingle();

  if (erroDoInsert) return { erro: erroDoInsert };

  if (inserida) {
    resultado.visitasCriadas += 1;
    return inserida.id;
  }

  const { data: existente, error: erroDaBusca } = await supabase
    .from("visitas")
    .select("id")
    .eq("numero_coleta", visita.numeroColeta)
    .eq("site_id", visita.siteId)
    .maybeSingle();

  if (erroDaBusca) return { erro: erroDaBusca };

  /**
   * Nem inseriu nem achou: nao e "ja existia". A causa provavel e RLS --
   * a linha existe, gravada por outra sessao, e a policy de SELECT nao a
   * entrega para esta. Tratar isso como sucesso marcaria a ronda como
   * enviada sem nunca ter chegado.
   */
  if (!existente) {
    return { erro: { message: "A visita nao foi inserida e tambem nao esta visivel para esta sessao." } };
  }

  resultado.visitasJaExistiam += 1;
  return existente.id;
}
