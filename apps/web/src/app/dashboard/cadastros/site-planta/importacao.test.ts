import { describe, expect, it } from "vitest";
import {
  MAXIMO_DE_LINHAS,
  planejarImportacaoDeSites,
  type PlanoDeSites,
  type Referencias,
  type SiteExistente,
} from "./importacao";

/** O cabecalho do Excel do antigo, so com as colunas que o teste usa. */
const CABECALHO = [
  "id",
  "site_superior_id",
  "regional",
  "nome",
  "sigla",
  "email_responsavel",
  "observação",
  "cidade",
  "uf",
  "status",
  "raio",
  "qrcode",
  "grupo_sites_nome",
  "gerar_local_coleta_importada",
];

type Campos = Partial<Record<(typeof CABECALHO)[number], string>>;

function linha(campos: Campos): string[] {
  return CABECALHO.map((coluna) => campos[coluna] ?? "");
}

const GRUPOS = [
  { id: 1, nome: "UP Serviços" },
  { id: 2, nome: "SICREDI" },
  { id: 3, nome: "Villa Flora" },
];

function referencias(parcial: Partial<Referencias> = {}): Referencias {
  return { sites: [], grupos: GRUPOS, pessoas: [], tipos: [], ...parcial };
}

function existente(parcial: Partial<SiteExistente> & Pick<SiteExistente, "id" | "nome">): SiteExistente {
  return { grupoSiteId: 1, regional: null, siteSuperiorId: null, ...parcial };
}

function plano(linhas: string[][], ref: Referencias = referencias()) {
  const resultado = planejarImportacaoDeSites([CABECALHO, ...linhas], ref);
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado;
}

const erros = (p: Extract<PlanoDeSites, { ok: true }>) => p.erros.map((e) => `${e.linha}: ${e.mensagem}`);

describe("planejarImportacaoDeSites: criar", () => {
  it("cria o site com os campos do antigo, e os padroes do portal onde o arquivo nao diz nada", () => {
    const p = plano([
      linha({
        id: "10",
        regional: "SP",
        nome: " RAFARD ",
        sigla: "RAFARD",
        observação: "Contrato novo",
        cidade: "São Paulo",
        uf: "sp",
        status: "Ativo",
        qrcode: "Sim",
        grupo_sites_nome: "SICREDI",
        gerar_local_coleta_importada: "Sim",
      }),
    ]);

    expect(erros(p)).toEqual([]);
    expect(p.novos).toHaveLength(1);
    expect(p.novos[0].dados).toMatchObject({
      nome: "RAFARD",
      sigla: "RAFARD",
      grupo_site_id: 2,
      regional: "SP",
      cidade: "São Paulo",
      uf: "SP",
      observacao: "Contrato novo",
      pais: "Brasil",
      recebe_visita: true,
      gerar_qrcode_automatico: true,
      gerar_registro_coletas: true,
      ativo: true,
      emails_eventos: [],
    });
  });

  it("em branco cai no padrao do portal: QR ligado, coletas desligado, ativo", () => {
    const [novo] = plano([linha({ nome: "A", grupo_sites_nome: "SICREDI" })]).novos;

    expect(novo.dados).toMatchObject({
      gerar_qrcode_automatico: true,
      gerar_registro_coletas: false,
      ativo: true,
      regional: null,
      sigla: null,
    });
  });

  it("raio 0 e 'sem raio' no antigo: vira nulo, e raio de verdade fica", () => {
    const p = plano([
      linha({ nome: "A", grupo_sites_nome: "SICREDI", raio: "0" }),
      linha({ nome: "B", grupo_sites_nome: "SICREDI", raio: "150" }),
    ]);

    expect(p.novos.map((n) => n.dados.raio_metros)).toEqual([null, 150]);
  });

  it("sigla de ate 50 caracteres entra (no antigo ela e copia do nome)", () => {
    const longa = "S".repeat(44);
    const p = plano([linha({ nome: longa, sigla: longa, grupo_sites_nome: "SICREDI" })]);

    expect(erros(p)).toEqual([]);
    expect(p.novos[0].dados.sigla).toBe(longa);
  });

  it("o e-mail do responsavel vira a conta do portal; o que nao e de ninguem so e contado", () => {
    const ref = referencias({ pessoas: [{ id: "u-1", email: "Gerente@Empresa.com" }] });
    const p = plano(
      [
        linha({ nome: "A", grupo_sites_nome: "SICREDI", email_responsavel: "gerente@empresa.com" }),
        linha({ nome: "B", grupo_sites_nome: "SICREDI", email_responsavel: "ninguem@fora.com" }),
        linha({ nome: "C", grupo_sites_nome: "SICREDI" }),
      ],
      ref,
    );

    expect(p.novos.map((n) => n.dados.responsavel_id)).toEqual(["u-1", null, null]);
    expect(p.semResponsavel).toBe(1);
  });

  it("linhas em branco no fim da planilha nao contam", () => {
    const p = plano([linha({ nome: "A", grupo_sites_nome: "SICREDI" }), linha({}), linha({})]);

    expect(p.novos).toHaveLength(1);
    expect(erros(p)).toEqual([]);
  });
});

