import { randomInt } from "node:crypto";
import { expect, test } from "@playwright/test";
import { MOTIVO_SEM_STACK, STACK_LOCAL, clienteAdministrativo } from "../suporte/ambiente";
import { SEGREDOS, ipDeTeste } from "./suporte";

/**
 * Rotas autenticadas por segredo compartilhado, sem sessao: a importacao de
 * coletas, o webhook do Supabase Auth e o cron da Vercel.
 *
 * O ponto central e o portao: sem o segredo, com o segredo errado e com o
 * segredo no header errado, a rota recusa ANTES de tocar no banco. Depois, o
 * que cada uma faz com a requisicao autenticada.
 *
 * Os segredos sao valores descartaveis definidos no job `e2e` (ci.yml). Fora
 * dele, os testes se pulam.
 */

const SEM_SEGREDOS = "requer IMPORTACAO_SECRET, SUPABASE_WEBHOOK_SECRET e CRON_SECRET (job e2e)";

test.describe("POST /api/importar/coletas", () => {
  test.skip(!STACK_LOCAL || !SEGREDOS.importacao, `${MOTIVO_SEM_STACK}; ${SEM_SEGREDOS}`);

  const numeroUnico = () => 900_000_000 + randomInt(0, 99_999_999);

  const lote = (numero: number) => ({
    coletas: [
      {
        numero_coleta: numero,
        site: "Agência Centro",
        data_hora: "2026-08-01T08:12:00-03:00",
        area: "Início",
        qr_code: "QR-AGC-001",
        motivo_visita: "Inspeção",
        coletor_dados: "Dispositivo Móvel",
      },
      {
        numero_coleta: numero,
        site: "Agência Centro",
        data_hora: "2026-08-01T08:40:00-03:00",
        area: "Término",
      },
    ],
  });

  test("sem o header de segredo: 401", async ({ request }) => {
    const resposta = await request.post("/api/importar/coletas", {
      headers: ipDeTeste(),
      data: lote(numeroUnico()),
    });
    expect(resposta.status()).toBe(401);
    expect(await resposta.json()).toEqual({ error: "unauthorized" });
  });

  test("com o segredo errado: 401, inclusive com o mesmo tamanho", async ({ request }) => {
    const errado = "x".repeat(SEGREDOS.importacao!.length);
    const resposta = await request.post("/api/importar/coletas", {
      headers: { ...ipDeTeste(), "x-importacao-secret": errado },
      data: lote(numeroUnico()),
    });
    expect(resposta.status()).toBe(401);
  });

  test("o segredo em outro header nao vale", async ({ request }) => {
    const resposta = await request.post("/api/importar/coletas", {
      headers: { ...ipDeTeste(), authorization: `Bearer ${SEGREDOS.importacao}` },
      data: lote(numeroUnico()),
    });
    expect(resposta.status()).toBe(401);
  });

  test("corpo que nao e JSON: 400, e fica registrado em importacoes", async ({ request }) => {
    const ip = ipDeTeste();
    const resposta = await request.post("/api/importar/coletas", {
      headers: { ...ip, "x-importacao-secret": SEGREDOS.importacao!, "content-type": "application/json" },
      // Buffer, e nao string: o Playwright serializa `data` string como JSON,
      // e `"isto nao e json"` entre aspas E JSON valido -- a rota receberia um
      // corpo bem-formado e responderia `lote_invalido`, nao `corpo_invalido`.
      data: Buffer.from("isto nao e json"),
    });
    expect(resposta.status()).toBe(400);

    const { data } = await clienteAdministrativo()
      .from("importacoes")
      .select("status, http_status")
      .eq("origem", ip["x-real-ip"])
      .order("criado_em", { ascending: false })
      .limit(1)
      .single();
    expect(data).toEqual({ status: "corpo_invalido", http_status: 400 });
  });

  test("data_hora sem fuso: 400 com o motivo", async ({ request }) => {
    const corpo = lote(numeroUnico());
    corpo.coletas[0].data_hora = "2026-08-01T08:12:00";

    const resposta = await request.post("/api/importar/coletas", {
      headers: { ...ipDeTeste(), "x-importacao-secret": SEGREDOS.importacao! },
      data: corpo,
    });
    expect(resposta.status()).toBe(400);
    expect((await resposta.json()).error).toContain("fuso");
  });

  test("referencia desconhecida recusa o lote INTEIRO com 422 e lista o problema", async ({ request }) => {
    const numero = numeroUnico();
    const corpo = lote(numero);
    corpo.coletas[1].site = "Site Que Nao Existe";

    const resposta = await request.post("/api/importar/coletas", {
      headers: { ...ipDeTeste(), "x-importacao-secret": SEGREDOS.importacao! },
      data: corpo,
    });
    expect(resposta.status()).toBe(422);
    const json = await resposta.json();
    expect(json.total_de_problemas).toBe(1);
    expect(json.problemas[0]).toContain("linha 2");

    // Tudo ou nada: nem a linha 1, que era valida, entrou.
    const { count } = await clienteAdministrativo()
      .from("visitas")
      .select("id", { count: "exact", head: true })
      .eq("numero_coleta", String(numero));
    expect(count).toBe(0);
  });

  test("lote valido grava visita e leituras; reenviar o mesmo lote nao duplica", async ({ request }) => {
    const numero = numeroUnico();
    const cabecalhos = { ...ipDeTeste(), "x-importacao-secret": SEGREDOS.importacao! };

    const primeira = await request.post("/api/importar/coletas", { headers: cabecalhos, data: lote(numero) });
    expect(primeira.status()).toBe(200);
    expect(await primeira.json()).toEqual({
      importado: true,
      visitas: 1,
      leituras_recebidas: 2,
      leituras_novas: 2,
    });

    // O integrador reenviando por timeout: mesma resposta de sucesso, zero
    // leitura nova. E o contrato de idempotencia do docs/importacao-de-coletas.md.
    const reenvio = await request.post("/api/importar/coletas", { headers: cabecalhos, data: lote(numero) });
    expect(reenvio.status()).toBe(200);
    expect((await reenvio.json()).leituras_novas).toBe(0);

    const admin = clienteAdministrativo();
    const { data: visita } = await admin
      .from("visitas")
      .select("id")
      .eq("numero_coleta", String(numero))
      .single();
    const { count } = await admin
      .from("leituras")
      .select("id", { count: "exact", head: true })
      .eq("visita_id", visita!.id);
    expect(count).toBe(2);
  });
});

