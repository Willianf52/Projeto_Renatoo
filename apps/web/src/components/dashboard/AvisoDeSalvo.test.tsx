import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { AvisoDeSalvo } from "./AvisoDeSalvo";
import { ToastOnMount } from "./ToastOnMount";

const LISTAGEM = "/dashboard/cadastros/site-planta";

/** Componente de servidor assincrono: chamado direto, devolve o elemento. */
async function avisoCom(params: Record<string, string | string[] | undefined>) {
  return AvisoDeSalvo({
    searchParams: Promise.resolve(params),
    listagem: LISTAGEM,
    mensagem: "Site salvo com sucesso.",
  });
}

describe("AvisoDeSalvo", () => {
  it("nao renderiza nada sem o sinal na URL", async () => {
    expect(await avisoCom({})).toBeNull();
    expect(await avisoCom({ salvo: "0" })).toBeNull();
  });

  it("dispara o toast com a mensagem da tela", async () => {
    const elemento = await avisoCom({ salvo: "1" });

    expect(isValidElement(elemento)).toBe(true);
    expect(elemento?.type).toBe(ToastOnMount);
    expect(elemento?.props).toMatchObject({ message: "Site salvo com sucesso.", cleanHref: LISTAGEM });
  });

  it("limpa so o `salvo`, preservando busca e pagina", async () => {
    const elemento = await avisoCom({ salvo: "1", busca: "Ipiranga", pagina: "2" });

    expect(elemento?.props).toMatchObject({ cleanHref: `${LISTAGEM}?busca=Ipiranga&pagina=2` });
  });

  it("parametro repetido usa o primeiro valor, como as queries", async () => {
    const elemento = await avisoCom({ salvo: ["1", "0"], busca: ["a", "b"] });

    expect(elemento?.props).toMatchObject({ cleanHref: `${LISTAGEM}?busca=a` });
  });
});
