import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O duble do `expo-secure-store` NAO e um Map simples de proposito: ele impoe
 * o limite de 2048 bytes por valor, como o Android faz. Sem isso o teste
 * passaria mesmo que a fragmentacao estivesse errada -- que e exatamente o
 * bug que se quer impedir.
 *
 * A medicao que motivou tudo: a sessao do Supabase mede 2113 bytes num
 * usuario recem-criado, sem metadado nenhum (medido contra o stack local em
 * 2026-08-23). Ela ja nasce acima do limite.
 */
const { armazem, LIMITE_DA_PLATAFORMA, falha } = vi.hoisted(() => ({
  armazem: new Map<string, string>(),
  LIMITE_DA_PLATAFORMA: 2048,
  /** Injeta falha do Keystore numa chave especifica -- ver "gravacao parcial". */
  falha: { naChave: null as string | null },
}));

vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: "afterFirstUnlock",
  getItemAsync: async (chave: string) => (armazem.has(chave) ? armazem.get(chave)! : null),
  setItemAsync: async (chave: string, valor: string) => {
    if (falha.naChave === chave) {
      throw new Error(`SecureStore indisponivel para ${chave}.`);
    }
    const bytes = Buffer.byteLength(valor, "utf8");
    if (bytes > LIMITE_DA_PLATAFORMA) {
      throw new Error(`SecureStore recusou ${bytes} bytes (limite ${LIMITE_DA_PLATAFORMA}).`);
    }
    armazem.set(chave, valor);
  },
  deleteItemAsync: async (chave: string) => {
    armazem.delete(chave);
  },
}));

const { armazenamentoSeguro } = await import("./armazenamento-seguro");

const CHAVE = "sb-projeto-auth-token";

/** Pedacos gravados para uma chave, sem o manifesto. */
const pedacosDe = (chave: string) =>
  [...armazem.keys()].filter((k) => k.startsWith(`${chave}.`));

beforeEach(() => {
  armazem.clear();
  falha.naChave = null;
});

describe("round-trip", () => {
  it("devolve exatamente o que guardou numa sessao realista acima do limite", async () => {
    // ~2.1KB, o tamanho medido de uma sessao real.
    const sessao = JSON.stringify({
      access_token: "e".repeat(904),
      refresh_token: "v1.M2Rk",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: 1787529600,
      user: {
        id: "a1111111-1111-1111-1111-111111111111",
        email: "inspetor@upservicos.com.br",
        role: "authenticated",
        user_metadata: { nome_completo: "José da Conceição" },
        app_metadata: { provider: "email", providers: ["email"] },
      },
      preenchimento: "x".repeat(900),
    });

    expect(Buffer.byteLength(sessao, "utf8")).toBeGreaterThan(LIMITE_DA_PLATAFORMA);

    await armazenamentoSeguro.setItem(CHAVE, sessao);

    expect(await armazenamentoSeguro.getItem(CHAVE)).toBe(sessao);
    expect(pedacosDe(CHAVE).length).toBeGreaterThan(1);
  });

  it("devolve null para chave que nunca foi gravada", async () => {
    expect(await armazenamentoSeguro.getItem("nao-existe")).toBeNull();
  });
});

describe("limite de bytes", () => {
  it("nenhum pedaco ultrapassa o limite da plataforma", async () => {
    await armazenamentoSeguro.setItem(CHAVE, "x".repeat(10_000));

    for (const chave of pedacosDe(CHAVE)) {
      expect(Buffer.byteLength(armazem.get(chave)!, "utf8")).toBeLessThanOrEqual(
        LIMITE_DA_PLATAFORMA,
      );
    }
  });

  it("conta BYTES e nao caracteres em texto acentuado", async () => {
    // 2 bytes por caractere: contar caracteres deixaria o pedaco passar do
    // limite sem aviso, e o duble recusaria a gravacao.
    const acentuado = "ção".repeat(2000);
    expect(acentuado.length).toBeLessThan(Buffer.byteLength(acentuado, "utf8"));

    await expect(armazenamentoSeguro.setItem(CHAVE, acentuado)).resolves.not.toThrow();
    expect(await armazenamentoSeguro.getItem(CHAVE)).toBe(acentuado);
  });

  it("nao corta no meio de um par surrogate", async () => {
    const comEmoji = "🛠".repeat(2000);

    await armazenamentoSeguro.setItem(CHAVE, comEmoji);

    for (const chave of pedacosDe(CHAVE)) {
      const pedaco = armazem.get(chave)!;
      // Alto no fim ou baixo no comeco significa par partido -- nao e UTF-8
      // valido e a plataforma poderia corromper na volta.
      expect(/[\uD800-\uDBFF]$/.test(pedaco)).toBe(false);
      expect(/^[\uDC00-\uDFFF]/.test(pedaco)).toBe(false);
    }

    expect(await armazenamentoSeguro.getItem(CHAVE)).toBe(comEmoji);
  });

  it("sobrevive a texto misto de ascii, acento e emoji", async () => {
    const misto = ("a" + "ç" + "🛠").repeat(1500);

    await armazenamentoSeguro.setItem(CHAVE, misto);

    expect(await armazenamentoSeguro.getItem(CHAVE)).toBe(misto);
  });
});

