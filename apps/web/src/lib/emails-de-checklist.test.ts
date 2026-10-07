import { describe, expect, it } from "vitest";
import { montarEmailDeChecklist, type DadosDoChecklist } from "./emails-de-checklist";

const BASE: DadosDoChecklist = {
  tipo: "CONSULTORIA",
  modelo: "Portaria",
  site: "Posto Central",
  funcionario: "Ana Souza",
  enviadoEm: "2026-10-06T21:29:23Z",
  naoConformidades: 0,
  nota: 100,
  motivo: null,
  link: "https://portal.test/dashboard/checklistlab/historico-de-checklist/31",
};

describe("montarEmailDeChecklist", () => {
  it("consultoria conforme: assunto, horario de Brasilia, nota e link", () => {
    const { assunto, texto } = montarEmailDeChecklist(BASE);

    expect(assunto).toBe("Checklist enviado - Portaria - Posto Central - Ana Souza");
    expect(texto).toContain("Checklist: Consultoria (Portaria)");
    expect(texto).toContain("Enviado em: 06/10/2026, 18:29");
    expect(texto).toContain("Situação: Conforme");
    expect(texto).toContain("Nota: 100%");
    expect(texto).toContain(`Ver no portal: ${BASE.link}`);
    expect(texto).toContain("como superior de Ana Souza");
  });

  it("corretiva leva o motivo e nao tem nota", () => {
    const { assunto, texto } = montarEmailDeChecklist({
      ...BASE,
      tipo: "CORRETIVA",
      modelo: null,
      nota: null,
      motivo: "Portão danificado",
    });

    expect(assunto).toBe("Checklist enviado - Corretiva - Posto Central - Ana Souza");
    expect(texto).toContain("Situação: Corretiva");
    expect(texto).toContain("Motivo:\nPortão danificado");
    expect(texto).not.toContain("Nota:");
  });

  it("plural das nao conformidades, e quebra de linha nao entra no assunto", () => {
    const { assunto, texto } = montarEmailDeChecklist({ ...BASE, naoConformidades: 2, site: "Posto\nCentral" });

    expect(texto).toContain("Situação: 2 não conformidades");
    expect(assunto).not.toMatch(/[\r\n]/);
  });
});
