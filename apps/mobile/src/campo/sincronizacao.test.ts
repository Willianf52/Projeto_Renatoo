import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A drenagem da fila de campo para o Postgres.
 *
 * Esta suite existe porque `sincronizacao.ts` e o ponto do projeto onde um
 * erro nao aparece como tela quebrada -- aparece como ronda que o inspetor
 * fez e o portal nunca recebeu, ou como "sincronizado agora" mentindo. Nada
 * disso da sintoma no aparelho na hora.
 *
 * O que se testa e a decisao, nao o SQLite nem o PostgREST: `./fila` e o
 * cliente do Supabase entram como duble. O duble do servidor e roteirizavel
 * por teste justamente para exercitar os ramos que so acontecem com a rede
 * ruim -- reenvio, resposta perdida, RLS escondendo a linha.
 */

const estado = vi.hoisted(() => ({
  visitas: [] as {
    chave: string;
    siteId: number;
    funcionarioId: string;
    capturadoEm: string;
    visitaId: number | null;
    enviada: boolean;
  }[],
  leituras: new Map<
    string,
    { id: number; dataHora: string; areaId: number | null; qrCodeId: number | null; observacao: string | null }[]
  >(),
  /** O que a sincronizacao ESCREVEU de volta na fila -- o que os testes conferem. */
  gravado: {
    visitasEnviadas: [] as { chave: string; visitaId: number }[],
    leiturasEnviadas: [] as number[],
    falhas: [] as { chave: string; erro: string }[],
    sincronizadoEm: null as string | null,
  },
}));

vi.mock("./fila", () => ({
  // O duble HONRA o recorte por inspetor em vez de devolver a fila inteira:
  // se ele ignorasse o parametro, o teste de aparelho compartilhado passaria
  // mesmo com `sincronizar` esquecendo de repassa-lo -- que e exatamente a
  // regressao que ele existe para pegar.
  visitasPendentes: async (funcionarioId: string) =>
    estado.visitas.filter((v) => v.funcionarioId === funcionarioId),
  leiturasPendentes: async (chave: string) =>
    (estado.leituras.get(chave) ?? []).map((l) => ({ ...l, chaveDaVisita: chave, temLocalizacao: false, enviada: false })),
  marcarVisitaEnviada: async (chave: string, visitaId: number) => {
    estado.gravado.visitasEnviadas.push({ chave, visitaId });
  },
  marcarLeiturasEnviadas: async (ids: number[]) => {
    estado.gravado.leiturasEnviadas.push(...ids);
  },
  registrarFalha: async (chave: string, erro: string) => {
    estado.gravado.falhas.push({ chave, erro });
  },
  marcarSincronizacao: async (quando: string) => {
    estado.gravado.sincronizadoEm = quando;
  },
}));

type Resposta = { data: unknown; error: { message: string } | null };

/** Roteiro do servidor para o teste corrente -- cada `it` sobrescreve o que precisa. */
const servidor = {
  upsertVisita: (): Resposta => ({ data: { id: 500 }, error: null }),
  buscarVisita: (): Resposta => ({ data: null, error: null }),
  upsertLeituras: (linhas: unknown[]): Resposta => ({ data: linhas.map((_, i) => ({ id: i + 1 })), error: null }),
};

/**
 * Imita o encadeamento do supabase-js: `.select()` devolve algo que da para
 * aguardar direto (leituras) OU pedir `.maybeSingle()` (visitas), e `.eq()`
 * pode aparecer quantas vezes quiser no meio.
 */
function encadeavel(obter: () => Resposta) {
  const alvo = {
    select: () => alvo,
    eq: () => alvo,
    maybeSingle: async () => obter(),
    then: (ok: (r: Resposta) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(obter()).then(ok, err),
  };
  return alvo;
}

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => {
      if (tabela === "visitas") {
        return {
          upsert: () => encadeavel(() => servidor.upsertVisita()),
          select: () => encadeavel(() => servidor.buscarVisita()),
        };
      }
      return { upsert: (linhas: unknown[]) => encadeavel(() => servidor.upsertLeituras(linhas)) };
    },
  },
}));

