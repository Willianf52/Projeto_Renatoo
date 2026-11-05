import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { gerarPdfDeTabela } from "./pdf-de-tabela";

describe("gerarPdfDeTabela", () => {
  it("gera um PDF de verdade, com quebra de pagina e acentos", async () => {
    const linhas = Array.from({ length: 120 }, (_, i) => [
      String(1000 + i),
      "04/11/2026 08:12",
      "Dispositivo Móvel",
      "Inspetor de Teste",
      "Grupo Teste → Posto Central",
      "Portaria",
      "",
      i % 7 === 0 ? "Observação longa que precisa quebrar em mais de uma linha dentro da célula da tabela" : "",
    ]);
    const bytes = await gerarPdfDeTabela({
      titulo: "Relatório Coletor de Dados",
      apoio: "PERÍODO: 01/11/2026 ATÉ 04/11/2026",
      colunas: ["Coleta", "Data / Hora", "Coletor", "Funcionário", "Local", "Área", "Evento", "Observação"],
      linhas,
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    if (process.env.PDF_DE_TABELA_SAIDA) writeFileSync(process.env.PDF_DE_TABELA_SAIDA, bytes);
  });
});