test.describe("POST /api/webhooks/user-updated", () => {
  test.skip(!STACK_LOCAL || !SEGREDOS.webhook, `${MOTIVO_SEM_STACK}; ${SEM_SEGREDOS}`);

  test("sem o header x-webhook-secret: 401", async ({ request }) => {
    const resposta = await request.post("/api/webhooks/user-updated", {
      headers: ipDeTeste(),
      data: {},
    });
    expect(resposta.status()).toBe(401);
  });

  test("com segredo e corpo fora do formato: 400", async ({ request }) => {
    const resposta = await request.post("/api/webhooks/user-updated", {
      headers: { ...ipDeTeste(), "x-webhook-secret": SEGREDOS.webhook! },
      data: { qualquer: "coisa" },
    });
    expect(resposta.status()).toBe(400);
  });

  // O Database Webhook antigo do painel continua disparando ate ser apagado
  // la (a migration 0053 nao tem privilegio para isso): ignorado com 200, sem
  // mandar e-mail e sem processar o registro inteiro de auth.users.
  test("corpo do webhook antigo e ignorado, sem mandar e-mail", async ({ request }) => {
    const resposta = await request.post("/api/webhooks/user-updated", {
      headers: { ...ipDeTeste(), "x-webhook-secret": SEGREDOS.webhook! },
      data: {
        type: "UPDATE",
        table: "users",
        schema: "auth",
        record: { id: "00000000-0000-4000-8000-000000000001", email: "alguem@teste.local", encrypted_password: "hash-novo" },
        old_record: { id: "00000000-0000-4000-8000-000000000001", email: "alguem@teste.local", encrypted_password: "hash-velho" },
      },
    });
    expect(resposta.status()).toBe(200);
    expect(await resposta.json()).toEqual({ skipped: "formato do webhook antigo" });
  });

  test("aviso novo com user_id que nao e UUID: 400", async ({ request }) => {
    const resposta = await request.post("/api/webhooks/user-updated", {
      headers: { ...ipDeTeste(), "x-webhook-secret": SEGREDOS.webhook! },
      data: { type: "PASSWORD_CHANGED", user_id: "1", email: "alguem@teste.local" },
    });
    expect(resposta.status()).toBe(400);
  });
});

test.describe("GET /api/cron/verificar-importacoes", () => {
  test.skip(!STACK_LOCAL || !SEGREDOS.cron, `${MOTIVO_SEM_STACK}; ${SEM_SEGREDOS}`);

  test("sem Authorization: 401", async ({ request }) => {
    const resposta = await request.get("/api/cron/verificar-importacoes");
    expect(resposta.status()).toBe(401);
  });

  test("Bearer errado: 401", async ({ request }) => {
    const resposta = await request.get("/api/cron/verificar-importacoes", {
      headers: { authorization: "Bearer segredo-errado" },
    });
    expect(resposta.status()).toBe(401);
  });

  test("segredo sem o prefixo Bearer: 401", async ({ request }) => {
    const resposta = await request.get("/api/cron/verificar-importacoes", {
      headers: { authorization: SEGREDOS.cron! },
    });
    expect(resposta.status()).toBe(401);
  });

  /**
   * Autenticado, a rota consulta `importacoes` de verdade. O desfecho depende
   * do que os outros specs ja importaram: 200 quando ha importacao recente, e
   * 502 quando esta "em silencio" -- o alerta tenta sair pelo Resend, que nao
   * existe no job. O que importa e ter passado do portao e respondido com um
   * dos dois contratos conhecidos, nunca 401/500.
   */
  test("Bearer correto passa do portao e consulta o banco", async ({ request }) => {
    const resposta = await request.get("/api/cron/verificar-importacoes", {
      headers: { authorization: `Bearer ${SEGREDOS.cron}` },
    });
    expect([200, 502, 429]).toContain(resposta.status());
    if (resposta.status() === 200) {
      const corpo = await resposta.json();
      expect(typeof corpo.alertado).toBe("boolean");
    }
  });
});
