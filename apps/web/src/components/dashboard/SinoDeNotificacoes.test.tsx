// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Linha = { id: number; titulo: string; texto: string; link: string | null; criada_em: string; lida_em: string | null };

const estado = vi.hoisted(() => ({
  linhas: [] as Linha[],
  marcadas: [] as number[][],
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({ limit: async () => ({ data: estado.linhas, error: null }) }),
      }),
      update: () => ({
        in: async (_coluna: string, ids: number[]) => {
          estado.marcadas.push(ids);
          return { error: null };
        },
      }),
    }),
  }),
}));

const { SinoDeNotificacoes } = await import("./SinoDeNotificacoes");

beforeEach(() => {
  estado.marcadas = [];
  estado.linhas = [
    { id: 1, titulo: "Revisão do veículo", texto: "ABC1D23 passou de 9.000 km", link: "/dashboard", criada_em: "2026-11-17T12:00:00Z", lida_em: null },
    { id: 2, titulo: "Aviso antigo", texto: "", link: null, criada_em: "2026-11-10T12:00:00Z", lida_em: "2026-11-11T12:00:00Z" },
  ];
});
afterEach(cleanup);

describe("SinoDeNotificacoes", () => {
  it("mostra quantas não lidas há", async () => {
    render(<SinoDeNotificacoes />);
    expect(await screen.findByRole("button", { name: "Avisos: 1 novos" })).toBeTruthy();
  });

  it("ao abrir, lista os avisos e marca como lidas só as não lidas", async () => {
    render(<SinoDeNotificacoes />);
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole("button", { name: "Avisos: 1 novos" }));

    expect(screen.getByText("Revisão do veículo")).toBeTruthy();
    expect(screen.getByText("Aviso antigo")).toBeTruthy();
    await waitFor(() => expect(estado.marcadas).toEqual([[1]]));
  });

  it("sem avisos, diz que não há nenhum", async () => {
    estado.linhas = [];
    render(<SinoDeNotificacoes />);
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole("button", { name: "Avisos" }));
    expect(screen.getByText("Nenhum aviso por enquanto.")).toBeTruthy();
  });
});
