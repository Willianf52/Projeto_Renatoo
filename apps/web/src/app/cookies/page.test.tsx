// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CookiesPage from "./page";

vi.mock("@/components/HeroPanel", () => ({ BrandLogo: () => null }));

afterEach(cleanup);

describe("Politica de Cookies", () => {
  it("lista o que o portal guarda, com o prazo real da sessao (30 dias)", () => {
    render(<CookiesPage />);
    for (const item of ["Sessão de login", "Lembrar meu login", "Tema da tela", "Proteção do login"]) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(screen.getByText(/no máximo 30 dias/)).toBeInTheDocument();
    expect(screen.getByText(/por 30 segundos/)).toBeInTheDocument();
  });

  // So cookies necessarios: por isso nao ha aviso de consentimento. Se entrar
  // analytics, este teste deve falhar junto com a mudanca do texto.
  it("declara que nao usa cookie de terceiros nem de medicao de audiencia", () => {
    render(<CookiesPage />);
    expect(screen.getByText(/nenhum cookie de terceiros/)).toBeInTheDocument();
    expect(screen.getByText(/não pede consentimento/)).toBeInTheDocument();
  });

  it("liga para os Termos e a Privacidade, e nao para si mesma no rodape", () => {
    render(<CookiesPage />);
    expect(screen.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
    expect(screen.getAllByRole("link", { name: "Política de Privacidade" })[0]).toHaveAttribute("href", "/privacidade");
    expect(screen.queryByRole("link", { name: "Política de Cookies" })).not.toBeInTheDocument();
  });
});
