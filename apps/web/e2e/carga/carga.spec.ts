import { randomInt } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  MOTIVO_SEM_STACK,
  SESSAO_DO_GESTOR,
  STACK_LOCAL,
  clienteAdministrativo,
  clienteDaConta,
  type Conta,
} from "../suporte/ambiente";
import { enviarChecklistCorretivo, registrarRonda } from "../suporte/campo";
import { ipDeTeste } from "../api/suporte";
import { cabecalhoDoResumo, emParalelo, medir, publicar, resumir, type Amostra } from "./metricas";

/**
 * Teste de carga: o que acontece quando a operacao inteira usa o sistema ao
 * mesmo tempo.
 *
 * ONDE RODA: so contra o Supabase LOCAL do runner (guarda `STACK_LOCAL`) e o
 * build de producao do painel (playwright.carga.config.ts). NUNCA contra
 * producao: o projeto e Free, e carga de verdade la bateria nos limites da
 * plataforma, sujaria a operacao com dado de teste e poderia pausar o projeto.
 *
 * O TAMANHO e o da operacao real, nao um numero de vitrine: 15 inspetores em
 * campo (a equipe inteira) e o painel sendo consultado por 20 abas ao mesmo
 * tempo (os 19 administrativos e mais um).
 *
 * O QUE REPROVA: qualquer erro, em qualquer cenario -- concorrencia que
 * derruba uma escrita e perda de dado, nao lentidao. A latencia tem teto
 * generoso (p95), porque o runner do GitHub e compartilhado e oscila: um teto
 * justo aqui viraria teste intermitente. Os numeros medidos vao para o resumo
 * do job, para acompanhar tendencia.
 */

const INSPETORES = 15;
const RONDAS_POR_INSPETOR = 4;
const INTEGRADORES = 5;
const LOTES_POR_INTEGRADOR = 4;
const LINHAS_POR_LOTE = 200;
const ABAS_DO_PAINEL = 20;
const RODADAS_DO_PAINEL = 5;

/**
 * Primeira medicao na CI (14/09/2026, PR #80), para saber a folga de cada teto:
 *
 *   cenario      requisicoes  p50     p95     max     req/s
 *   campo        75           409 ms  639 ms  677 ms  34,5
 *   importacao   20           127 ms  310 ms  313 ms  28,8
 *   painel       100          2,3 s   3,9 s   4,1 s   8,1
 *
 * O painel e o que chega mais perto do teto. Contexto antes de concluir que ele
 * e lento: no runner, Next, Postgres, PostgREST e GoTrue dividem os mesmos 2
 * vCPUs com o proprio Playwright, e as 20 abas renderizam no servidor ao mesmo
 * tempo. Se o p95 dele passar a encostar em 5 s com frequencia, o proximo passo
 * e medir onde o tempo vai (consulta ou render), nao subir o teto.
 */
const TETO_P95_MS = {
  campo: 3_000,
  importacao: 10_000,
  painel: 5_000,
};

const SITES = ["Agência Centro", "Agência Zona Norte", "Posto Universitário", "Loja Ipiranga"];

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  cabecalhoDoResumo();
});

