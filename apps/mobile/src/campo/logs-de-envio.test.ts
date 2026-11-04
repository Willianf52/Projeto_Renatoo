import { describe, expect, it, vi } from "vitest";

vi.mock("./fila", () => ({ abrirFila: vi.fn() }));

import { statusDoLog, textoParaCompartilhar, type LogDeEnvio } from "./logs-de-envio";

describe("statusDoLog", () => {
  it("enviada e sem leitura pendente e sucesso", () => {
    expect(statusDoLog({ enviada: 1, ultimo_erro: null, pendentes: 0 })).toBe("SUCESSO");
  });

  it("com erro registrado e erro", () => {
    expect(statusDoLog({ enviada: 0, ultimo_erro: "rede", pendentes: 1 })).toBe("ERRO");
  });

  it("enviada mas com leitura nova (o Termino) e pendente", () => {
    expect(statusDoLog({ enviada: 1, ultimo_erro: null, pendentes: 1 })).toBe("PENDENTE");
  });
});

describe("textoParaCompartilhar", () => {
  const log = (status: LogDeEnvio["status"], ultimoErro: string | null = null): LogDeEnvio => ({
    chave: "123",
    siteId: 9,
    capturadoEm: "2026-11-04T10:00:00.000Z",
    visitaId: null,
    tentativas: 2,
    ultimoErro,
    status,
    leituras: 1,
    leiturasPendentes: 1,
    termino: false,
  });

  it("resume os envios e lista so os que nao subiram", () => {
    const texto = textoParaCompartilhar({
      nome: "Inspetor",
      versao: "1.2.0",
      atualizacao: null,
      sincronizadoEm: null,
      logs: [log("SUCESSO"), log("ERRO", "sem sinal")],
    });
    expect(texto).toContain("Envios: 2 (sucesso 1, pendente 0, erro 1)");
    expect(texto).toContain("Erro, 2 tentativa(s): sem sinal");
    expect(texto).toContain("Sincronizado: nunca neste aparelho");
  });
});
