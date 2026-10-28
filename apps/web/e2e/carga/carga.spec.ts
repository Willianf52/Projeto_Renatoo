import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@projeto-renatoo/shared";
import {
  MOTIVO_SEM_STACK,
  SESSAO_DO_GESTOR,
  STACK_LOCAL,
  clienteAdministrativo,
  clienteDaConta,
  type Conta,
} from "../suporte/ambiente";
import { PNG_1X1, enviarChecklistCorretivo, registrarRonda } from "../suporte/campo";
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

/**
 * Campo completo (28/10/2026): o turno inteiro comecando junto, que e o pior
 * caso real -- 30 tecnicos entrando no app na mesma hora, cada um baixando o
 * pacote do turno e fazendo duas inspecoes completas (12 respostas com
 * observacao, 3 fotos do tamanho que o app sobe e a assinatura, as quatro no
 * bucket em paralelo, e o RPC), e conferindo o historico. O cenario `campo`
 * acima mede a ronda e o checklist corretivo, sem fotos nem respostas; este
 * mede o caminho que o tecnico faz de verdade.
 *
 * As fotos tem ~300 KB porque o app reduz cada uma para 1600 px de lado
 * maior, JPEG 0,7 (`apps/mobile/src/lib/reduzir-foto.ts`) antes de subir.
 */
const TECNICOS = 30;
const INSPECOES_POR_TECNICO = 2;
const PERGUNTAS_DO_MODELO = 12;
const FOTOS_GERAIS = 1;
const FOTOS_DE_PERGUNTA = 2;
const TAMANHO_DA_FOTO = 300 * 1024;

type Etapa = "login" | "pacote" | "ronda" | "foto" | "envio" | "historico";

const ROTULO_DA_ETAPA: Record<Etapa, string> = {
  login: "login",
  pacote: "pacote do turno",
  ronda: "leitura do QR",
  foto: "upload (foto ~300 KB ou assinatura)",
  envio: "inspeção salva (fotos + RPC)",
  historico: "histórico",
};

/** Tetos do campo completo: generosos pelo mesmo motivo dos de cima (runner
 * compartilhado); o que reprova de verdade e erro. */
