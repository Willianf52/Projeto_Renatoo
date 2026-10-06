import { describe, expect, it } from "vitest";
import { montarEmailDeOcorrencia, type DadosDaMensagem } from "./emails-de-ocorrencia";

const base: DadosDaMensagem = {
  motivo: "ABERTURA",
  numero: 5,
  ano: 2026,
  evento: "Uniforme",
  site: "Posto Central",
  abertaEm: "2026-10-06T21:29:23Z",
  pergunta: "Inspecionar uso dos uniformes",
  resposta: "NAO",
  observacao: null,
  textoDoAndamento: null,
  link: "https://portal.exemplo/dashboard/eventos/painel-de-eventos/5",
};

describe("montarEmailDeOcorrencia", () => {
  it("abertura: assunto com número, evento, site e situação; corpo com a resposta legível e o link", () => {
    const { assunto, texto } = montarEmailDeOcorrencia(base);

    expect(assunto).toBe("Evento nº 5/2026 - Uniforme - Posto Central - Aberto");
    expect(texto).toContain("Aberto em: 06/10/2026, 18:29");
    expect(texto).toContain("Resposta: Não conforme");
    expect(texto).toContain("Ver no portal: https://portal.exemplo/dashboard/eventos/painel-de-eventos/5");
    expect(texto).not.toContain("Observação:");
  });

  it("finalização: traz as ações realizadas", () => {
    const { assunto, texto } = montarEmailDeOcorrencia({
      ...base,
      motivo: "FINALIZACAO",
      textoDoAndamento: "Uniforme trocado.",
      observacao: "Faltava o crachá",
    });

    expect(assunto).toMatch(/- Finalizado$/);
    expect(texto).toContain("Observação: Faltava o crachá");
    expect(texto).toContain("Ações realizadas:\nUniforme trocado.");
  });

  it("análise: traz o texto da análise", () => {
    const { texto } = montarEmailDeOcorrencia({ ...base, motivo: "ANALISE", textoDoAndamento: "Apurando." });
    expect(texto).toContain("Análise:\nApurando.");
  });

  it("resposta Sim aparece como Sim", () => {
    expect(montarEmailDeOcorrencia({ ...base, resposta: "SIM" }).texto).toContain("Resposta: Sim");
  });

  it("quebra de linha no nome não chega ao assunto", () => {
    const { assunto } = montarEmailDeOcorrencia({ ...base, site: "Posto\r\nBcc: alguem@fora" });
    expect(assunto).not.toMatch(/[\r\n]/);
  });
});