const { sincronizar } = await import("./sincronizacao");

const CHAVE = "0b6c1f2e-3a4d-4b5c-8d9e-0f1a2b3c4d5e";
const FUNCIONARIO = "11111111-2222-4333-8444-555555555555";
/** Com fuso: `instanteObrigatorio` recusa carimbo sem ele, e com razao. */
const INSTANTE = "2026-09-08T08:12:00-03:00";

function enfileirarRonda(opcoes: { visitaId?: number | null; comLeitura?: boolean } = {}) {
  estado.visitas.push({
    chave: CHAVE,
    siteId: 7,
    funcionarioId: FUNCIONARIO,
    capturadoEm: INSTANTE,
    visitaId: opcoes.visitaId ?? null,
    enviada: false,
  });

  if (opcoes.comLeitura) {
    estado.leituras.set(CHAVE, [
      { id: 31, dataHora: INSTANTE, areaId: 4, qrCodeId: 9, observacao: null },
    ]);
  }
}

beforeEach(() => {
  estado.visitas = [];
  estado.leituras = new Map();
  estado.gravado = { visitasEnviadas: [], leiturasEnviadas: [], falhas: [], sincronizadoEm: null };
  servidor.upsertVisita = () => ({ data: { id: 500 }, error: null });
  servidor.buscarVisita = () => ({ data: null, error: null });
  servidor.upsertLeituras = (linhas) => ({ data: linhas.map((_, i) => ({ id: i + 1 })), error: null });
});

describe("ronda aberta, ainda sem leitura", () => {
  /**
   * A regressao que motivou esta suite. A guarda de `sincronizar` ja exigia
   * `visitaId !== null` para pular, e ronda recem-aberta tem `visitaId`
   * nulo por definicao -- ela escapava para o `safeParse`, que exige no
   * minimo uma leitura, e virava falha.
   */
  it("nao vira falha: nao ha o que enviar, e isso nao e erro", async () => {
    enfileirarRonda({ visitaId: null });

    const resultado = await sincronizar(FUNCIONARIO);

    expect(resultado.falhas).toEqual([]);
    expect(estado.gravado.falhas).toEqual([]);
  });

  it("nao consome tentativa nem toca no servidor", async () => {
    enfileirarRonda({ visitaId: null });

    const upsert = vi.fn(() => ({ data: { id: 500 }, error: null }) as Resposta);
    servidor.upsertVisita = upsert;

    await sincronizar(FUNCIONARIO);

    expect(upsert).not.toHaveBeenCalled();
    expect(estado.gravado.visitasEnviadas).toEqual([]);
  });

  /**
   * O carimbo do rodape e a linha que o inspetor le para decidir se pode
   * fechar o dia. Com a ronda aberta contando como falha, ele nunca era
   * escrito -- a tela dizia "nada subiu" no cenario em que nada havia para
   * subir.
   */
  it("deixa o carimbo de sincronizacao ser escrito", async () => {
    enfileirarRonda({ visitaId: null });

    await sincronizar(FUNCIONARIO);

    expect(estado.gravado.sincronizadoEm).not.toBeNull();
  });

  it("tambem pula a visita ja enviada que nao tem leitura pendente", async () => {
    enfileirarRonda({ visitaId: 500 });

    const resultado = await sincronizar(FUNCIONARIO);

    expect(resultado.falhas).toEqual([]);
    expect(estado.gravado.visitasEnviadas).toEqual([]);
  });
});