describe("planejarImportacaoDeSites: grupo", () => {
  it("em varios grupos, fica o mais especifico: o que tem menos sites no arquivo", () => {
    const p = plano([
      linha({ id: "1", nome: "Raiz", grupo_sites_nome: "UP Serviços" }),
      linha({ id: "2", nome: "Osasco", grupo_sites_nome: "SICREDI;UP Serviços" }),
      linha({ id: "3", nome: "Cotia", grupo_sites_nome: "SICREDI;UP Serviços" }),
      linha({ id: "4", nome: "Flor 1", grupo_sites_nome: "UP Serviços;Villa Flora" }),
    ]);

    const grupoDe = Object.fromEntries(p.novos.map((n) => [n.dados.nome, n.grupoNome]));
    expect(grupoDe).toEqual({
      Raiz: "UP Serviços",
      Osasco: "SICREDI",
      Cotia: "SICREDI",
      "Flor 1": "Villa Flora",
    });
  });

  it("sem grupo escrito, vale o grupo que tem o mesmo nome do site", () => {
    const p = plano([linha({ nome: "SICREDI" })]);

    expect(p.novos[0].dados.grupo_site_id).toBe(2);
    expect(erros(p)).toEqual([]);
  });

  it("sem grupo e sem grupo homonimo, ou com grupo que nao existe, e erro", () => {
    const p = plano([
      linha({ nome: "Solto" }),
      linha({ nome: "Perdido", grupo_sites_nome: "Grupo Que Nao Existe" }),
    ]);

    expect(erros(p)).toEqual([
      '2: "Solto" não tem grupo, e não existe um grupo com esse nome.',
      "3: Grupo não encontrado no portal: Grupo Que Nao Existe.",
    ]);
  });
});

describe("planejarImportacaoDeSites: quem ja existe", () => {
  it("acha pelo nome sem acento, caixa nem espaco, e so completa regional e superior", () => {
    const ref = referencias({ sites: [existente({ id: 50, nome: "Villa Flôra" })] });
    const p = plano(
      [
        linha({ id: "1", nome: "UP Serviços", regional: "SP", grupo_sites_nome: "UP Serviços" }),
        linha({ id: "2", site_superior_id: "1", nome: "  VILLA   FLORA ", regional: "SP", grupo_sites_nome: "Villa Flora" }),
      ],
      ref,
    );

    expect(p.novos.map((n) => n.dados.nome)).toEqual(["UP Serviços"]);
    expect(p.completar).toEqual([
      {
        linha: 3,
        id: 50,
        nome: "Villa Flôra",
        regional: "SP",
        // O pai e novo: resolvido por nome depois que ele for criado.
        superior: { tipo: "novo", chave: "up servicos" },
        superiorNome: "UP Serviços",
      },
    ]);
  });

  it("valor que ja esta preenchido no portal fica como esta", () => {
    const ref = referencias({
      sites: [
        existente({ id: 50, nome: "A", regional: "RS", siteSuperiorId: 9 }),
        existente({ id: 51, nome: "B", regional: "RS", siteSuperiorId: null }),
        existente({ id: 52, nome: "Pai" }),
      ],
    });
    const p = plano(
      [
        linha({ id: "1", nome: "Pai", grupo_sites_nome: "UP Serviços" }),
        linha({ id: "2", site_superior_id: "1", nome: "A", regional: "SP", grupo_sites_nome: "UP Serviços" }),
        linha({ id: "3", site_superior_id: "1", nome: "B", regional: "SP", grupo_sites_nome: "UP Serviços" }),
      ],
      ref,
    );

    // A: regional e superior ja preenchidos -> nada. B: so o superior.
    expect(p.semMudanca.map((s) => s.nome)).toEqual(["Pai", "A"]);
    expect(p.completar).toEqual([
      {
        linha: 4,
        id: 51,
        nome: "B",
        regional: null,
        superior: { tipo: "existente", id: 52 },
        superiorNome: "Pai",
      },
    ]);
    expect(p.novos).toEqual([]);
  });

  it("nome igual em dois grupos do portal: vale o do grupo escolhido", () => {
    const ref = referencias({
      sites: [
        existente({ id: 60, nome: "Centro", grupoSiteId: 1 }),
        existente({ id: 61, nome: "Centro", grupoSiteId: 2 }),
      ],
    });
    const p = plano([linha({ nome: "Centro", regional: "SP", grupo_sites_nome: "SICREDI" })], ref);

    expect(p.completar.map((c) => c.id)).toEqual([61]);
  });

  it("nome parecido mas diferente NAO e reconhecido: vira site novo", () => {
    const ref = referencias({ sites: [existente({ id: 70, nome: "SICOOB RAFARD" })] });
    const p = plano([linha({ nome: "RAFARD", grupo_sites_nome: "SICREDI" })], ref);

    expect(p.novos.map((n) => n.dados.nome)).toEqual(["RAFARD"]);
    expect(p.completar).toEqual([]);
  });
});

