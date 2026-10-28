import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isGroup,
  itensDoMenu,
  linkDoSuporteTecnico,
  naRota,
  NAV_ITEMS,
  TELAS_DO_MENU,
  telasDoMenu,
} from "./telas-do-menu";

const MAPA = "/dashboard/eventos/relatorios/mapa-de-eventos";

describe("naRota", () => {
  it("marca a propria rota do item", () => {
    expect(naRota(MAPA, MAPA)).toBe(true);
  });

  it("marca as rotas abaixo dela (export, novo, editar)", () => {
    expect(naRota(`${MAPA}/export/pdf`, MAPA)).toBe(true);
  });

  it("nao marca outra rota que so comeca com o mesmo texto", () => {
    // O bug: abrir "Mapa de Eventos por Site" marcava "Mapa de Eventos" junto.
    expect(naRota(`${MAPA}-por-site`, MAPA)).toBe(false);
  });

  it("nao marca nada antes da hidratacao (pathname nulo)", () => {
    expect(naRota(null, MAPA)).toBe(false);
  });
});

describe("linkDoSuporteTecnico", () => {
  it("vira link externo com o endereco da variavel", () => {
    expect(linkDoSuporteTecnico(" https://wa.me/5500000000000 ")).toMatchObject({
      label: "Suporte Técnico",
      href: "https://wa.me/5500000000000",
      externo: true,
    });
  });

  it("some sem variavel, ou com endereco que nao e https", () => {
    expect(linkDoSuporteTecnico(undefined)).toBeNull();
    expect(linkDoSuporteTecnico("   ")).toBeNull();
    expect(linkDoSuporteTecnico("http://wa.me/5500000000000")).toBeNull();
    expect(linkDoSuporteTecnico("javascript:alert(1)")).toBeNull();
  });
});

describe("organizacao de 05/11 do sistema de referencia", () => {
  it("modulos na ordem do guia de navegacao", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Página Principal",
      "Configurações",
      "ChecklistLab",
      "Eventos",
      "Inspeções",
      "Suporte",
    ]);
  });

  it("Trocar Senha mora no Suporte, e o Suporte existe mesmo sem o WhatsApp", () => {
    const suporte = NAV_ITEMS.find((item) => item.label === "Suporte");
    expect(suporte?.href).toBeUndefined();
    expect(suporte?.children.map((child) => child.label)).toContain("Trocar Senha");
    expect(TELAS_DO_MENU.find((tela) => tela.href === "/dashboard/cadastros/trocar-senha")?.secao).toBe("Suporte");
  });

  it("Coletas Importadas fica em Inspecoes > Relatorios", () => {
    const inspecoes = NAV_ITEMS.find((item) => item.label === "Inspeções");
    const relatorios = inspecoes?.children.find((child) => child.label === "Relatórios");
    expect(relatorios && isGroup(relatorios) ? relatorios.items[0].label : null).toBe("Coletas Importadas");
  });

  it("os enderecos das telas nao mudaram: atalhos e links salvos seguem abrindo", () => {
    expect(TELAS_DO_MENU.map((tela) => tela.href)).toEqual(
      expect.arrayContaining([
        "/dashboard/cadastros/usuarios",
        "/dashboard/cadastros/trocar-senha",
        "/dashboard/inspecoes/coletas-importadas",
        "/dashboard/checklistlab/modelos",
      ]),
    );
  });
});

describe("TELAS_DO_MENU", () => {
  it("nao inclui link externo: atalho da Pagina Principal e so tela do painel", () => {
    expect(TELAS_DO_MENU.every((tela) => tela.href.startsWith("/dashboard/"))).toBe(true);
  });
});

/** Todos os links de um menu, achatados. */
const hrefsDo = (itens: typeof NAV_ITEMS) =>
  itens.flatMap((item) =>
    item.children.flatMap((child) => (isGroup(child) ? child.items : [child]).map((link) => link.href)),
  );

const DO_GESTOR = TELAS_DO_MENU.filter((tela) => tela.somenteGestor).map((tela) => tela.href);

describe("telas so do GESTOR (issue #209)", () => {
  it("sao as telas do menu do GESTOR na referencia", () => {
    expect(DO_GESTOR).toEqual([
      "/dashboard/checklistlab/grupo-perguntas",
      "/dashboard/checklistlab/modelos",
      "/dashboard/checklistlab/relatorios/analitico-por-checklist",
      "/dashboard/checklistlab/relatorios/indicadores-por-site",
      "/dashboard/checklistlab/relatorios/detalhamento-do-checklist",
      "/dashboard/eventos/tipos-de-analise",
      "/dashboard/eventos/tipos-de-classificacao",
      "/dashboard/eventos/cadastro-de-eventos",
      "/dashboard/eventos/registrar-evento",
      "/dashboard/eventos/painel-de-eventos",
      "/dashboard/eventos/relatorios/analitico-de-eventos",
      "/dashboard/eventos/relatorios/graficos-por-classificacao",
    ]);
  });

  it("o GESTOR ve o menu inteiro", () => {
    expect(itensDoMenu(NAV_ITEMS, true)).toBe(NAV_ITEMS);
    expect(telasDoMenu(true)).toEqual(TELAS_DO_MENU);
  });

  it("os demais nao veem nenhuma delas, nem no menu nem nos atalhos", () => {
    const menu = hrefsDo(itensDoMenu(NAV_ITEMS, false));
    const atalhos = telasDoMenu(false).map((tela) => tela.href);
    for (const href of DO_GESTOR) {
      expect(menu).not.toContain(href);
      expect(atalhos).not.toContain(href);
    }
    // E o resto do menu continua la.
    expect(menu).toContain("/dashboard/eventos/relatorios/registro-de-eventos");
    expect(menu).toContain("/dashboard/checklistlab/historico-de-checklist");
  });

  it("subgrupo que fica vazio some (as Configuracoes do ChecklistLab e de Eventos), a secao nao", () => {
    const menu = itensDoMenu(NAV_ITEMS, false);
    const checklistlab = menu.find((item) => item.label === "ChecklistLab");
    expect(checklistlab?.children.map((child) => child.label)).toEqual(["Histórico de Checklist"]);
    const eventos = menu.find((item) => item.label === "Eventos");
    expect(eventos?.children.map((child) => child.label)).toEqual(["Relatórios"]);
  });

  // Esconder do menu e so vitrine. O portao e o `layout.tsx` da pasta.
  // O Painel de Eventos fica de fora de proposito: o SUPERVISOR chega a ele
  // pela lupa do Registro de Eventos para analisar e finalizar (0064).
  it.each(DO_GESTOR.filter((href) => !href.endsWith("/painel-de-eventos")))(
    "%s tem o portao SomenteGestor no layout",
    (href) => {
      const layout = fileURLToPath(new URL(`../../app${href}/layout.tsx`, import.meta.url));
      expect(existsSync(layout)).toBe(true);
      expect(readFileSync(layout, "utf8")).toContain("<SomenteGestor>");
    },
  );
});
