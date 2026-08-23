import { describe, expect, it } from "vitest";
import {
  esquemaDeLeituraDeCampo,
  esquemaDeVisitaDeCampo,
  linhaDeLeitura,
  linhaDeVisita,
} from "./esquemas";
import { LIMITE_OBSERVACAO } from "./regras";

const LEITURA_MINIMA = { dataHora: "2026-08-01T08:12:00-03:00" };

function primeiroErro(resultado: { success: false; error: { issues: { message: string }[] } }) {
  return resultado.error.issues[0].message;
}

describe("esquemaDeLeituraDeCampo", () => {
  it("normaliza o instante para UTC e colapsa os opcionais em null", () => {
    const resultado = esquemaDeLeituraDeCampo.safeParse(LEITURA_MINIMA);

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data).toEqual({
      dataHora: "2026-08-01T11:12:00.000Z",
      areaId: null,
      qrCodeId: null,
      eventoId: null,
      acaoId: null,
      qualificadorId: null,
      observacao: null,
      temLocalizacao: false,
    });
  });

  it("trata observacao vazia e so-espaco como null, e apara as bordas", () => {
    const vazia = esquemaDeLeituraDeCampo.safeParse({ ...LEITURA_MINIMA, observacao: "   " });
    expect(vazia.success && vazia.data.observacao).toBeNull();

    const comTexto = esquemaDeLeituraDeCampo.safeParse({
      ...LEITURA_MINIMA,
      observacao: "  porta destrancada  ",
    });
    expect(comTexto.success && comTexto.data.observacao).toBe("porta destrancada");
  });

  it("deriva temLocalizacao apenas quando as duas coordenadas vem", () => {
    const comAsDuas = esquemaDeLeituraDeCampo.safeParse({
      ...LEITURA_MINIMA,
      latitude: -23.55,
      longitude: -46.63,
    });
    expect(comAsDuas.success && comAsDuas.data.temLocalizacao).toBe(true);

    // Uma coordenada sozinha nao localiza nada -- se isso contasse como "tem
    // localizacao", o filtro Com/Sem Localizacao da tela mentiria sobre uma
    // leitura que nunca teve ponto.
    const soUma = esquemaDeLeituraDeCampo.safeParse({ ...LEITURA_MINIMA, latitude: -23.55 });
    expect(soUma.success && soUma.data.temLocalizacao).toBe(false);
  });

  it("nao guarda a coordenada, so a presenca dela", () => {
    // A migration 0022 removeu as colunas; a 0023 deixou so `tem_localizacao`.
    const resultado = esquemaDeLeituraDeCampo.safeParse({
      ...LEITURA_MINIMA,
      latitude: -23.55,
      longitude: -46.63,
    });

    expect(resultado.success && resultado.data).not.toHaveProperty("latitude");
    expect(resultado.success && resultado.data).not.toHaveProperty("longitude");
  });

  it("recusa data/hora sem fuso com mensagem de tela", () => {
    const resultado = esquemaDeLeituraDeCampo.safeParse({ dataHora: "2026-08-01T08:12:00" });

    expect(resultado.success).toBe(false);
    expect(!resultado.success && primeiroErro(resultado)).toContain("precisa terminar com o fuso");
  });

  it("recusa data/hora ausente", () => {
    const resultado = esquemaDeLeituraDeCampo.safeParse({ dataHora: "" });

    expect(resultado.success).toBe(false);
    expect(!resultado.success && primeiroErro(resultado)).toContain("é obrigatório");
  });

  it("recusa observacao acima do limite", () => {
    const resultado = esquemaDeLeituraDeCampo.safeParse({
      ...LEITURA_MINIMA,
      observacao: "x".repeat(LIMITE_OBSERVACAO + 1),
    });

    expect(resultado.success).toBe(false);
    expect(!resultado.success && primeiroErro(resultado)).toContain(`${LIMITE_OBSERVACAO} caracteres`);
  });

  it("recusa referencia que nao e inteiro positivo", () => {
    for (const areaId of [0, -1, 1.5]) {
      expect(esquemaDeLeituraDeCampo.safeParse({ ...LEITURA_MINIMA, areaId }).success).toBe(false);
    }
  });
});

describe("esquemaDeVisitaDeCampo", () => {
  const VISITA_MINIMA = { numeroColeta: 12, siteId: 3, leituras: [LEITURA_MINIMA] };

  it("aceita a visita minima e colapsa os opcionais", () => {
    const resultado = esquemaDeVisitaDeCampo.safeParse(VISITA_MINIMA);

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data.funcionarioId).toBeNull();
    expect(resultado.success && resultado.data.motivoVisitaId).toBeNull();
    expect(resultado.success && resultado.data.coletorDadosId).toBeNull();
    expect(resultado.success && resultado.data.leituras).toHaveLength(1);
  });

  it("recusa visita sem leitura nenhuma", () => {
    // Sem esta regra a visita vazia entraria contando para a meta do site
    // (`metas_visitas`) sem representar inspecao nenhuma.
    const resultado = esquemaDeVisitaDeCampo.safeParse({ ...VISITA_MINIMA, leituras: [] });

    expect(resultado.success).toBe(false);
    expect(!resultado.success && primeiroErro(resultado)).toContain("ao menos uma leitura");
  });

  it("recusa funcionario que nao e uuid", () => {
    const resultado = esquemaDeVisitaDeCampo.safeParse({
      ...VISITA_MINIMA,
      funcionarioId: "willian",
    });

    expect(resultado.success).toBe(false);
    expect(!resultado.success && primeiroErro(resultado)).toContain("inválido");
  });

  it("propaga o erro da leitura de dentro do array", () => {
    const resultado = esquemaDeVisitaDeCampo.safeParse({
      ...VISITA_MINIMA,
      leituras: [{ dataHora: "2026-08-01T08:12:00" }],
    });

    expect(resultado.success).toBe(false);
    expect(!resultado.success && resultado.error.issues[0].path).toEqual(["leituras", 0, "dataHora"]);
  });
});

describe("ponte com o schema do banco", () => {
  it("mapeia a visita para as colunas de `visitas`", () => {
    const visita = esquemaDeVisitaDeCampo.parse({
      numeroColeta: 12,
      siteId: 3,
      funcionarioId: "a0000000-0000-4000-8000-000000000001",
      motivoVisitaId: 7,
      leituras: [LEITURA_MINIMA],
    });

    expect(linhaDeVisita(visita)).toEqual({
      numero_coleta: 12,
      site_id: 3,
      funcionario_id: "a0000000-0000-4000-8000-000000000001",
      motivo_visita_id: 7,
      coletor_dados_id: null,
    });
  });

  it("mapeia a leitura para as colunas de `leituras`, com o visita_id de fora", () => {
    // `visita_id` so existe depois do insert da visita, entao entra como
    // parametro em vez de sair do formulario.
    const leitura = esquemaDeLeituraDeCampo.parse({
      ...LEITURA_MINIMA,
      areaId: 4,
      observacao: "porta destrancada",
      latitude: -23.55,
      longitude: -46.63,
    });

    expect(linhaDeLeitura(leitura, 99)).toEqual({
      visita_id: 99,
      data_hora: "2026-08-01T11:12:00.000Z",
      area_id: 4,
      qr_code_id: null,
      evento_id: null,
      acao_id: null,
      qualificador_id: null,
      observacao: "porta destrancada",
      tem_localizacao: true,
    });
  });
});