const TETO_P95_CAMPO_COMPLETO_MS: Record<Etapa, number> = {
  login: 3_000,
  pacote: 3_000,
  ronda: 3_000,
  foto: 5_000,
  envio: 8_000,
  historico: 3_000,
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

  test(`campo completo: ${TECNICOS} técnicos no início do turno, ao mesmo tempo`, async () => {
    test.setTimeout(10 * 60_000);

    const contas = await garantirInspetores(TECNICOS);
    const modelo = await garantirModeloDaCarga();

    const porEtapa: Record<Etapa, Amostra[]> = {
      login: [],
      pacote: [],
      ronda: [],
      foto: [],
      envio: [],
      historico: [],
    };
    const checklistsEnviados: number[] = [];

    const { duracaoMs } = await emParalelo(TECNICOS, async (indice) => {
      let tecnico: Cliente | undefined;
      porEtapa.login.push(
        await medir(async () => {
          tecnico = await clienteDaConta(contas[indice]);
        }),
      );
      if (!tecnico) return [];
      const cliente = tecnico;

      porEtapa.pacote.push(await medir(() => baixarPacoteDoTurno(cliente)));

      for (let inspecao = 0; inspecao < INSPECOES_POR_TECNICO; inspecao++) {
        let visitaId: number | undefined;
        porEtapa.ronda.push(
          await medir(async () => {
            const visita = await registrarRonda(cliente, {
              site: modelo.site,
              minutos: 15 + inspecao,
            });
            visitaId = visita.visitaId;
          }),
        );
        if (visitaId === undefined) continue;
        const id = visitaId;

        // "Inspecao salva" no celular = fotos no bucket + RPC. E o tempo que
        // o tecnico espera olhando a tela, entao e medido inteiro.
        porEtapa.envio.push(
          await medir(async () => {
            const checklistId = await enviarInspecaoCompleta(cliente, id, modelo, porEtapa.foto);
            checklistsEnviados.push(checklistId);
          }),
        );

        porEtapa.historico.push(
          await medir(async () => {
            const { data: sessao } = await cliente.auth.getUser();
            const { data, error } = await cliente
              .from("visitas")
              .select("id, numero_coleta, site_id, criado_em, checklists_visita ( id )")
              .eq("funcionario_id", sessao.user!.id)
              .order("criado_em", { ascending: false })
              .limit(50);
            if (error) throw new Error(`Histórico recusado: ${error.message}`);
            // O "status de sincronizacao" do app e isto: a visita voltou do
            // servidor ja com o checklist.
            const enviada = data.find((v) => v.id === id);
            if (!enviada?.checklists_visita) {
              throw new Error(`Visita ${id} não voltou no histórico com o checklist.`);
            }
          }),
        );
      }

      return [];
    });

    for (const etapa of Object.keys(porEtapa) as Etapa[]) {
      publicar(resumir(`campo completo: ${ROTULO_DA_ETAPA[etapa]}`, porEtapa[etapa], duracaoMs));
    }

    // Nada perdido: cada inspecao chegou com todas as respostas e fotos.
    const admin = clienteAdministrativo();
    const [respostas, fotos] = await Promise.all([
      admin
        .from("checklist_respostas")
        .select("checklist_id", { count: "exact", head: true })
        .in("checklist_id", checklistsEnviados),
      admin
        .from("checklist_fotos")
        .select("checklist_id", { count: "exact", head: true })
        .in("checklist_id", checklistsEnviados),
    ]);

    for (const etapa of Object.keys(porEtapa) as Etapa[]) {
      const resumo = resumir(etapa, porEtapa[etapa], duracaoMs);
      expect(resumo.erros, `${etapa}, primeiro erro: ${resumo.primeiroErro}`).toBe(0);
      expect(resumo.p95, `p95 de ${etapa}`).toBeLessThanOrEqual(TETO_P95_CAMPO_COMPLETO_MS[etapa]);
    }
    expect(checklistsEnviados).toHaveLength(TECNICOS * INSPECOES_POR_TECNICO);
    expect(respostas.count).toBe(checklistsEnviados.length * PERGUNTAS_DO_MODELO);
    expect(fotos.count).toBe(checklistsEnviados.length * (FOTOS_GERAIS + FOTOS_DE_PERGUNTA));
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
        // Sem periodo, como abre de verdade: desde 30/09/2026 a tela sem datas
        // mostra so o aviso e nao consulta leituras. Abrir com um periodo
        // largo aqui estourou o p95 (10 s contra 1,5 s, com statement timeout):
        // o filtro de data em `leituras` e lento sob carga, e isso ja era
        // assim antes -- esta tela so nunca tinha sido medida filtrada. Fica
        // registrado numa issue propria, para ser corrigido no banco e so
        // entao medido aqui.
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

type Cliente = SupabaseClient<Database>;

type ModeloDaCarga = { id: number; site: string; perguntas: number[] };

const NOME_DO_MODELO = "Carga: inspeção completa";

/** Bytes de JPEG do tamanho que o app sobe. O bucket confere tipo e tamanho
 * (0046), nao o conteudo; o que pesa aqui e o volume no Storage. */
const FOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(TAMANHO_DA_FOTO)]);

/**
 * Modelo CONSULTORIA com 12 perguntas Conforme / Nao conforme / N.A., ligado
 * ao grupo do site da carga. O seed nao tem modelo nenhum; idempotente entre
 * execucoes, como `garantirInspetores`.
 */
async function garantirModeloDaCarga(): Promise<ModeloDaCarga> {
  const admin = clienteAdministrativo();
  const site = SITES[0];

  const { data: doSite, error: erroDoSite } = await admin
    .from("sites")
    .select("grupo_site_id")
    .eq("nome", site)
    .single();
  if (erroDoSite || doSite.grupo_site_id === null) {
    throw new Error(`Site "${site}" sem grupo: ${erroDoSite?.message ?? "grupo vazio"}`);
  }

  let { data: modelo } = await admin.from("modelos_checklist").select("id").eq("nome", NOME_DO_MODELO).maybeSingle();
  if (!modelo) {
    const criado = await admin
      .from("modelos_checklist")
      .insert({ nome: NOME_DO_MODELO, ativo: true, padrao: false })
      .select("id")
      .single();
    if (criado.error) throw new Error(`Modelo da carga: ${criado.error.message}`);
    modelo = criado.data;
  }
  const modeloId = modelo.id;

  const { error: erroDasPerguntas } = await admin.from("perguntas_checklist").upsert(
    Array.from({ length: PERGUNTAS_DO_MODELO }, (_, i) => ({
      modelo_id: modeloId,
      ordem: i + 1,
      texto: `Item ${i + 1} da inspeção`,
      tipo_resposta: "CNA",
      ativo: true,
    })),
    { onConflict: "modelo_id,ordem", ignoreDuplicates: true },
  );
  if (erroDasPerguntas) throw new Error(`Perguntas da carga: ${erroDasPerguntas.message}`);

  const { error: erroDaLigacao } = await admin
    .from("modelos_checklist_grupos")
    .upsert(
      { modelo_id: modeloId, grupo_site_id: doSite.grupo_site_id },
      { onConflict: "modelo_id,grupo_site_id", ignoreDuplicates: true },
    );
  if (erroDaLigacao) throw new Error(`Ligação do modelo: ${erroDaLigacao.message}`);

  const { data: perguntas, error: erroDaLeitura } = await admin
    .from("perguntas_checklist")
    .select("id")
    .eq("modelo_id", modeloId)
    .eq("ativo", true)
    .order("ordem");
  if (erroDaLeitura || perguntas.length !== PERGUNTAS_DO_MODELO) {
    throw new Error(`Esperava ${PERGUNTAS_DO_MODELO} perguntas: ${erroDaLeitura?.message ?? perguntas?.length}`);
  }

  return { id: modeloId, site, perguntas: perguntas.map((p) => p.id) };
}

/**
 * O que o app baixa ao entrar: o proprio perfil (`SessaoProvider`) e a copia
 * do checklist (`atualizarCopiaDoChecklist` em lib/checklist-guardado.ts) --
 * sites, modelos, ligacoes e perguntas, em paginas de 500, as quatro em
 * paralelo.
 */
async function baixarPacoteDoTurno(cliente: Cliente): Promise<void> {
  const { data: sessao } = await cliente.auth.getUser();
  if (!sessao.user) throw new Error("Técnico sem sessão.");

  const todasAsPaginas = async (
    pagina: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  ) => {
    for (let de = 0; ; de += 500) {
      const { data, error } = await pagina(de, de + 499);
      if (error) throw new Error(`Pacote recusado: ${error.message}`);
      if ((data ?? []).length < 500) return;
    }
  };

  await Promise.all([
    (async () => {
      const { error } = await cliente
        .from("profiles")
        .select("id, nome_completo, cargo, ativo")
        .eq("id", sessao.user.id)
        .single();
      if (error) throw new Error(`Perfil recusado: ${error.message}`);
    })(),
    todasAsPaginas((de, ate) => cliente.from("sites").select("id, grupo_site_id").order("id").range(de, ate)),
    todasAsPaginas((de, ate) =>
      cliente.from("modelos_checklist").select("id, nome, padrao, ativo").order("id").range(de, ate),
    ),
    todasAsPaginas((de, ate) =>
      cliente
        .from("modelos_checklist_grupos")
        .select("modelo_id, grupo_site_id")
        .order("modelo_id")
        .order("grupo_site_id")
        .range(de, ate),
    ),
    todasAsPaginas((de, ate) =>
      cliente
        .from("perguntas_checklist")
        .select("id, modelo_id, ordem, texto, tipo_resposta")
        .eq("ativo", true)
        .order("id")
        .range(de, ate),
    ),
  ]);
}

/**
 * Uma inspecao CONSULTORIA inteira, na ordem de `enviarChecklist` do app:
 * fotos e assinatura no bucket (aqui as quatro em paralelo), depois o RPC com
 * as respostas. Cada upload vira uma amostra propria em `amostrasDeUpload`.
 */
async function enviarInspecaoCompleta(
  cliente: Cliente,
  visitaId: number,
  modelo: ModeloDaCarga,
  amostrasDeUpload: Amostra[],
): Promise<number> {
  const sufixo = () => randomUUID().slice(0, 8);
  const gerais = Array.from({ length: FOTOS_GERAIS }, () => `${visitaId}/foto-${sufixo()}.jpg`);
  const dePergunta = modelo.perguntas.slice(0, FOTOS_DE_PERGUNTA).map((perguntaId) => ({
    pergunta_id: perguntaId,
    storage_path: `${visitaId}/pergunta-${perguntaId}-${sufixo()}.jpg`,
  }));
  const assinatura = `${visitaId}/assinatura-${sufixo()}.png`;

  const subir = async (caminho: string, conteudo: Buffer, tipo: string) => {
    const amostra = await medir(async () => {
      const { error } = await cliente.storage
        .from("checklists")
        .upload(caminho, conteudo, { contentType: tipo, upsert: false });
      if (error) throw new Error(`Upload de ${caminho} recusado: ${error.message}`);
    });
    amostrasDeUpload.push(amostra);
    if (!amostra.ok) throw new Error(amostra.erro);
  };

  await Promise.all([
    ...gerais.map((caminho) => subir(caminho, FOTO, "image/jpeg")),
    ...dePergunta.map((foto) => subir(foto.storage_path, FOTO, "image/jpeg")),
    subir(assinatura, PNG_1X1, "image/png"),
  ]);

  // Mistura do campo: quase tudo Conforme, um Nao conforme a cada cinco, um
  // N.A. a cada sete, e observacao escrita em um terco dos itens.
  const respostas = modelo.perguntas.map((perguntaId, i) => ({
    pergunta_id: perguntaId,
    resposta: i % 5 === 4 ? "NAO" : i % 7 === 6 ? "NA" : "SIM",
    observacao: i % 3 === 0 ? `Observação do item ${i + 1}: conferido em campo.` : "",
  }));

  const { data, error } = await cliente.rpc("registrar_checklist", {
    p_visita_id: visitaId,
    p_tipo: "CONSULTORIA",
    p_motivo: "",
    p_assinatura_path: assinatura,
    p_fotos: gerais,
    p_respostas: respostas,
    p_modelo_id: modelo.id,
    p_fotos_de_pergunta: dePergunta,
  });
  if (error) throw new Error(`registrar_checklist recusado: ${error.message}`);

  return Number(data);
}
