import { describe, expect, it } from "vitest";
import { aplicarPermissoesWeb, eventosDoSite, lerAnexos, lerRegistro, subtiposDe } from "./regras";

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
      dados: { siteId: 4, eventoId: 2, subeventoId: null, classificacaoId: null, observacao: "Portão", local: null },
    });
  });

  it("lê o Local do evento (0082), com espaços normalizados, e recusa acima de 200", () => {
    const lido = lerRegistro(formulario({ site_id: "4", evento_id: "2", local: "  Portaria   Norte " }));
    expect(lido).toMatchObject({ ok: true, dados: { local: "Portaria Norte" } });
    expect(lerRegistro(formulario({ site_id: "4", evento_id: "2", local: "x".repeat(201) })).ok).toBe(false);
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

describe("aplicarPermissoesWeb (0089)", () => {
  const eventos = [
    { id: 1, nome: "Livre", superiorId: null, sites: [] },
    { id: 2, nome: "Só do grupo A de usuários", superiorId: null, sites: [] },
    { id: 3, nome: "Só nos locais do grupo 10", superiorId: null, sites: [] },
    { id: 4, nome: "Site 101 fora do grupo 20", superiorId: null, sites: [101] },
  ];
  const grupoDoSite = new Map([
    [100, 10],
    [101, 10],
    [200, 20],
  ]);
  const permissoes = [
    { eventoId: 2, grupoSiteId: null, grupoUsuarioId: 7 },
    { eventoId: 3, grupoSiteId: 10, grupoUsuarioId: null },
    { eventoId: 4, grupoSiteId: 20, grupoUsuarioId: null },
  ];

  it("sem ser do grupo de usuarios, o evento some", () => {
    const vistos = aplicarPermissoesWeb(eventos, permissoes, new Set([9]), grupoDoSite).map((e) => e.id);
    expect(vistos).toEqual([1, 3, 4]);
  });

  it("do grupo de usuarios, o evento aparece", () => {
    const vistos = aplicarPermissoesWeb(eventos, permissoes, new Set([7]), grupoDoSite).map((e) => e.id);
    expect(vistos).toContain(2);
  });

  it("grupo de locais vira os sites do grupo; sem intersecao, nenhum site", () => {
    const resultado = aplicarPermissoesWeb(eventos, permissoes, new Set(), grupoDoSite);
    expect(resultado.find((e) => e.id === 3)?.sites).toEqual([100, 101]);
    expect(resultado.find((e) => e.id === 4)?.sites).toEqual([-1]);
  });
});
