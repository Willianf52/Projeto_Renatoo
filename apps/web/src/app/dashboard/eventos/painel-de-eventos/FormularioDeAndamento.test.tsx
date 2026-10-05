// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  acao: vi.fn(async () => ({}) as { erro?: string }),
  enviados: [] as { caminho: string; tipo?: string }[],
  falhaNoEnvio: false,
}));

vi.mock("./actions", () => ({
  registrarAndamento: (...args: unknown[]) => (estado.acao as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: async (caminho: string, _arquivo: File, opcoes: { contentType?: string }) => {
          if (estado.falhaNoEnvio) return { error: { message: "falhou" } };
          estado.enviados.push({ caminho, tipo: opcoes.contentType });
          return { error: null };
        },
      }),
    },
  }),
}));

const { FormularioDeAndamento } = await import("./FormularioDeAndamento");

const OPCOES = {
  tiposDeAnalise: [{ value: "1", label: "Em Análise" }],
  classificacoes: [{ value: "1", label: "Em Análise" }],
  usuarios: [
    { value: "11111111-2222-4333-8444-555555555555", label: "Karina" },
    { value: "0b6c1f2e-3a4d-4b5c-8d9e-0f1a2b3c4d5e", label: "Eric" },
  ],
  grupos: [{ value: "5", label: "Lote 1" }],
  membrosPorGrupo: { "5": ["11111111-2222-4333-8444-555555555555"] },
};

beforeEach(() => {
  estado.acao.mockClear();
  estado.enviados = [];
  estado.falhaNoEnvio = false;
});
afterEach(cleanup);

function pdf(nome = "laudo.pdf") {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], nome, { type: "application/pdf" });
}

async function preencherEEnviar(botao: string, texto: string) {
  const usuario = userEvent.setup();
  await usuario.type(screen.getAllByRole("textbox")[0], texto);
  await usuario.click(screen.getByRole("button", { name: botao }));
  return usuario;
}

describe("FormularioDeAndamento", () => {
  it("a analise tem classificacao, responsavel e apoio; a finalizacao tem quem avisar", () => {
    const { unmount } = render(<FormularioDeAndamento ocorrenciaId={7} tipo="ANALISE" opcoes={OPCOES} />);
    expect(screen.getByLabelText("Análise do Evento")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de Classificação")).toBeInTheDocument();
    expect(screen.getByLabelText("Responsável")).toBeInTheDocument();
    expect(screen.getByLabelText("Grupo de Usuários")).toBeInTheDocument();
    unmount();

    render(<FormularioDeAndamento ocorrenciaId={7} tipo="FINALIZACAO" opcoes={OPCOES} />);
    expect(screen.getByLabelText("Ações Realizadas")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tipo de Classificação")).not.toBeInTheDocument();
    expect(screen.getByText("Avisar sobre a Finalização")).toBeInTheDocument();
  });

  it("a opcao unica de tipo de analise ja vem escolhida", () => {
    render(<FormularioDeAndamento ocorrenciaId={7} tipo="ANALISE" opcoes={OPCOES} />);
    expect(screen.getByLabelText("Tipo de Análise")).toHaveValue("1");
  });

  it("sem anexo, manda o formulario com a lista de arquivos vazia", async () => {
    render(<FormularioDeAndamento ocorrenciaId={7} tipo="ANALISE" opcoes={OPCOES} />);
    await preencherEEnviar("Salvar análise", "Vamos apurar");

    await waitFor(() => expect(estado.acao).toHaveBeenCalledTimes(1));
    const formulario = (estado.acao.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(formulario.get("ocorrencia_id")).toBe("7");
    expect(formulario.get("tipo")).toBe("ANALISE");
    expect(formulario.get("texto")).toBe("Vamos apurar");
    expect(formulario.get("arquivos_enviados")).toBe("[]");
  });

  it("sobe cada anexo direto ao Storage e manda so os caminhos para a action", async () => {
    render(<FormularioDeAndamento ocorrenciaId={7} tipo="FINALIZACAO" opcoes={OPCOES} />);
    const usuario = userEvent.setup();
    await usuario.upload(screen.getByLabelText("Fotos da Ocorrência"), [pdf("Laudo Final.pdf")]);
    await usuario.type(screen.getAllByRole("textbox")[0], "Resolvido");
    await usuario.click(screen.getByRole("button", { name: "Finalizar ocorrência" }));

    await waitFor(() => expect(estado.acao).toHaveBeenCalledTimes(1));
    expect(estado.enviados).toHaveLength(1);
    expect(estado.enviados[0].caminho).toMatch(/^7\/[0-9a-f-]{36}-laudo-final\.pdf$/);
    expect(estado.enviados[0].tipo).toBe("application/pdf");

    const formulario = (estado.acao.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(formulario.get("arquivos")).toBeNull();
    expect(JSON.parse(String(formulario.get("arquivos_enviados")))).toEqual([
      { storage_path: estado.enviados[0].caminho, nome: "Laudo Final.pdf" },
    ]);
  });

  it("arquivo com a extensao de um formato aceito mas conteudo de outro e recusado antes de subir", async () => {
    render(<FormularioDeAndamento ocorrenciaId={7} tipo="ANALISE" opcoes={OPCOES} />);
    const usuario = userEvent.setup();
    const falso = new File([new TextEncoder().encode("<html>")], "relatorio.pdf", { type: "application/pdf" });
    await usuario.upload(screen.getByLabelText("Fotos da Ocorrência"), [falso]);
    await usuario.type(screen.getAllByRole("textbox")[0], "texto");
    await usuario.click(screen.getByRole("button", { name: "Salvar análise" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("o conteúdo não bate");
    expect(estado.enviados).toHaveLength(0);
    expect(estado.acao).not.toHaveBeenCalled();
  });

  it("falha no envio de um anexo avisa e nao grava a analise", async () => {
    estado.falhaNoEnvio = true;
    render(<FormularioDeAndamento ocorrenciaId={7} tipo="ANALISE" opcoes={OPCOES} />);
    const usuario = userEvent.setup();
    await usuario.upload(screen.getByLabelText("Fotos da Ocorrência"), [pdf()]);
    await usuario.type(screen.getAllByRole("textbox")[0], "texto");
    await usuario.click(screen.getByRole("button", { name: "Salvar análise" }));

    expect(await screen.findByRole("alert")).toHaveTextContent('Não foi possível enviar "laudo.pdf"');
    expect(estado.acao).not.toHaveBeenCalled();
  });
});
