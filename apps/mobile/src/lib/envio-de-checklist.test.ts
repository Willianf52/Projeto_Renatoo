import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O caminho critico do app de campo: subir midia e gravar o checklist.
 *
 * Os dubles imitam as duas fronteiras nativas que o modulo toca -- o arquivo
 * (`expo-file-system`) e a rede (`supabase`) -- porque e justamente nelas que
 * mora o que se quer provar: a ORDEM (midia antes das linhas, ver o cabecalho
 * de `envio-de-checklist.ts`) e o que acontece quando uma das duas falha.
 *
 * `environment: node` continua valendo: nada aqui monta componente.
 */
const { estado } = vi.hoisted(() => ({
  estado: {
    /** Caminhos passados ao Storage, na ordem em que subiram. */
    subidos: [] as string[],
    /** Arquivos de cache criados e apagados pela decodificacao da assinatura. */
    criados: [] as string[],
    apagados: [] as string[],
    /** Liga a falha de leitura do arquivo para exercitar o `catch` do modulo. */
    falharLeituraDeArquivo: false,
    /** Resposta do upload; `null` e sucesso. */
    erroDoUpload: null as { message: string } | null,
  },
}));

vi.mock("expo-file-system", () => {
  class File {
    caminho: string;

    constructor(...partes: string[]) {
      this.caminho = partes.join("/");
    }

    create() {
      estado.criados.push(this.caminho);
    }

    write(_conteudo: string) {
      // O duble nao decodifica base64: o que importa para o modulo e que o
      // ida e volta ao disco devolve bytes, nao quais bytes.
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
      if (estado.falharLeituraDeArquivo) {
        throw new Error("arquivo ilegivel");
      }

      return new Uint8Array([1, 2, 3]).buffer;
    }

    delete() {
      estado.apagados.push(this.caminho);
    }
  }

  return { File, Paths: { cache: "cache" } };
});

const { upload, rpc } = vi.hoisted(() => ({
  upload: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    storage: { from: () => ({ upload }) },
    rpc,
  },
}));

const { enviarChecklist } = await import("./envio-de-checklist");

/** Uma corretiva valida -- o menor envio que o esquema aceita. */
const CORRETIVA = {
  visitaId: 42,
  tipo: "CORRETIVA" as const,
  motivo: "Extintor vencido no corredor B.",
  fotos: ["file:///tmp/foto-1.jpg"],
  assinatura: "iVBORw0KGgo=",
};

/** Uma consultoria valida: sem motivo, com ao menos uma resposta. */
const CONSULTORIA = {
  visitaId: 7,
  tipo: "CONSULTORIA" as const,
  respostas: [{ perguntaId: 1, resposta: "SIM" as const, observacao: "" }],
  fotos: ["file:///tmp/foto-1.jpg"],
  assinatura: "iVBORw0KGgo=",
};

beforeEach(() => {
  estado.subidos = [];
  estado.criados = [];
  estado.apagados = [];
  estado.falharLeituraDeArquivo = false;
  estado.erroDoUpload = null;

  upload.mockReset();
  upload.mockImplementation(async (caminho: string) => {
    estado.subidos.push(caminho);
    return { error: estado.erroDoUpload };
  });

  rpc.mockReset();
  rpc.mockResolvedValue({ data: 99, error: null });
});

describe("envio bem-sucedido", () => {
  it("devolve o id que o RPC gravou", async () => {
    const resultado = await enviarChecklist(CORRETIVA);

    expect(resultado).toEqual({ ok: true, checklistId: 99 });
  });

  it("sobe a assinatura ANTES de gravar as linhas", async () => {
    // A regra que o cabecalho do modulo documenta: `assinatura_path` e
    // `not null`, entao nao ha linha para apontar para um arquivo que ainda
    // nao existe. Invertida, a ordem deixaria no banco um checklist apontando
    // para um PNG que nunca chegou.
    await enviarChecklist(CORRETIVA);

    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
  });

  it("sobe a assinatura como png e a foto como jpeg", async () => {
    await enviarChecklist(CORRETIVA);

    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: "image/png" });
    expect(upload.mock.calls[1][2]).toMatchObject({ contentType: "image/jpeg" });
  });

  it("nunca sobrescreve: upsert fica desligado em todo upload", async () => {
    // O caminho carrega sufixo aleatorio, entao colidir significa que algo
    // esta errado -- e o upsert esconderia isso.
    await enviarChecklist({ ...CORRETIVA, fotos: ["a.jpg", "b.jpg"] });

    for (const chamada of upload.mock.calls) {
      expect(chamada[2]).toMatchObject({ upsert: false });
    }
  });

  it("guarda cada midia sob a pasta da visita", async () => {
    await enviarChecklist(CORRETIVA);

    for (const caminho of estado.subidos) {
      expect(caminho.startsWith("42/")).toBe(true);
    }
  });

  it("da caminhos diferentes a duas fotos do mesmo envio", async () => {
    // `storage_path` e unique na 0042: dois nomes iguais derrubariam o
    // segundo upload em vez de anexar a segunda foto.
    await enviarChecklist({ ...CORRETIVA, fotos: ["a.jpg", "b.jpg"] });

    const fotos = estado.subidos.slice(1);
    expect(fotos).toHaveLength(2);
    expect(new Set(fotos).size).toBe(2);
  });

  it("apaga o arquivo de cache da assinatura depois de ler os bytes", async () => {
    // Sem isto, uma assinatura de cada visita fica no aparelho para sempre.
    await enviarChecklist(CORRETIVA);

    expect(estado.criados).toHaveLength(1);
    expect(estado.apagados).toEqual(estado.criados);
  });
});

