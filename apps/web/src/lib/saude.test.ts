import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { avaliar, ENVS_OBRIGATORIAS, envsAusentes } from "./saude";

describe("envsAusentes", () => {
  it("nao acusa nada com todas preenchidas", () => {
    const ambiente = Object.fromEntries(ENVS_OBRIGATORIAS.map((nome) => [nome, "valor"]));

    expect(envsAusentes(ambiente)).toEqual([]);
  });

  it("acusa a que falta", () => {
    const ambiente = Object.fromEntries(ENVS_OBRIGATORIAS.map((nome) => [nome, "valor"]));
    delete ambiente.CRON_SECRET;

    expect(envsAusentes(ambiente)).toEqual(["CRON_SECRET"]);
  });

  it("trata env em branco como ausente", () => {
    // O estado de quem copiou o .env.example e nao preencheu -- mais comum
    // que a env ausente, e igualmente quebrado.
    //
    // `ALERTA_OPERACAO_EMAIL` e nao um dos segredos da lista de proposito: o
    // portao "Segredo compartilhado versionado?" da CI procura o padrao
    // `NOME=valor` em arquivo versionado, e nao tem como saber que este aqui
    // e um ambiente falso de teste. Ele acusou de verdade na primeira versao
    // deste arquivo, e estava certo em acusar -- a linha tinha a forma exata
    // de um segredo commitado. O portao continua util; o teste e que nao
    // precisa dessa forma para provar o que prova.
    const ambiente = Object.fromEntries(ENVS_OBRIGATORIAS.map((nome) => [nome, "valor"]));
    ambiente.ALERTA_OPERACAO_EMAIL = "   ";

    expect(envsAusentes(ambiente)).toEqual(["ALERTA_OPERACAO_EMAIL"]);
  });

  it("ignora env que nao esta na lista", () => {
    const ambiente = Object.fromEntries(ENVS_OBRIGATORIAS.map((nome) => [nome, "valor"]));
    ambiente.SENTRY_DSN = "";

    // Sentry e documentado como opcional: o app funciona sem, entao a
    // ausencia dele nao pode acender alarme de sistema fora.
    expect(envsAusentes(ambiente)).toEqual([]);
  });
});

describe("avaliar", () => {
  it("so e ok com as duas verificacoes passando", () => {
    expect(avaliar({ banco: true, envs: true })).toEqual({
      status: "ok",
      banco: true,
      envs: true,
    });
  });

  it("banco fora derruba o veredito", () => {
    expect(avaliar({ banco: false, envs: true }).status).toBe("fora");
  });

  it("env faltando derruba o veredito", () => {
    // Nao ha meio-termo de proposito: um "degradado" com 200 nao acorda
    // ninguem. Ver o cabecalho de `saude.ts`.
    expect(avaliar({ banco: true, envs: false }).status).toBe("fora");
  });

  it("preserva qual das duas falhou", () => {
    expect(avaliar({ banco: false, envs: true })).toEqual({
      status: "fora",
      banco: false,
      envs: true,
    });
  });
});

describe("anti-drift com scripts/check-env.mjs", () => {
  it("as duas listas de env obrigatoria continuam iguais", () => {
    /**
     * A duplicacao entre o portao de deploy (`check-env.mjs`) e a observacao
     * de runtime (`saude.ts`) e deliberada -- sao perguntas diferentes, ver o
     * cabecalho de `saude.ts`. O que ela nao pode e divergir em silencio:
     * uma env nova acrescentada so no script deixaria o health check cego
     * para justamente a funcionalidade que acabou de entrar.
     *
     * Comparacao no TEXTO, e nao por import: `check-env.mjs` e um script que
     * roda o efeito na carga (le `process.env` e chama `process.exit`),
     * entao importa-lo daqui derrubaria a suite.
     */
    const script = readFileSync(
      fileURLToPath(new URL("../../scripts/check-env.mjs", import.meta.url)),
      "utf8",
    );

    const listaDoScript = script
      .slice(script.indexOf("const OBRIGATORIAS"), script.indexOf("];"))
      .match(/"([A-Z0-9_]+)"/g)
      ?.map((nome) => nome.replaceAll('"', ""));

    expect(listaDoScript).toBeDefined();
    expect([...listaDoScript!].sort()).toEqual([...ENVS_OBRIGATORIAS].sort());
  });
});
