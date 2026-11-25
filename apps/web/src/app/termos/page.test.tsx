// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TermosPage from "./page";

vi.mock("@/components/HeroPanel", () => ({ BrandLogo: () => null }));

afterEach(cleanup);

describe("Termos de Uso", () => {
  it("diz que as contas sao criadas pela empresa e sao pessoais", () => {
    render(<TermosPage />);
    expect(screen.getByText(/as contas são criadas pela Up Serviços/)).toBeInTheDocument();
    expect(screen.getByText(/pessoal e intransferível/)).toBeInTheDocument();
  });

  it("liga para a Privacidade e os Cookies", () => {
    render(<TermosPage />);
    expect(screen.getAllByRole("link", { name: "Política de Privacidade" })[0]).toHaveAttribute("href", "/privacidade");
    expect(screen.getAllByRole("link", { name: "Política de Cookies" })[0]).toHaveAttribute("href", "/cookies");
  });
});