describe("planejarImportacaoDeSites: hierarquia", () => {
  it("o pai e criado antes do filho, em niveis", () => {
    const p = plano([
      linha({ id: "30", site_superior_id: "20", nome: "Neto", grupo_sites_nome: "SICREDI" }),
      linha({ id: "20", site_superior_id: "10", nome: "Filho", grupo_sites_nome: "SICREDI" }),
      linha({ id: "10", site_superior_id: "0", nome: "Raiz", grupo_sites_nome: "SICREDI" }),
    ]);

    expect(p.novos.map((n) => [n.dados.nome, n.nivel])).toEqual([
      ["Raiz", 0],
      ["Filho", 1],
      ["Neto", 2],
    ]);
    expect(p.novos[2].superior).toEqual({ tipo: "novo", chave: "filho" });
    expect(p.novos[0].superior).toBeNull();
  });

  it("pai que ja existe no portal deixa o filho no nivel 0, apontando para ele", () => {
    const ref = referencias({ sites: [existente({ id: 99, nome: "Raiz", regional: "SP" })] });
    const p = plano(
      [
        linha({ id: "10", nome: "Raiz", regional: "SP", grupo_sites_nome: "SICREDI" }),
        linha({ id: "20", site_superior_id: "10", nome: "Filho", grupo_sites_nome: "SICREDI" }),
      ],
      ref,
    );

    expect(p.novos.map((n) => [n.dados.nome, n.nivel, n.superior])).toEqual([
      ["Filho", 0, { tipo: "existente", id: 99 }],
    ]);
  });

  it("pai fora do arquivo, ele mesmo e ciclo sao erro", () => {
    const p = plano([
      linha({ id: "1", site_superior_id: "999", nome: "Orfao", grupo_sites_nome: "SICREDI" }),
      linha({ id: "2", site_superior_id: "2", nome: "Eu mesmo", grupo_sites_nome: "SICREDI" }),
      linha({ id: "3", site_superior_id: "4", nome: "Ping", grupo_sites_nome: "SICREDI" }),
      linha({ id: "4", site_superior_id: "3", nome: "Pong", grupo_sites_nome: "SICREDI" }),
    ]);

    expect(erros(p)).toEqual([
      "2: O site superior (id 999) não está no arquivo.",
      "3: Um site não pode ser superior de si mesmo.",
      "4: A hierarquia do arquivo dá uma volta: este site é superior de si mesmo.",
      "5: A hierarquia do arquivo dá uma volta: este site é superior de si mesmo.",
    ]);
  });

  it("completar o superior de um site que ja existe nao pode fechar um ciclo com o portal", () => {
    // No portal, Pai ja tem Filho como superior; o arquivo diz o contrario.
    const ref = referencias({
      sites: [
        existente({ id: 1, nome: "Pai", siteSuperiorId: 2 }),
        existente({ id: 2, nome: "Filho", siteSuperiorId: null }),
      ],
    });
    const p = plano(
      [
        linha({ id: "10", nome: "Pai", grupo_sites_nome: "UP Serviços" }),
        linha({ id: "20", site_superior_id: "10", nome: "Filho", grupo_sites_nome: "UP Serviços" }),
      ],
      ref,
    );

    // Os dois lados do ciclo avisam, como em Ping e Pong.
    expect(erros(p)).toEqual([
      "2: A hierarquia do arquivo dá uma volta: este site é superior de si mesmo.",
      "3: A hierarquia do arquivo dá uma volta: este site é superior de si mesmo.",
    ]);
  });
});

