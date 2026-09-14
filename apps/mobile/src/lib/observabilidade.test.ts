import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  capturarErro,
  capturarFalhaDeCampo,
  esquecerInspetor,
  identificarInspetor,
  registrarDestino,
  temDestinoConfigurado,
  type DestinoDeEventos,
} from "./observabilidade";

/**
 * O que se prova aqui e o contrato INERTE e o formato do que sai -- nao o SDK
 * do Sentry, que vive em `observabilidade-sentry.ts` e nao carrega neste
 * ambiente (ver o cabecalho do modulo).
 *
 * Sem destino registrado o app nao pode nem enviar nada nem quebrar por causa
 * disso: e a propriedade que permite rodar em desenvolvimento, em homologacao
 * e no roteiro do marco 03 sem despejar evento no projeto de producao.
 */

function destinoFalso() {
  return {
    erro: vi.fn(),
    aviso: vi.fn(),
    usuario: vi.fn(),
  } satisfies DestinoDeEventos;
}

afterEach(() => {
  registrarDestino(null);
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
});

describe("temDestinoConfigurado", () => {
  it("e falso sem DSN", () => {
    expect(temDestinoConfigurado()).toBe(false);
  });

  it("e falso com DSN em branco", () => {
    // Env vazia e o estado de quem copiou o .env.example e nao preencheu --
    // mais comum que a env ausente, e vale como "nao configurado".
    process.env.EXPO_PUBLIC_SENTRY_DSN = "   ";
    expect(temDestinoConfigurado()).toBe(false);
  });

  it("e verdadeiro com DSN preenchido", () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://exemplo@o0.ingest.sentry.io/0";
    expect(temDestinoConfigurado()).toBe(true);
  });
});

describe("sem destino registrado", () => {
  it("engole as capturas sem lancar", () => {
    expect(() => capturarErro(new Error("x"))).not.toThrow();
    expect(() => capturarFalhaDeCampo("visita", "COL-1", "erro")).not.toThrow();
    expect(() => identificarInspetor("uuid")).not.toThrow();
    expect(() => esquecerInspetor()).not.toThrow();
  });
});

describe("com destino registrado", () => {
  let destino: ReturnType<typeof destinoFalso>;

  beforeEach(() => {
    destino = destinoFalso();
    registrarDestino(destino);
  });

  it("manda excecao como erro, com as etiquetas", () => {
    const excecao = new Error("disco cheio");

    capturarErro(excecao, { onde: "enviarChecklist", visita: "42" });

    expect(destino.erro).toHaveBeenCalledWith(excecao, {
      onde: "enviarChecklist",
      visita: "42",
    });
  });

  it("manda falha de fila como aviso etiquetado, nao como erro", () => {
    capturarFalhaDeCampo("leituras", "COL-42", "permission denied");

    expect(destino.erro).not.toHaveBeenCalled();
    expect(destino.aviso).toHaveBeenCalledWith(
      "Falha na fila de campo: leituras",
      { etapa: "leituras", chave: "COL-42" },
      { erro: "permission denied" },
    );
  });

  it("identifica o inspetor so pelo uuid", () => {
    // Nome, e-mail e login ficam de fora de proposito -- ver o cabecalho do
    // modulo e `docs/lgpd-privacidade.md`.
    identificarInspetor("11111111-2222-3333-4444-555555555555");

    expect(destino.usuario).toHaveBeenCalledWith("11111111-2222-3333-4444-555555555555");
  });

  it("desfaz a identificacao no logout", () => {
    esquecerInspetor();

    expect(destino.usuario).toHaveBeenCalledWith(null);
  });
});
