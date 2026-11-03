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
    nome: "Posto Centro",
    sigla: "PC",
    latitude: -23.5,
    longitude: -46.6,
    observacao: "Portaria 24h",
    cep: "01000-000",
    endereco: "Rua A",
    numero: "10",
    bairro: "Centro",
    complemento: "Sala 2",
    cod_cliente: "C1",
    cod_posto: "P1",
    info_adicional_1: "i1",
    info_adicional_2: "i2",
    emails_eventos: ["a@x.test", "b@x.test"],
    emails_checklist: ["c@x.test"],
    notificar_eventos: ["e0530000-0000-0000-0000-000000000009"],
    responsavel_perda_id: null,
    responsavel_prevencao_id: "e0530000-0000-0000-0000-000000000002",
    tipo_intervencao: "RASTREADORES",
    data_instalacao: "2026-10-01",
    dias_instalacao: 30,
    data_desinstalacao: null,
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

  it("cópia completa, como no antigo: copia o endereço e os códigos, e marca o nome", () => {
    const valores = valoresParaDuplicar(modelo());

    expect(valores.nome).toBe("Posto Centro cópia");
    expect(valores.sigla).toBe("PC cópia");
    expect(valores.latitude).toBe("-23.5");
    expect(valores.endereco).toBe("Rua A");
    expect(valores.numero).toBe("10");
    expect(valores.codCliente).toBe("C1");
    expect(valores.codPosto).toBe("P1");
    expect(valores.observacao).toBe("Portaria 24h");
    expect(valores.infoAdicional2).toBe("i2");
    expect(valores.emailsEventos).toBe("a@x.test, b@x.test");
    // Campos da 0082 tambem vao na copia completa.
    expect(valores.emailsChecklist).toBe("c@x.test");
    expect(valores.notificarEventos).toEqual(["e0530000-0000-0000-0000-000000000009"]);
    expect(valores.responsavelPrevencaoId).toBe("e0530000-0000-0000-0000-000000000002");
    expect(valores.tipoIntervencao).toBe("RASTREADORES");
    expect(valores.dataInstalacao).toBe("2026-10-01");
    expect(valores.diasInstalacao).toBe("30");
  });

  it("sem sigla na origem, a cópia continua sem sigla", () => {
    expect(valoresParaDuplicar(modelo({ sigla: null })).sigla).toBe("");
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

    expect(segundo.nome).toBe("Posto Centro cópia");
    expect(VALORES_VAZIOS.nome).toBe("");
  });
});