describe("planejarImportacaoDeSites: validacao dos campos", () => {
  it("cada campo recusado aponta a linha da planilha", () => {
    const p = plano([
      linha({ nome: "A", grupo_sites_nome: "SICREDI", uf: "SAO" }),
      linha({ nome: "B", grupo_sites_nome: "SICREDI", status: "Talvez" }),
      linha({ nome: "C", grupo_sites_nome: "SICREDI", qrcode: "Quem sabe" }),
      linha({ nome: "D", grupo_sites_nome: "SICREDI", raio: "-5" }),
      linha({ nome: "E", grupo_sites_nome: "SICREDI", cidade: "x".repeat(101) }),
      linha({ nome: "", grupo_sites_nome: "SICREDI" , regional: "SP" }),
    ]);

    // O nome em branco e achado ao ler as linhas, antes da validacao dos campos.
    expect(erros(p)).toEqual([
      "7: Informe o nome do site.",
      "2: A UF deve ter exatamente 2 letras (ex: SP).",
      '3: O status deve ser "Ativo" ou "Inativo".',
      '4: qrcode deve ser "Sim" ou "Não".',
      "5: O raio não pode ser negativo.",
      "6: A cidade deve ter no máximo 100 caracteres.",
    ]);
  });

  it("nome repetido ou id repetido no arquivo e erro", () => {
    const p = plano([
      linha({ id: "1", nome: "Mesmo", grupo_sites_nome: "SICREDI" }),
      linha({ id: "2", nome: "  MESMO ", grupo_sites_nome: "SICREDI" }),
      linha({ id: "1", nome: "Outro", grupo_sites_nome: "SICREDI" }),
    ]);

    expect(erros(p)).toEqual(['3: "MESMO" repete o site da linha 2.', "4: O id 1 já aparece na linha 2."]);
  });

  it("tipo de servico: acha pelo nome, e nome desconhecido e erro", () => {
    const ref = referencias({ tipos: [{ id: 7, nome: "Portaria" }] });
    const p = planejarImportacaoDeSites(
      [
        [...CABECALHO, "tipos_servicos"],
        [...linha({ nome: "A", grupo_sites_nome: "SICREDI" }), "portaria"],
        [...linha({ nome: "B", grupo_sites_nome: "SICREDI" }), "Jardinagem"],
      ],
      ref,
    );

    expect(p.ok && p.novos[0].dados.tipo_servico_id).toBe(7);
    expect(p.ok && p.erros.map((e) => e.mensagem)).toEqual(["Tipo de serviço não encontrado no portal: Jardinagem."]);
  });

  it("e-mails de eventos: lista valida entra, e-mail torto e erro", () => {
    const p = planejarImportacaoDeSites(
      [
        [...CABECALHO, "emails_eventos"],
        [...linha({ nome: "A", grupo_sites_nome: "SICREDI" }), "um@x.com; dois@x.com"],
        [...linha({ nome: "B", grupo_sites_nome: "SICREDI" }), "isto-nao-e-email"],
      ],
      referencias(),
    );

    expect(p.ok && p.novos[0].dados.emails_eventos).toEqual(["um@x.com", "dois@x.com"]);
    expect(p.ok && p.erros.map((e) => e.mensagem)).toEqual(["E-mail inválido: isto-nao-e-email"]);
  });
});

describe("planejarImportacaoDeSites: o arquivo", () => {
  it("acha as colunas pelo nome, sem acento e em qualquer ordem, e ignora as que o portal nao tem", () => {
    const p = planejarImportacaoDeSites(
      [
        ["curva", "Endereço", "NOME", "grupo_sites_nome", "senha", "Integrações"],
        ["A", "Rua 1", "Site", "SICREDI", "segredo", "x"],
      ],
      referencias(),
    );

    expect(p.ok && p.novos[0].dados).toMatchObject({ nome: "Site", endereco: "Rua 1" });
    expect(JSON.stringify(p)).not.toContain("segredo");
  });

  it("sem a coluna nome, vazio, sem linhas e acima do limite sao recusados", () => {
    const recusa = (linhas: string[][]) => {
      const p = planejarImportacaoDeSites(linhas, referencias());
      return p.ok ? null : p.erro;
    };

    expect(recusa([])).toBe("O arquivo está vazio.");
    expect(recusa([["sigla"], ["x"]])).toMatch(/precisa ter a coluna "nome"/);
    expect(recusa([["nome"]])).toBe("O arquivo não tem nenhum site.");
    expect(recusa([["nome"], ...Array.from({ length: MAXIMO_DE_LINHAS + 1 }, (_, i) => [`S${i}`])])).toMatch(
      /passa de 1000 linhas/,
    );
  });

  it("site_superior_id com valor mas sem a coluna id: recusa o arquivo, com a explicacao", () => {
    const p = planejarImportacaoDeSites(
      [
        ["nome", "site_superior_id", "grupo_sites_nome"],
        ["A", "5", "SICREDI"],
      ],
      referencias(),
    );

    expect(p.ok).toBe(false);
    expect(!p.ok && p.erro).toMatch(/não tem a coluna "id"/);
  });
});
