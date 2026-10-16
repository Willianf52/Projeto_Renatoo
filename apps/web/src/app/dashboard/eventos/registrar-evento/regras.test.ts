import { describe, expect, it } from "vitest";
import { eventosDoSite, lerAnexos, lerRegistro, subtiposDe } from "./regras";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

describe("lerRegistro", () => {
  it("le site, evento e os opcionais", () => {
    expect(lerRegistro(formulario({ site_id: "4", evento_id: "2", subevento_id: "", observacao: "  Portão  " }))).toEqual({
      ok: true,
      dados: { siteId: 4, eventoId: 2, subeventoId: null, classificacaoId: null, observacao: "Portão" },
    });
  });

  it("exige site e evento e recusa id torto", () => {
    expect(lerRegistro(formulario({ evento_id: "2" }))).toEqual({ ok: false, erro: "Escolha o site." });
    expect(lerRegistro(formulario({ site_id: "4" }))).toEqual({ ok: false, erro: "Escolha o evento." });
    expect(lerRegistro(formulario({ site_id: "4", evento_id: "2", subevento_id: "abc" })).ok).toBe(false);
  });
});

describe("lerAnexos", () => {
  it("aceita so caminhos da pasta da propria ocorrencia", () => {
    const bom = [{ storage_path: `7/${UUID}-foto.jpg`, nome: "Foto.jpg" }];
    expect(lerAnexos(7, bom)).toEqual([{ storage_path: `7/${UUID}-foto.jpg`, nome: "Foto.jpg" }]);
    expect(lerAnexos(8, bom)).toBeNull();
    expect(lerAnexos(7, [])).toBeNull();
    expect(lerAnexos(7, "x")).toBeNull();
  });
});

describe("eventos do site e subtipos", () => {
  const eventos = [
    { id: 1, nome: "Portaria", superiorId: null, sites: [] },
    { id: 2, nome: "Portão", superiorId: 1, sites: [] },
    { id: 3, nome: "Só no posto 9", superiorId: null, sites: [9] },
  ];

  it("evento sem sites vale para todos; com sites, so para eles; subtipo nao aparece como evento", () => {
    expect(eventosDoSite(eventos, 4).map((e) => e.id)).toEqual([1]);
    expect(eventosDoSite(eventos, 9).map((e) => e.id)).toEqual([1, 3]);
  });

  it("subtipos sao os filhos do evento escolhido", () => {
    expect(subtiposDe(eventos, 1).map((e) => e.id)).toEqual([2]);
    expect(subtiposDe(eventos, null)).toEqual([]);
  });
});
