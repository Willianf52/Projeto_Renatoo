// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/HeroPanel", () => ({ BrandLogo: () => null }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function renderizar(urlDoSuporte?: string) {
  if (urlDoSuporte !== undefined) vi.stubEnv("NEXT_PUBLIC_URL_SUPORTE", urlDoSuporte);
  const { default: PrivacidadePage } = await import("./page");
  return render(<PrivacidadePage />);
}

// A Play Store e a App Store pedem esta pagina para publicar o app (26/10/2026).
describe("Politica de Privacidade", () => {
  it("nao vai ao ar com campo a preencher (razao social e CNPJ do responsavel)", async () => {
    const { container } = await renderizar();

    expect(container.textContent).not.toMatch(/PREENCHER/);
  });

  it("identifica a empresa responsavel pelos dados", async () => {
    const { container } = await renderizar();

    expect(container.textContent).toContain(
      'Esta política explica como Up Serviços Especializados ("Up Serviços") trata os dados pessoais',
    );
  });

  it("diz o que o app nao coleta, como as lojas perguntam", async () => {
    await renderizar();

    expect(screen.getByText(/não coleta localização, contatos, áudio/)).toBeInTheDocument();
  });

  it("com o suporte configurado, o pedido do titular leva ao link do suporte", async () => {
    await renderizar("https://wa.me/5500000000000");

    expect(screen.getByRole("link", { name: "suporte da Up Serviços" })).toHaveAttribute(
      "href",
      "https://wa.me/5500000000000",
    );
  });

  it("sem o suporte configurado, o texto fica sem link morto", async () => {
    await renderizar("");

    expect(screen.queryByRole("link", { name: "suporte da Up Serviços" })).toBeNull();
    expect(screen.getByText(/fale com o suporte da Up Serviços/)).toBeInTheDocument();
  });
});
