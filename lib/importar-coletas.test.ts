import { describe, expect, it } from "vitest";
import {
  chaveDaVisita,
  indexarPorNome,
  lerLoteDeColetas,
  resolverReferencia,
  LIMITE_DO_LOTE,
} from "./importar-coletas";

/** Linha valida minima; cada teste altera so o campo que esta exercitando. */
function coletaValida(extra: Record<string, unknown> = {}) {
  return {
    numero_coleta: 1042,
    site: "Agência Centro",
    data_hora: "2026-08-01T08:12:00-03:00",
    ...extra,
  };
}

describe("lerLoteDeColetas", () => {
  it("aceita o envelope documentado", () => {
    const resultado = lerLoteDeColetas({ coletas: [coletaValida()] });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.coletas).toHaveLength(1);
    expect(resultado.coletas[0].numeroColeta).toBe(1042);
    expect(resultado.coletas[0].site).toBe("Agência Centro");
  });

  it("aceita um array cru, sem envelope", () => {
    // E o que sai de um JSON.stringify de planilha convertida; recusar nao
    // protegeria nada.
    const resultado = lerLoteDeColetas([coletaValida()]);
    expect(resultado.ok).toBe(true);
  });

  it("recusa corpo que nao e lista nem envelope", () => {
    expect(lerLoteDeColetas({ linhas: [] })).toEqual({
      ok: false,
      erro: 'corpo deve ser um array ou { "coletas": [...] }',
    });
  });

  it("recusa lote vazio", () => {
    expect(lerLoteDeColetas([])).toEqual({ ok: false, erro: "lote vazio" });
  });

  it("recusa lote acima do limite", () => {
    const lote = Array.from({ length: LIMITE_DO_LOTE + 1 }, () => coletaValida());
    const resultado = lerLoteDeColetas(lote);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.erro).toContain(`excede o limite de ${LIMITE_DO_LOTE}`);
  });

  it("aponta a posicao da linha invalida", () => {
    // Sem o indice, "campo obrigatorio ausente" num lote de mil linhas nao da
    // por onde comecar a procurar.
    const resultado = lerLoteDeColetas([
      coletaValida(),
      coletaValida({ site: "" }),
    ]);

    expect(resultado).toEqual({ ok: false, erro: 'linha 2: "site" é obrigatório' });
  });

  describe("numero_coleta", () => {
    it("aceita numero em texto", () => {
      const resultado = lerLoteDeColetas([coletaValida({ numero_coleta: "77" })]);
      expect(resultado.ok && resultado.coletas[0].numeroColeta).toBe(77);
    });

    it("recusa valor nao inteiro", () => {
      const resultado = lerLoteDeColetas([coletaValida({ numero_coleta: 7.5 })]);
      expect(resultado).toEqual({
        ok: false,
        erro: 'linha 1: "numero_coleta" deve ser um inteiro positivo',
      });
    });

    it("recusa zero e negativo", () => {
      expect(lerLoteDeColetas([coletaValida({ numero_coleta: 0 })]).ok).toBe(false);
      expect(lerLoteDeColetas([coletaValida({ numero_coleta: -3 })]).ok).toBe(false);
    });
  });

  describe("data_hora", () => {
    it("normaliza para ISO em UTC preservando o instante", () => {
      const resultado = lerLoteDeColetas([
        coletaValida({ data_hora: "2026-08-01T08:12:00-03:00" }),
      ]);

      expect(resultado.ok && resultado.coletas[0].dataHora).toBe("2026-08-01T11:12:00.000Z");
    });

    it("aceita o sufixo Z", () => {
      const resultado = lerLoteDeColetas([coletaValida({ data_hora: "2026-08-01T11:12:00Z" })]);
      expect(resultado.ok && resultado.coletas[0].dataHora).toBe("2026-08-01T11:12:00.000Z");
    });

    it("aceita deslocamento sem os dois pontos", () => {
      const resultado = lerLoteDeColetas([coletaValida({ data_hora: "2026-08-01T08:12:00-0300" })]);
      expect(resultado.ok && resultado.coletas[0].dataHora).toBe("2026-08-01T11:12:00.000Z");
    });

    it("recusa timestamp sem fuso", () => {
      // O ponto do exercicio: sem fuso, o mesmo lote importado de duas maquinas
      // com relogios em fusos diferentes geraria horarios diferentes, calado.
      const resultado = lerLoteDeColetas([coletaValida({ data_hora: "2026-08-01T08:12:00" })]);

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.erro).toContain("precisa terminar com o fuso");
    });

    it("recusa data invalida ainda que tenha fuso", () => {
      const resultado = lerLoteDeColetas([coletaValida({ data_hora: "2026-13-45T08:12:00-03:00" })]);

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.erro).toContain("não é uma data/hora válida");
    });

    it("exige data_hora, mas nao data_integracao", () => {
      expect(lerLoteDeColetas([coletaValida({ data_hora: null })]).ok).toBe(false);

      const resultado = lerLoteDeColetas([coletaValida({ data_integracao: null })]);
      expect(resultado.ok && resultado.coletas[0].dataIntegracao).toBeNull();
    });
  });

  /**
   * A coordenada saiu do banco na 0022, mas o filtro Com/Sem Localizacao
   * voltou na 0023 apoiado num booleano: ele sempre perguntou pela presenca,
   * nunca pelo valor. O contrato com quem envia os lotes nao mudou.
   */
  describe("presença de localização", () => {
    it("marca temLocalizacao quando o lote traz o par de coordenadas", () => {
      const resultado = lerLoteDeColetas([
        coletaValida({ latitude: "-30.0346", longitude: "-51.2177" }),
      ]);

      expect(resultado.ok && resultado.coletas[0].temLocalizacao).toBe(true);
    });

    it("nao guarda a coordenada, so a presenca", () => {
      const resultado = lerLoteDeColetas([
        coletaValida({ latitude: "-30.0346", longitude: "-51.2177" }),
      ]);

      expect(resultado.ok && "latitude" in resultado.coletas[0]).toBe(false);
      expect(resultado.ok && "longitude" in resultado.coletas[0]).toBe(false);
    });

    it("ausencia de sinal vira false", () => {
      const resultado = lerLoteDeColetas([coletaValida()]);

      expect(resultado.ok && resultado.coletas[0].temLocalizacao).toBe(false);
    });

    /** Meia coordenada nao localiza nada: o par tem que estar completo. */
    it("so uma das duas nao conta como localizacao", () => {
      const resultado = lerLoteDeColetas([coletaValida({ latitude: "-30.0346" })]);

      expect(resultado.ok && resultado.coletas[0].temLocalizacao).toBe(false);
    });

    /** Nao guardamos o valor, entao rigor de intervalo seria rigor sobre um
     * campo que o sistema declarou nao usar. */
    it("nao recusa coordenada fora de intervalo, porque nao le o valor", () => {
      expect(lerLoteDeColetas([coletaValida({ latitude: 91, longitude: 181 })]).ok).toBe(true);
    });
  });

  describe("campos de texto opcionais", () => {
    it("trata string vazia e espaco em branco como ausencia", () => {
      const resultado = lerLoteDeColetas([coletaValida({ observacao: "   ", evento: "" })]);

      expect(resultado.ok && resultado.coletas[0].observacao).toBeNull();
      expect(resultado.ok && resultado.coletas[0].evento).toBeNull();
    });

    it("apara espacos das bordas", () => {
      const resultado = lerLoteDeColetas([coletaValida({ area: "  Início  " })]);
      expect(resultado.ok && resultado.coletas[0].area).toBe("Início");
    });

    it("recusa texto acima do limite", () => {
      const resultado = lerLoteDeColetas([coletaValida({ observacao: "x".repeat(1001) })]);

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.erro).toContain("no máximo 1000 caracteres");
    });

    it("recusa tipo errado", () => {
      const resultado = lerLoteDeColetas([coletaValida({ area: 3 })]);
      expect(resultado).toEqual({ ok: false, erro: 'linha 1: "area" deve ser texto' });
    });
  });

  it("recusa item que nao e objeto", () => {
    expect(lerLoteDeColetas(["texto solto"])).toEqual({
      ok: false,
      erro: "linha 1: cada item deve ser um objeto",
    });
  });
});