describe("ronda com leitura", () => {
  it("envia, marca a visita e marca as leituras", async () => {
    enfileirarRonda({ comLeitura: true });

    const resultado = await sincronizar(FUNCIONARIO);

    expect(resultado.visitasCriadas).toBe(1);
    expect(resultado.leiturasCriadas).toBe(1);
    expect(estado.gravado.visitasEnviadas).toEqual([{ chave: CHAVE, visitaId: 500 }]);
    expect(estado.gravado.leiturasEnviadas).toEqual([31]);
    expect(estado.gravado.sincronizadoEm).not.toBeNull();
  });

  /**
   * Reenvio: o `do nothing` nao devolve linha, e o id vem de uma leitura.
   * E o caso da resposta perdida no instante do commit -- a razao de a chave
   * de idempotencia ser cunhada no aparelho (migration 0047).
   */
  it("reenvio recupera o id da visita que ja estava la, sem duplicar", async () => {
    enfileirarRonda({ comLeitura: true });
    servidor.upsertVisita = () => ({ data: null, error: null });
    servidor.buscarVisita = () => ({ data: { id: 777 }, error: null });
    servidor.upsertLeituras = () => ({ data: [], error: null });

    const resultado = await sincronizar(FUNCIONARIO);

    expect(resultado.visitasCriadas).toBe(0);
    expect(resultado.visitasJaExistiam).toBe(1);
    expect(resultado.leiturasCriadas).toBe(0);
    expect(resultado.leiturasJaExistiam).toBe(1);
    expect(estado.gravado.visitasEnviadas).toEqual([{ chave: CHAVE, visitaId: 777 }]);
  });

  /**
   * Nem inseriu nem achou. Tratar como sucesso marcaria como enviada uma
   * ronda que nunca chegou -- perda de dado silenciosa, o pior desfecho
   * possivel para este arquivo.
   */
  it("nao marca como enviada quando a visita some entre o insert e a busca", async () => {
    enfileirarRonda({ comLeitura: true });
    servidor.upsertVisita = () => ({ data: null, error: null });
    servidor.buscarVisita = () => ({ data: null, error: null });

    const resultado = await sincronizar(FUNCIONARIO);

    expect(resultado.falhas).toHaveLength(1);
    expect(estado.gravado.visitasEnviadas).toEqual([]);
    expect(estado.gravado.sincronizadoEm).toBeNull();
  });

  it("falha ao gravar leitura nao marca a leitura como enviada", async () => {
    enfileirarRonda({ comLeitura: true });
    servidor.upsertLeituras = () => ({ data: null, error: { message: "rede caiu" } });

    const resultado = await sincronizar(FUNCIONARIO);

    expect(resultado.falhas).toEqual([{ chave: CHAVE, erro: "rede caiu" }]);
    expect(estado.gravado.leiturasEnviadas).toEqual([]);
    expect(estado.gravado.sincronizadoEm).toBeNull();
  });
});

describe("aparelho compartilhado", () => {
  /**
   * O bug que este bloco fecha, e por que ele e de PERDA DE DADO e nao de tela.
   *
   * O arquivo SQLite e do aparelho, e o aparelho roda entre quinze inspetores.
   * Antes do recorte, `sincronizar` drenava a fila inteira com o token de quem
   * estivesse logado: a ronda que A deixou pendente ao sair saia num insert
   * assinado por B, carregando `funcionario_id = A`. A policy da migration
   * 0036 (`with check (... and funcionario_id = auth.uid())`) recusa, e a
   * ronda de A ficava presa atras de um erro que B nao tinha como resolver --
   * para sempre, porque toda sincronizacao seguinte repetia a tentativa.
   */
  const OUTRO = "99999999-8888-4777-8666-555555555555";

  it("nao drena a ronda de outro inspetor", async () => {
    enfileirarRonda({ comLeitura: true });

    const upsert = vi.fn(() => ({ data: { id: 500 }, error: null }) as Resposta);
    servidor.upsertVisita = upsert;

    const resultado = await sincronizar(OUTRO);

    expect(upsert).not.toHaveBeenCalled();
    expect(resultado.visitasCriadas).toBe(0);
    // E, principalmente: nao vira falha na fila de ninguem. A ronda de A
    // continua intacta, pendente, esperando A entrar de novo.
    expect(estado.gravado.falhas).toEqual([]);
    expect(estado.gravado.visitasEnviadas).toEqual([]);
  });

  it("a ronda volta a subir quando o dono da sessao e o dono da ronda", async () => {
    enfileirarRonda({ comLeitura: true });

    const resultado = await sincronizar(FUNCIONARIO);

    expect(resultado.visitasCriadas).toBe(1);
    expect(estado.gravado.visitasEnviadas).toEqual([{ chave: CHAVE, visitaId: 500 }]);
  });
});
