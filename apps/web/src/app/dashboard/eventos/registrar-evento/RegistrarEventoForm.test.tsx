// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registrarEvento = vi.fn();
const anexarArquivosDaAbertura = vi.fn();
const upload = vi.fn();
const push = vi.fn();

vi.mock("./actions", () => ({
  registrarEvento: (...args: unknown[]) => registrarEvento(...args),
  anexarArquivosDaAbertura: (...args: unknown[]) => anexarArquivosDaAbertura(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload }) } }),
}));

import { RegistrarEventoForm } from "./RegistrarEventoForm";

// Cabecalho de um PNG de verdade: o formulario confere a assinatura.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function preencher(arquivos: File[]) {
  render(
    <RegistrarEventoForm
      sites={[{ value: "30", label: "[TESTE] Posto Central" }]}
      eventos={[{ id: 27, nome: "Uniforme", superiorId: null, sites: [] }]}
      classificacoes={[]}
    />,
  );
  fireEvent.change(screen.getByLabelText(/site/i), { target: { value: "30" } });
  fireEvent.change(screen.getByLabelText(/^evento/i), { target: { value: "27" } });
  const campo = screen.getByLabelText(/arquivos/i) as HTMLInputElement;
  Object.defineProperty(campo, "files", { value: arquivos, configurable: true });
  fireEvent.submit(campo.form!);
}

describe("RegistrarEventoForm", () => {
  beforeEach(() => {
    registrarEvento.mockReset().mockResolvedValue({ ok: true, id: 9, numeroAno: "10/2026" });
    anexarArquivosDaAbertura.mockReset().mockResolvedValue({});
    upload.mockReset().mockResolvedValue({ error: null });
    push.mockReset();
  });
  afterEach(cleanup);

  // Ensaio de 19/10: com arquivo, o `await` da conferencia vinha antes do
  // `new FormData(e.currentTarget)`, que entao quebrava.
  it("registra com arquivo anexado e abre a ocorrencia", async () => {
    preencher([new File([PNG], "foto.png", { type: "image/png" })]);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/eventos/painel-de-eventos/9"));
    const enviado = registrarEvento.mock.calls[0][0] as FormData;
    expect(enviado.get("site_id")).toBe("30");
    expect(enviado.get("evento_id")).toBe("27");
    expect(enviado.has("arquivos")).toBe(false);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(anexarArquivosDaAbertura).toHaveBeenCalledWith(9, expect.stringContaining("foto.png"));
  });

  it("falha de rede ao registrar libera o botao com aviso", async () => {
    registrarEvento.mockRejectedValue(new TypeError("Failed to fetch"));
    preencher([]);

    expect(await screen.findByText(/Não foi possível registrar/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /salvar/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("falha depois de registrar avisa que a ocorrencia existe", async () => {
    anexarArquivosDaAbertura.mockRejectedValue(new TypeError("Failed to fetch"));
    preencher([new File([PNG], "foto.png", { type: "image/png" })]);

    expect(await screen.findByText(/Ocorrência nº 10\/2026 registrada/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