describe("indexarPorNome", () => {
  it("indexa ignorando a caixa", () => {
    const indice = indexarPorNome([{ id: 1, nome: "Início" }], "nome");
    expect(indice.mapa.get("início")).toBe(1);
  });

  it("nao equipara nome com e sem acento", () => {
    // Deliberado: normalizar acento faria "Ação" e "Acao" virarem o mesmo
    // registro, e ai dois cadastros legitimos colidiriam em silencio.
    const indice = indexarPorNome([{ id: 1, nome: "Início" }], "nome");
    expect(indice.mapa.get("inicio")).toBeUndefined();
  });

  it("marca nome repetido como ambiguo em vez de escolher um", () => {
    const indice = indexarPorNome(
      [
        { id: 1, nome: "Agência Centro" },
        { id: 2, nome: "Agência Centro" },
      ],
      "nome",
    );

    expect(indice.ambiguos.has("agência centro")).toBe(true);
  });

  it("aceita lista nula", () => {
    // Tipo explicito: sem linhas de onde inferir, `keyof T` colapsaria em "id".
    expect(indexarPorNome<{ id: number; nome: string }>(null, "nome").mapa.size).toBe(0);
  });
});

describe("resolverReferencia", () => {
  const indice = indexarPorNome(
    [
      { id: 7, nome: "Agência Centro" },
      { id: 8, nome: "Loja Ipiranga" },
      { id: 9, nome: "Loja Ipiranga" },
    ],
    "nome",
  );

  it("resolve nome conhecido", () => {
    expect(resolverReferencia(indice, "Agência Centro", "site")).toEqual({ ok: true, id: 7 });
  });

  it("deixa passar ausencia como null", () => {
    expect(resolverReferencia(indice, null, "site")).toEqual({ ok: true, id: null });
  });

  it("recusa nome desconhecido em vez de gravar null", () => {
    // FK nula deixaria a coluna vazia na tela, indistinguivel de um campo que o
    // dispositivo legitimamente nao preencheu.
    expect(resolverReferencia(indice, "Agência Sul", "site")).toEqual({
      ok: false,
      erro: 'site "Agência Sul" não está cadastrado',
    });
  });

  it("recusa nome ambiguo em vez de escolher pela ordem do banco", () => {
    expect(resolverReferencia(indice, "Loja Ipiranga", "site")).toEqual({
      ok: false,
      erro: 'site "Loja Ipiranga" corresponde a mais de um cadastro',
    });
  });
});

describe("chaveDaVisita", () => {
  it("combina numero e site, que e a unique da migration 0004", () => {
    expect(chaveDaVisita(10, 3)).toBe("10::3");
  });

  it("nao confunde numeros que se concatenariam igual", () => {
    // Sem separador, (1, 23) e (12, 3) dariam a mesma chave e duas visitas
    // distintas seriam agrupadas numa so.
    expect(chaveDaVisita(1, 23)).not.toBe(chaveDaVisita(12, 3));
  });
});
