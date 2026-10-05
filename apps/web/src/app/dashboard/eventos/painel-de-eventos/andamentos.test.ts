import { describe, expect, it } from "vitest";

import {
  aceitaAndamento,
  assinaturaConfere,
  caminhoDoAnexo,
  caminhoValido,
  erroDoArquivo,
  lerAndamento,
  lerEmails,
  MAXIMO_DE_BYTES,
  nomeSeguro,
  tipoPorExtensao,
} from "./andamentos";

const UUID = "0b6c1f2e-3a4d-4b5c-8d9e-0f1a2b3c4d5e";
const OUTRO_UUID = "11111111-2222-4333-8444-555555555555";

function formulario(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [chave, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) f.append(chave, v);
  }
  return f;
}

const BASE = { ocorrencia_id: "7", tipo: "ANALISE", tipo_analise_id: "1", texto: "Vamos apurar" };

describe("arquivos", () => {
  it("o tipo vem da extensao, nao do navegador", () => {
    expect(tipoPorExtensao("Laudo.PDF")).toBe("application/pdf");
    expect(tipoPorExtensao("foto.jpeg")).toBe("image/jpeg");
    expect(tipoPorExtensao("pacote.zip")).toBe("application/zip");
    expect(tipoPorExtensao("planilha.xlsx")).toContain("spreadsheetml");
    expect(tipoPorExtensao("pagina.html")).toBeNull();
    expect(tipoPorExtensao("semextensao")).toBeNull();
  });

  it("recusa formato, arquivo vazio e arquivo acima de 10 MB", () => {
    expect(erroDoArquivo({ name: "a.exe", size: 10 })).toMatch(/formato não aceito/);
    expect(erroDoArquivo({ name: "a.pdf", size: 0 })).toMatch(/vazio/);
    expect(erroDoArquivo({ name: "a.pdf", size: MAXIMO_DE_BYTES + 1 })).toMatch(/10 MB/);
    expect(erroDoArquivo({ name: "a.pdf", size: MAXIMO_DE_BYTES })).toBeNull();
  });

  it("os primeiros bytes confirmam a extensao: um HTML renomeado para .pdf nao passa", () => {
    expect(assinaturaConfere("a.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true);
    expect(assinaturaConfere("a.pdf", new TextEncoder().encode("<html>"))).toBe(false);
    expect(assinaturaConfere("a.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
    expect(assinaturaConfere("a.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(assinaturaConfere("a.xlsx", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(assinaturaConfere("a.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe(true);
    expect(assinaturaConfere("a.txt", new Uint8Array([0x41]))).toBe(false);
  });

  it("nome seguro: sem acento, espaco nem caractere de caminho", () => {
    expect(nomeSeguro("Relatório final (1).PDF")).toBe("relatorio-final-1.pdf");
    expect(nomeSeguro("../../etc/passwd.zip")).toBe("etc-passwd.zip");
    expect(nomeSeguro("???.png")).toBe("arquivo.png");
  });

  it("o caminho montado no navegador e o que a Server Action aceita", () => {
    const caminho = caminhoDoAnexo(7, UUID, "Laudo Final.pdf");
    expect(caminho).toBe(`7/${UUID}-laudo-final.pdf`);
    expect(caminhoValido(7, caminho)).toBe(true);
  });

  it("recusa caminho de outra ocorrencia, com .. ou fora do formato", () => {
    expect(caminhoValido(8, `7/${UUID}-a.pdf`)).toBe(false);
    expect(caminhoValido(7, `7/../8/${UUID}-a.pdf`)).toBe(false);
    expect(caminhoValido(7, `7/${UUID}-a.html`)).toBe(false);
    expect(caminhoValido(7, `7/arquivo.pdf`)).toBe(false);
  });
});

describe("lerEmails", () => {
  it("separa por virgula, ponto e virgula ou espaco, sem repetir", () => {
    expect(lerEmails("A@x.com; b@y.com, a@x.com  c@z.org")).toEqual({
      ok: true,
      emails: ["a@x.com", "b@y.com", "c@z.org"],
    });
    expect(lerEmails("")).toEqual({ ok: true, emails: [] });
  });

  it("recusa e-mail torto e mais de 10", () => {
    expect(lerEmails("a@x.com, nao-e-email")).toEqual({ ok: false, erro: "E-mail inválido: nao-e-email" });
    const onze = Array.from({ length: 11 }, (_, i) => `u${i}@x.com`).join(",");
    expect(lerEmails(onze)).toMatchObject({ ok: false });
  });
});

describe("lerAndamento", () => {
  it("analise valida, com responsavel, grupo, apoio e e-mails", () => {
    const r = lerAndamento(
      formulario({
        ...BASE,
        tipo_classificacao_id: "2",
        responsavel_id: UUID,
        grupo_usuario_id: "3",
        apoio: [UUID, OUTRO_UUID, UUID],
        emails_externos: "cliente@x.com",
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      dados: {
        ocorrenciaId: 7,
        tipo: "ANALISE",
        tipoAnaliseId: 1,
        classificacaoId: 2,
        responsavelId: UUID,
        grupoUsuarioId: 3,
        apoio: [UUID, OUTRO_UUID],
        emailsExternos: ["cliente@x.com"],
      },
    });
  });

  it("finalizacao ignora classificacao, responsavel, grupo e apoio, e guarda quem avisar", () => {
    const r = lerAndamento(
      formulario({
        ...BASE,
        tipo: "FINALIZACAO",
        tipo_classificacao_id: "2",
        responsavel_id: UUID,
        grupo_usuario_id: "3",
        apoio: [UUID],
        avisar: [OUTRO_UUID],
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      dados: { classificacaoId: null, responsavelId: null, grupoUsuarioId: null, apoio: [], avisar: [OUTRO_UUID] },
    });
  });

  it("pede o texto certo para cada tipo", () => {
    expect(lerAndamento(formulario({ ...BASE, texto: "  " }))).toEqual({ ok: false, erro: "Escreva a análise do evento." });
    expect(lerAndamento(formulario({ ...BASE, tipo: "FINALIZACAO", texto: "" }))).toEqual({
      ok: false,
      erro: "Informe as ações realizadas.",
    });
  });

  it("recusa ids e uuids tortos antes de chegar ao banco", () => {
    expect(lerAndamento(formulario({ ...BASE, ocorrencia_id: "abc" })).ok).toBe(false);
    expect(lerAndamento(formulario({ ...BASE, tipo: "OUTRO" })).ok).toBe(false);
    expect(lerAndamento(formulario({ ...BASE, tipo_analise_id: "" })).ok).toBe(false);
    expect(lerAndamento(formulario({ ...BASE, responsavel_id: "nao-e-uuid" })).ok).toBe(false);
    expect(lerAndamento(formulario({ ...BASE, apoio: ["nao-e-uuid"] })).ok).toBe(false);
    expect(lerAndamento(formulario({ ...BASE, texto: "x".repeat(4001) })).ok).toBe(false);
  });

  it("aceita so anexos cujo caminho e desta ocorrencia", () => {
    const bom = JSON.stringify([{ storage_path: `7/${UUID}-laudo.pdf`, nome: "Laudo.pdf" }]);
    expect(lerAndamento(formulario({ ...BASE, arquivos_enviados: bom }))).toMatchObject({
      ok: true,
      dados: { arquivos: [{ storage_path: `7/${UUID}-laudo.pdf`, nome: "Laudo.pdf" }] },
    });

    const alheio = JSON.stringify([{ storage_path: `8/${UUID}-laudo.pdf`, nome: "Laudo.pdf" }]);
    expect(lerAndamento(formulario({ ...BASE, arquivos_enviados: alheio }))).toEqual({
      ok: false,
      erro: "Anexos inválidos. Anexe os arquivos de novo.",
    });
    expect(lerAndamento(formulario({ ...BASE, arquivos_enviados: "{nao-e-json" })).ok).toBe(false);
  });
});

describe("aceitaAndamento", () => {
  it("ocorrencia encerrada nao recebe mais nada", () => {
    expect(aceitaAndamento("AGUARDANDO")).toBe(true);
    expect(aceitaAndamento("EM_ANALISE")).toBe(true);
    expect(aceitaAndamento("CRITICO")).toBe(true);
    expect(aceitaAndamento("ATENDIDO")).toBe(false);
    expect(aceitaAndamento("CANCELADO")).toBe(false);
  });
});
