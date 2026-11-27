import { beforeEach, describe, expect, it, vi } from "vitest";

const { podeMock, usoMock } = vi.hoisted(() => ({
  podeMock: vi.fn(async () => true),
  usoMock: vi.fn(async () => ({
    pessoas: [{ nome: "Ana", cargo: "Gestor", logins: 2, telas: 5, diasComAcesso: 1, ultimoAcesso: "27/11/2026 10:00" }],
    telas: [{ tela: "QR-Code", aberturas: 3, pessoas: 1 }],
  })),
}));

vi.mock("@/lib/permissoes", () => ({ podeVerUsoDoPortal: podeMock }));
vi.mock("../../queries", async (original) => ({
  ...(await original<typeof import("../../queries")>()),
  getUsoDoPortal: usoMock,
}));

const { GET } = await import("./route");

const pedido = (query = "") => new Request(`http://localhost/dashboard/cadastros/uso-do-portal/export/excel${query}`);

beforeEach(() => {
  podeMock.mockResolvedValue(true);
  usoMock.mockClear();
});

describe("Exportar para Excel do Uso do Portal", () => {
  it("quem nao acompanha o uso recebe 403 e nada e consultado", async () => {
    podeMock.mockResolvedValue(false);
    const resposta = await GET(pedido());
    expect(resposta.status).toBe(403);
    expect(usoMock).not.toHaveBeenCalled();
  });

  it("periodo invalido recebe 400", async () => {
    const resposta = await GET(pedido("?data_inicial=2026-11-27&data_final=2026-11-01"));
    expect(resposta.status).toBe(400);
    expect(usoMock).not.toHaveBeenCalled();
  });

  it("devolve o CSV com os filtros da tela e o periodo no nome", async () => {
    const resposta = await GET(pedido("?data_inicial=2026-11-01&data_final=2026-11-27&cargo=GESTOR"));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Content-Disposition")).toBe(
      'attachment; filename="uso-do-portal-2026-11-01-a-2026-11-27.csv"',
    );
    expect(usoMock).toHaveBeenCalledWith({ dataInicial: "2026-11-01", dataFinal: "2026-11-27", cargo: "GESTOR" });
    const texto = await resposta.text();
    expect(texto).toContain('"Ana";"Gestor";"2";"5";"1";"27/11/2026 10:00"');
    expect(texto).toContain('"Tela";"Aberturas";"Pessoas"');
  });
});