describe("string vazia", () => {
  it("guarda e devolve '' em vez de null", async () => {
    // Zero pedacos gravaria manifesto "0" e a leitura devolveria null -- ou
    // seja, guardar "" e ler de volta daria "nao ha nada guardado". Um
    // storage que nao devolve o que recebeu e armadilha.
    await armazenamentoSeguro.setItem(CHAVE, "");

    expect(await armazenamentoSeguro.getItem(CHAVE)).toBe("");
    expect(await armazenamentoSeguro.getItem(CHAVE)).not.toBeNull();
  });
});

describe("sessao que encolhe", () => {
  it("apaga os pedacos que sobraram da gravacao anterior", async () => {
    await armazenamentoSeguro.setItem(CHAVE, "g".repeat(10_000));
    const antes = pedacosDe(CHAVE).length;
    expect(antes).toBeGreaterThan(2);

    await armazenamentoSeguro.setItem(CHAVE, "pequeno");

    // Sem a limpeza, os pedacos velhos ficariam e a leitura seguinte montaria
    // um valor com cauda de lixo.
    expect(pedacosDe(CHAVE).length).toBe(1);
    expect(await armazenamentoSeguro.getItem(CHAVE)).toBe("pequeno");
  });
});

describe("remocao", () => {
  it("apaga o manifesto e todos os pedacos", async () => {
    await armazenamentoSeguro.setItem(CHAVE, "s".repeat(10_000));
    expect(pedacosDe(CHAVE).length).toBeGreaterThan(1);

    await armazenamentoSeguro.removeItem(CHAVE);

    expect(armazem.has(CHAVE)).toBe(false);
    expect(pedacosDe(CHAVE)).toEqual([]);
    expect(await armazenamentoSeguro.getItem(CHAVE)).toBeNull();
  });
});

describe("estado corrompido", () => {
  it("devolve null quando falta um pedaco, em vez de valor truncado", async () => {
    await armazenamentoSeguro.setItem(CHAVE, "t".repeat(10_000));
    armazem.delete(`${CHAVE}.1`);

    // Entregar o resto daria um JSON cortado ao supabase-js, que falharia de
    // um jeito menos claro que "nao ha sessao".
    expect(await armazenamentoSeguro.getItem(CHAVE)).toBeNull();
  });

  it("devolve null quando o manifesto nao e um numero util", async () => {
    armazem.set(CHAVE, "nao-e-numero");

    expect(await armazenamentoSeguro.getItem(CHAVE)).toBeNull();
  });
});

describe("gravacao parcial", () => {
  /**
   * O cenario que o manifesto-por-ultimo NAO cobria.
   *
   * Os pedacos sao sobrescritos em ordem, entao uma falha no meio deixava
   * `.0` da sessao NOVA ao lado de `.1`/`.2` da VELHA -- com o manifesto
   * antigo ainda dizendo "3". A leitura concatenava os tres e devolvia um
   * JSON emendado de duas sessoes: token de uma, assinatura de outra.
   *
   * Apagando o manifesto antes de tocar nos pedacos, a entrada fica
   * atomicamente ausente durante a reescrita: falhou, `getItem` devolve null
   * e a pessoa cai no login -- pior caso ja aceito pelo `SessaoProvider`.
   */
  it("nao emenda pedacos de duas sessoes quando o Keystore falha no meio", async () => {
    const anterior = `{"access_token":"${"A".repeat(4000)}"}`;
    await armazenamentoSeguro.setItem(CHAVE, anterior);
    expect(pedacosDe(CHAVE).length).toBeGreaterThan(2);

    // A nova sessao ocupa a mesma quantidade de pedacos; o Keystore recusa o
    // segundo, depois do primeiro ja ter sido sobrescrito.
    falha.naChave = `${CHAVE}.1`;
    const nova = `{"access_token":"${"B".repeat(4000)}"}`;

    await expect(armazenamentoSeguro.setItem(CHAVE, nova)).rejects.toThrow();

    const lido = await armazenamentoSeguro.getItem(CHAVE);

    expect(lido).toBeNull();
    // A garantia que importa, dita sem depender do null acima: em nenhuma
    // hipotese a leitura devolve um valor que mistura as duas sessoes.
    expect(lido === null || !(lido.includes("A") && lido.includes("B"))).toBe(true);
  });

  it("nao deixa a sessao anterior legivel depois de uma reescrita interrompida", async () => {
    await armazenamentoSeguro.setItem(CHAVE, "sessao-antiga");

    falha.naChave = `${CHAVE}.0`;
    await expect(armazenamentoSeguro.setItem(CHAVE, "sessao-nova")).rejects.toThrow();

    // Devolver a antiga seria pior que devolver null: o supabase-js seguiria
    // com um token que o servidor ja pode ter rotacionado.
    expect(await armazenamentoSeguro.getItem(CHAVE)).toBeNull();
  });
});
