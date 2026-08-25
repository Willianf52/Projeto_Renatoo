import { describe, expect, it } from "vitest";

import {
  decidirAcao,
  INTERVALO_MINIMO_ENTRE_REVALIDACOES_MS as JANELA,
  type EntradaDeDecisao,
} from "./ciclo-de-vida";

/**
 * A regra do ciclo de vida da sessao do app de campo.
 *
 * O que estes testes protegem nao e o caminho feliz -- e o custo. Revalidar
 * perfil a cada evento de AppState transformaria abrir a central de controle
 * num SELECT em `profiles`, e duas transicoes rapidas em duas consultas
 * simultaneas. As tres condicoes de `decidirAcao` existem para isso, e sao
 * exatamente o que se quebra sem perceber num refactor.
 */

const base: EntradaDeDecisao = {
  anterior: "background",
  proximo: "active",
  revalidacaoEmVoo: false,
  ultimaRevalidacaoEm: null,
  agora: 1_000_000,
};

const entrada = (troca: Partial<EntradaDeDecisao>): EntradaDeDecisao => ({ ...base, ...troca });

describe("refresh de token", () => {
  it("liga o ticker ao voltar para o primeiro plano", () => {
    expect(decidirAcao(entrada({ proximo: "active" })).autoRefresh).toBe(true);
  });

  it("desliga o ticker ao ir para segundo plano", () => {
    expect(decidirAcao(entrada({ anterior: "active", proximo: "background" })).autoRefresh).toBe(
      false,
    );
  });

  it("nao mexe no ticker em `inactive` -- transitorio no iOS", () => {
    expect(decidirAcao(entrada({ anterior: "active", proximo: "inactive" })).autoRefresh).toBeNull();
  });
});

describe("revalidacao de perfil", () => {
  it("revalida ao voltar do segundo plano depois da janela", () => {
    const acao = decidirAcao(entrada({ anterior: "background", agora: JANELA + 1 }));
    expect(acao.revalidarPerfil).toBe(true);
  });

  it("NAO revalida quando ja havia uma consulta em voo", () => {
    const acao = decidirAcao(entrada({ revalidacaoEmVoo: true }));
    expect(acao.revalidarPerfil).toBe(false);
  });

  it("NAO revalida dentro da janela de throttle", () => {
    // Central de controle aberta e fechada: `active -> inactive -> active` em
    // segundos. A ultima revalidacao foi ha 5 s.
    const acao = decidirAcao(
      entrada({ anterior: "inactive", ultimaRevalidacaoEm: 1_000_000 - 5_000 }),
    );
    expect(acao.revalidarPerfil).toBe(false);
  });

  it("revalida de novo assim que a janela fecha", () => {
    const acao = decidirAcao(entrada({ ultimaRevalidacaoEm: base.agora - JANELA }));
    expect(acao.revalidarPerfil).toBe(true);
  });

  it("NAO revalida em transicao `active -> active`", () => {
    // O Android chega a emitir isto; nao ha informacao nova em ficar ativo
    // estando ativo.
    const acao = decidirAcao(entrada({ anterior: "active", proximo: "active" }));
    expect(acao.revalidarPerfil).toBe(false);
  });

  it("nunca revalida indo para segundo plano ou `inactive`", () => {
    for (const proximo of ["background", "inactive"] as const) {
      expect(decidirAcao(entrada({ anterior: "active", proximo })).revalidarPerfil).toBe(false);
    }
  });

  it("revalida na primeira volta do app, sem revalidacao anterior", () => {
    // `null` significa "nunca revalidou" e nao pode ser lido como "acabou de
    // revalidar" -- nem com o relogio em 1 ms depois da epoca.
    const acao = decidirAcao(entrada({ ultimaRevalidacaoEm: null, agora: 1 }));
    expect(acao.revalidarPerfil).toBe(true);
  });

  it("trata `unknown` do Android como 'esteve fora'", () => {
    // Conservador de proposito: uma revalidacao a mais, nunca uma a menos.
    const acao = decidirAcao(entrada({ anterior: "unknown", agora: JANELA + 1 }));
    expect(acao.revalidarPerfil).toBe(true);
  });
});