test.describe("Carga", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);

  test(`campo: ${INSPETORES} inspetores gravando rondas e checklist ao mesmo tempo`, async () => {
    test.setTimeout(5 * 60_000);

    const contas = await garantirInspetores(INSPETORES);
    const clientes = await Promise.all(contas.map((conta) => clienteDaConta(conta)));

    const { amostras, duracaoMs } = await emParalelo(INSPETORES, async (indice) => {
      const inspetor = clientes[indice];
      const doInspetor: Amostra[] = [];

      for (let ronda = 0; ronda < RONDAS_POR_INSPETOR; ronda++) {
        let visitaId: number | undefined;
        doInspetor.push(
          await medir(async () => {
            const visita = await registrarRonda(inspetor, {
              site: SITES[(indice + ronda) % SITES.length],
              minutos: 20 + ronda,
            });
            visitaId = visita.visitaId;
          }),
        );

        // Uma ronda por inspetor fecha com checklist: upload no bucket + RPC.
        if (ronda === 0 && visitaId !== undefined) {
          const id = visitaId;
          doInspetor.push(await medir(() => enviarChecklistCorretivo(inspetor, id, `Carga ${indice}`)));
        }
      }

      return doInspetor;
    });

    const resumo = resumir("campo (ronda + checklist)", amostras, duracaoMs);
    publicar(resumo);

    expect(resumo.erros, `primeiro erro: ${resumo.primeiroErro}`).toBe(0);
    expect(resumo.total).toBe(INSPETORES * (RONDAS_POR_INSPETOR + 1));
    expect(resumo.p95).toBeLessThanOrEqual(TETO_P95_MS.campo);
  });

  test(`importacao: ${INTEGRADORES} integradores enviando lotes de ${LINHAS_POR_LOTE} linhas em paralelo`, async ({
    request,
  }) => {
    test.setTimeout(5 * 60_000);
    const segredo = process.env.IMPORTACAO_SECRET;
    test.skip(!segredo, "requer IMPORTACAO_SECRET");

    const base = 700_000_000 + randomInt(0, 90_000_000);

    const { amostras, duracaoMs } = await emParalelo(INTEGRADORES, async (integrador) => {
      // IP proprio por integrador: o limite da rota e por origem (20/min).
      const cabecalhos = { ...ipDeTeste(), "x-importacao-secret": segredo! };
      const doIntegrador: Amostra[] = [];

      for (let lote = 0; lote < LOTES_POR_INTEGRADOR; lote++) {
        const coletas = montarLote(base + integrador * 10_000 + lote * 1_000, LINHAS_POR_LOTE);
        doIntegrador.push(
          await medir(async () => {
            const resposta = await request.post("/api/importar/coletas", {
              headers: cabecalhos,
              data: { coletas },
              timeout: 60_000,
            });
            if (resposta.status() !== 200) {
              throw new Error(`HTTP ${resposta.status()}: ${await resposta.text()}`);
            }
            const corpo = await resposta.json();
            if (corpo.leituras_novas !== LINHAS_POR_LOTE) {
              throw new Error(`esperava ${LINHAS_POR_LOTE} leituras novas, vieram ${corpo.leituras_novas}`);
            }
          }),
        );
      }

      return doIntegrador;
    });

    const resumo = resumir(`importação (lotes de ${LINHAS_POR_LOTE})`, amostras, duracaoMs);
    publicar(resumo);

    expect(resumo.erros, `primeiro erro: ${resumo.primeiroErro}`).toBe(0);
    expect(resumo.p95).toBeLessThanOrEqual(TETO_P95_MS.importacao);
  });

  test.describe(() => {
    test.use({ storageState: SESSAO_DO_GESTOR });

    test(`painel: ${ABAS_DO_PAINEL} abas do GESTOR abrindo as telas pesadas ao mesmo tempo`, async ({
      request,
    }) => {
      test.setTimeout(5 * 60_000);

      const telas = [
        "/dashboard/inspecoes/coletas-importadas",
        "/dashboard/inspecoes/relatorios/registro-de-rondas",
        "/dashboard/checklistlab/historico-de-checklist",
        "/dashboard/cadastros/site-planta",
      ];

      const { amostras, duracaoMs } = await emParalelo(ABAS_DO_PAINEL, async (aba) => {
        const daAba: Amostra[] = [];
        for (let rodada = 0; rodada < RODADAS_DO_PAINEL; rodada++) {
          const tela = telas[(aba + rodada) % telas.length];
          daAba.push(
            await medir(async () => {
              // A resposta inteira, streaming de Suspense incluido: `text()`
              // so resolve quando o servidor fecha o corpo.
              const resposta = await request.get(tela, { maxRedirects: 0, timeout: 60_000 });
              if (resposta.status() !== 200) throw new Error(`${tela}: HTTP ${resposta.status()}`);
              const html = await resposta.text();
              if (html.includes("Erro na area do dashboard")) throw new Error(`${tela}: tela de erro`);
            }),
          );
        }
        return daAba;
      });

      const resumo = resumir("painel (telas pesadas)", amostras, duracaoMs);
      publicar(resumo);

      expect(resumo.erros, `primeiro erro: ${resumo.primeiroErro}`).toBe(0);
      expect(resumo.p95).toBeLessThanOrEqual(TETO_P95_MS.painel);
    });
  });
});

/**
 * Contas de inspetor so da carga. O setup cria uma; aqui sao quinze, com a
 * mesma receita (conta pelo admin, cargo/ativo pelo admin -- o trigger da 0039
 * barra essa mudanca vinda de sessao). Idempotente entre execucoes.
 */
async function garantirInspetores(quantidade: number): Promise<Conta[]> {
  const admin = clienteAdministrativo();
  const contas: Conta[] = Array.from({ length: quantidade }, (_, i) => ({
    email: `inspetor.carga.${i + 1}@teste.local`,
    senha: "Inspetor-carga-2026!",
    nome: `Inspetor Carga ${i + 1}`,
    cargo: "INSPETOR",
    ativo: true,
  })) as unknown as Conta[];

  const { data: existentes, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers falhou: ${error.message}`);

  for (const conta of contas) {
    let id = existentes.users.find((u) => u.email === conta.email)?.id;
    if (!id) {
      const criada = await admin.auth.admin.createUser({
        email: conta.email,
        password: conta.senha,
        email_confirm: true,
      });
      if (!criada.data.user) throw new Error(`Nao criou ${conta.email}: ${criada.error?.message}`);
      id = criada.data.user.id;
    }

    const { error: erroDoPerfil } = await admin
      .from("profiles")
      .update({ cargo: conta.cargo, ativo: true, nome_completo: conta.nome })
      .eq("id", id);
    if (erroDoPerfil) throw new Error(`Perfil de ${conta.email}: ${erroDoPerfil.message}`);
  }

  return contas;
}

/** Lote no formato do docs/importacao-de-coletas.md: metade das linhas abre
 * uma visita (Inicio) e a outra metade fecha (Termino). */
function montarLote(numeroInicial: number, linhas: number) {
  const coletas = [];
  for (let i = 0; i < linhas / 2; i++) {
    const numero = numeroInicial + i;
    coletas.push(
      {
        numero_coleta: numero,
        site: SITES[i % SITES.length],
        data_hora: "2026-08-10T08:00:00-03:00",
        area: "Início",
        motivo_visita: "Inspeção",
        coletor_dados: "Dispositivo Móvel",
      },
      {
        numero_coleta: numero,
        site: SITES[i % SITES.length],
        data_hora: "2026-08-10T08:30:00-03:00",
        area: "Término",
      },
    );
  }
  return coletas;
}
