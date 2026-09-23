import { describe, expect, it } from "vitest";

import { VALORES_VAZIOS, valoresParaDuplicar, type ModeloParaDuplicar } from "./constantes";

function modelo(extra: Partial<ModeloParaDuplicar> = {}): ModeloParaDuplicar {
  return {
    grupo_site_id: 12,
    tipo_servico_id: 3,
    responsavel_id: "e0530000-0000-0000-0000-000000000001",
    site_superior_id: 40,
    regional: "Sul",
    cidade: "Porto Alegre",
    uf: "RS",
    pais: "Brasil",
    filial: "F-01",
    raio_metros: 150,
    recebe_visita: true,
    gerar_qrcode_automatico: true,
    gerar_registro_coletas: false,
    ativo: true,
    ...extra,
  };
}

describe("valoresParaDuplicar", () => {
  it("copia a classificação do site de origem", () => {
    const valores = valoresParaDuplicar(modelo());

    expect(valores.grupoSiteId).toBe("12");
    expect(valores.tipoServicoId).toBe("3");
    expect(valores.responsavelId).toBe("e0530000-0000-0000-0000-000000000001");
    expect(valores.siteSuperiorId).toBe("40");
    expect(valores.regional).toBe("Sul");
    expect(valores.cidade).toBe("Porto Alegre");
    expect(valores.uf).toBe("RS");
    expect(valores.filial).toBe("F-01");
    expect(valores.raioMetros).toBe("150");
  });

  it("deixa em branco tudo que localiza o site", () => {
    const valores = valoresParaDuplicar(modelo());

    // Copiados, produziriam dois cadastros que o olho nao distingue na
    // listagem -- e um QR-Code colado na parede errada.
    for (const campo of [
      "nome",
      "sigla",
      "latitude",
      "longitude",
      "cep",
      "endereco",
      "numero",
      "bairro",
      "complemento",
      "codCliente",
      "codPosto",
      "observacao",
      "infoAdicional1",
      "infoAdicional2",
    ] as const) {
      expect(valores[campo], campo).toBe("");
    }
  });

  it("leva as três chaves de comportamento junto", () => {
    const valores = valoresParaDuplicar(
      modelo({ recebe_visita: false, gerar_qrcode_automatico: false, gerar_registro_coletas: true }),
    );

    expect(valores.recebeVisita).toBe(false);
    expect(valores.gerarQrcodeAutomatico).toBe(false);
    expect(valores.gerarRegistroColetas).toBe(true);
  });

  it("acompanha a situação mesmo quando a origem está inativa", () => {
    // Duplicar um cadastro desativado e como se prepara o que ainda nao entrou
    // em operacao -- mesmo raciocinio de usuarios/constantes.ts.
    expect(valoresParaDuplicar(modelo({ ativo: false })).ativo).toBe(false);
  });

  it("preserva o país da origem em vez de assumir Brasil", () => {
    expect(valoresParaDuplicar(modelo({ pais: "Paraguai" })).pais).toBe("Paraguai");
  });

  it("converte nulo em campo vazio, sem deixar a string 'null' na tela", () => {
    const valores = valoresParaDuplicar(
      modelo({
        tipo_servico_id: null,
        responsavel_id: null,
        site_superior_id: null,
        regional: null,
        cidade: null,
        uf: null,
        filial: null,
        raio_metros: null,
      }),
    );

    expect(valores.tipoServicoId).toBe("");
    expect(valores.responsavelId).toBe("");
    expect(valores.siteSuperiorId).toBe("");
    expect(valores.regional).toBe("");
    expect(valores.cidade).toBe("");
    expect(valores.uf).toBe("");
    expect(valores.filial).toBe("");
    expect(valores.raioMetros).toBe("");
  });

  it("modelo ausente cai no formulário em branco", () => {
    // O atalho pode ter quebrado entre a listagem e o clique; a tela e "Novo
    // Site / Planta" de qualquer jeito.
    expect(valoresParaDuplicar(null)).toEqual(VALORES_VAZIOS);
  });

  it("devolve objeto novo a cada chamada, sem compartilhar estado", () => {
    const primeiro = valoresParaDuplicar(modelo());
    const segundo = valoresParaDuplicar(modelo());

    primeiro.nome = "Agência Centro";

    expect(segundo.nome).toBe("");
    expect(VALORES_VAZIOS.nome).toBe("");
  });
});