describe("consultoria", () => {
  it("manda motivo vazio, e nao null", async () => {
    // O gerador de tipos marca todo argumento sem default como nao-nulo,
    // entao `null` nao passa no tsc; o `nullif(btrim(...))` dentro de
    // `registrar_checklist` colapsa os dois no mesmo null antes do insert.
    await enviarChecklist(CONSULTORIA);

    expect(rpc.mock.calls[0][1]).toMatchObject({ p_motivo: "", p_tipo: "CONSULTORIA" });
  });

  it("converte as respostas para as colunas do banco", async () => {
    await enviarChecklist({
      ...CONSULTORIA,
      respostas: [{ perguntaId: 1, resposta: "SIM" as const, observacao: "Tudo certo." }],
    });

    expect(rpc.mock.calls[0][1].p_respostas).toEqual([
      { pergunta_id: 1, resposta: "SIM", observacao: "Tudo certo." },
    ]);
  });

  it("normaliza observacao em branco para null antes de gravar", async () => {
    // `textoOpcional` no shared colapsa "" em `null` de proposito: a coluna e
    // nullable, e string vazia e `null` no banco significariam a mesma coisa
    // ("o inspetor nao escreveu nada") gravadas de dois jeitos diferentes.
    await enviarChecklist(CONSULTORIA);

    expect(rpc.mock.calls[0][1].p_respostas).toEqual([
      { pergunta_id: 1, resposta: "SIM", observacao: null },
    ]);
  });

  it("manda lista de respostas vazia numa corretiva", async () => {
    await enviarChecklist(CORRETIVA);

    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_respostas: [],
      p_motivo: "Extintor vencido no corredor B.",
    });
  });
});

describe("validacao antes do banco", () => {
  it("recusa corretiva sem motivo sem chamar o RPC", async () => {
    const resultado = await enviarChecklist({ ...CORRETIVA, motivo: "" });

    expect(resultado.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("recusa consultoria sem resposta nenhuma", async () => {
    const resultado = await enviarChecklist({ ...CONSULTORIA, respostas: [] });

    expect(resultado).toEqual({ ok: false, erro: "Responda o checklist antes de enviar." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("recusa envio sem foto", async () => {
    const resultado = await enviarChecklist({ ...CORRETIVA, fotos: [] });

    expect(resultado).toEqual({ ok: false, erro: "Anexe ao menos uma foto." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("recusa a mesma pergunta respondida duas vezes", async () => {
    const resultado = await enviarChecklist({
      ...CONSULTORIA,
      respostas: [
        { perguntaId: 1, resposta: "SIM" as const, observacao: "" },
        { perguntaId: 1, resposta: "NAO" as const, observacao: "" },
      ],
    });

    expect(resultado).toEqual({
      ok: false,
      erro: "A mesma pergunta foi respondida mais de uma vez.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("devolve a mensagem do esquema, e nao um erro generico", async () => {
    // O esquema do shared e o mesmo que o painel usa: a mensagem que ele
    // escreve e a que o inspetor precisa ler para consertar o envio.
    const resultado = await enviarChecklist({ ...CORRETIVA, fotos: [] });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erro).not.toBe("Não foi possível enviar o checklist.");
    }
  });
});

describe("falha de upload", () => {
  it("nao grava linha nenhuma quando a assinatura nao sobe", async () => {
    // O oposto do orfao aceito: aqui nada foi para o banco, entao nao ha
    // checklist apontando para arquivo que nao existe.
    estado.erroDoUpload = { message: "sem sinal" };

    const resultado = await enviarChecklist(CORRETIVA);

    expect(resultado).toEqual({
      ok: false,
      erro: "Não foi possível enviar as imagens. Verifique o sinal e tente de novo.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("para na primeira foto que falha, sem tentar as seguintes", async () => {
    upload.mockImplementation(async (caminho: string) => {
      estado.subidos.push(caminho);
      // Passa a assinatura, quebra na primeira foto.
      return { error: estado.subidos.length === 1 ? null : { message: "sem sinal" } };
    });

    const resultado = await enviarChecklist({ ...CORRETIVA, fotos: ["a.jpg", "b.jpg"] });

    expect(resultado.ok).toBe(false);
    expect(estado.subidos).toHaveLength(2);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("erro vindo do banco", () => {
  it("traduz a unique de visita_id para 'ja finalizada'", async () => {
    // 23505 acontece quando o inspetor toca em Enviar de novo depois de um
    // envio que pareceu falhar mas chegou -- dizer "erro ao enviar" ali
    // mandaria ele tentar mais uma vez para sempre.
    rpc.mockResolvedValue({ data: null, error: { code: "23505" } });

    const resultado = await enviarChecklist(CORRETIVA);

    expect(resultado).toEqual({ ok: false, erro: "Esta visita já foi finalizada." });
  });

  it("usa a mensagem generica para qualquer outro codigo", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });

    const resultado = await enviarChecklist(CORRETIVA);

    expect(resultado).toEqual({ ok: false, erro: "Não foi possível enviar o checklist." });
  });
});

describe("rejeicao fora do PostgREST", () => {
  it("devolve erro em vez de propagar quando o arquivo nao pode ser lido", async () => {
    // Sem o `catch` do modulo, a tela ficaria com o botao em "enviando" para
    // sempre -- o mesmo bug do spinner eterno que TelaDeInspecoes documenta.
    estado.falharLeituraDeArquivo = true;

    const resultado = await enviarChecklist(CORRETIVA);

    expect(resultado).toEqual({ ok: false, erro: "Não foi possível enviar o checklist." });
  });

  it("devolve erro quando a propria chamada de rede rejeita", async () => {
    rpc.mockRejectedValue(new Error("timeout"));

    await expect(enviarChecklist(CORRETIVA)).resolves.toEqual({
      ok: false,
      erro: "Não foi possível enviar o checklist.",
    });
  });
});
