import { describe, expect, it } from "vitest";

import {
  BLOQUEIO_MS,
  interpretarSalvo,
  LIMITE_ZERADO,
  MAX_TENTATIVAS,
  registrarFalha,
  segundosRestantes,
  serializar,
  type EstadoDoLimite,
} from "./limite-de-tentativas";

/**
 * O limite de tentativas do login em campo.
 *
 * O que estes testes protegem sao os dois jeitos de a regra dar errado *contra
 * o inspetor*, que sao piores do que ela ser fraca demais: virar bloqueio
 * permanente depois do primeiro (o contador que nao zera), e barrar a entrada
 * por causa de um valor estragado no armazenamento. Um app de inspecao que
 * nao abre em campo nao tem a quem recorrer.
 */

const AGORA = 1_700_000_000_000;

describe("contagem de falhas", () => {
  it("acumula falhas sem bloquear ate o teto", () => {
    let estado = LIMITE_ZERADO;

    for (let i = 1; i < MAX_TENTATIVAS; i += 1) {
      estado = registrarFalha(estado, AGORA);
      expect(estado.bloqueadoAte).toBeNull();
      expect(estado.tentativas).toBe(i);
    }
  });

  it("bloqueia na quinta falha, pelos trinta segundos", () => {
    let estado = LIMITE_ZERADO;

    for (let i = 0; i < MAX_TENTATIVAS; i += 1) {
      estado = registrarFalha(estado, AGORA);
    }

    expect(estado.bloqueadoAte).toBe(AGORA + BLOQUEIO_MS);
  });

  it("zera o contador ao bloquear, para o bloqueio nao virar permanente", () => {
    // Sem isto, a primeira falha depois do bloqueio vencido cairia direto em
    // outro bloqueio -- e quem esqueceu a senha ficaria preso para sempre em
    // ciclos de trinta segundos.
    let estado = LIMITE_ZERADO;

    for (let i = 0; i < MAX_TENTATIVAS; i += 1) {
      estado = registrarFalha(estado, AGORA);
    }

    const depoisDoBloqueio = registrarFalha(
      { tentativas: estado.tentativas, bloqueadoAte: null },
      AGORA + BLOQUEIO_MS,
    );

    expect(depoisDoBloqueio.bloqueadoAte).toBeNull();
    expect(depoisDoBloqueio.tentativas).toBe(1);
  });
});

describe("contagem regressiva", () => {
  const bloqueado: EstadoDoLimite = { tentativas: 0, bloqueadoAte: AGORA + BLOQUEIO_MS };

  it("devolve zero quando nao ha bloqueio", () => {
    expect(segundosRestantes(LIMITE_ZERADO, AGORA)).toBe(0);
  });

  it("arredonda para cima, para nunca mostrar 0s com o botao travado", () => {
    expect(segundosRestantes(bloqueado, AGORA + BLOQUEIO_MS - 1)).toBe(1);
  });

  it("devolve zero no instante em que o bloqueio vence", () => {
    expect(segundosRestantes(bloqueado, AGORA + BLOQUEIO_MS)).toBe(0);
  });

  it("nao devolve negativo depois de vencido", () => {
    expect(segundosRestantes(bloqueado, AGORA + BLOQUEIO_MS + 60_000)).toBe(0);
  });
});

describe("leitura do que ficou guardado", () => {
  it("restaura um bloqueio que ainda vale", () => {
    const guardado = serializar({ tentativas: 0, bloqueadoAte: AGORA + BLOQUEIO_MS });

    expect(interpretarSalvo(guardado, AGORA)).toEqual({
      tentativas: 0,
      bloqueadoAte: AGORA + BLOQUEIO_MS,
    });
  });

  it("descarta bloqueio ja vencido", () => {
    const guardado = serializar({ tentativas: 0, bloqueadoAte: AGORA });

    expect(interpretarSalvo(guardado, AGORA + 1)).toEqual(LIMITE_ZERADO);
  });

  it("restaura a contagem parcial entre aberturas do app", () => {
    // E o que impede fechar e reabrir o app de zerar o contador -- o
    // equivalente do F5 que o painel fecha com sessionStorage.
    const guardado = serializar({ tentativas: 3, bloqueadoAte: null });

    expect(interpretarSalvo(guardado, AGORA)).toEqual({ tentativas: 3, bloqueadoAte: null });
  });

  it("trata ausencia de valor como estado zerado", () => {
    expect(interpretarSalvo(null, AGORA)).toEqual(LIMITE_ZERADO);
  });

  it.each([
    ["JSON invalido", "{nao e json"],
    ["tipo errado", '"texto solto"'],
    ["nulo literal", "null"],
    ["contagem acima do teto", '{"tentativas":4000,"bloqueadoAte":null}'],
    ["contagem negativa", '{"tentativas":-1,"bloqueadoAte":null}'],
    ["contagem fracionaria", '{"tentativas":1.5,"bloqueadoAte":null}'],
    ["campos de outro formato", '{"outra":1}'],
  ])("nao trava o login com %s", (_caso, bruto) => {
    expect(interpretarSalvo(bruto, AGORA)).toEqual(LIMITE_ZERADO);
  });
});

describe("gravacao", () => {
  it("nao guarda nada quando o estado esta zerado", () => {
    expect(serializar(LIMITE_ZERADO)).toBeNull();
  });

  it("o que grava volta igual pela leitura", () => {
    const estados: EstadoDoLimite[] = [
      { tentativas: 2, bloqueadoAte: null },
      { tentativas: 0, bloqueadoAte: AGORA + BLOQUEIO_MS },
    ];

    for (const estado of estados) {
      expect(interpretarSalvo(serializar(estado), AGORA)).toEqual(estado);
    }
  });
});
