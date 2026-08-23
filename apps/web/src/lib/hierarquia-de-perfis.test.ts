import { describe, expect, it } from "vitest";
import { montarHierarquiaDePerfis } from "./hierarquia-de-perfis";

describe("montarHierarquiaDePerfis", () => {
  const perfil = (id: string, nome: string, superior: string | null = null) => ({
    id,
    nome_completo: nome,
    superior_id: superior,
  });

  it("indenta por profundidade, como na referência", () => {
    const opcoes = montarHierarquiaDePerfis([perfil("a", "Gesiel"), perfil("b", "Gilmar", "a")]);

    expect(opcoes).toEqual([
      { value: "a", label: "->Gesiel" },
      { value: "b", label: "--->Gilmar" },
    ]);
  });

  /**
   * O RLS de `profiles` (migration 0006) recorta a lista. Sem tratar o superior
   * ausente como raiz, quem tem chefe fora do recorte sumiria da lista inteira.
   */
  it("promove a raiz quem tem superior fora do recorte do RLS", () => {
    const opcoes = montarHierarquiaDePerfis([perfil("b", "Gilmar", "desaparecido")]);

    expect(opcoes).toEqual([{ value: "b", label: "->Gilmar" }]);
  });

  /** `superior_id` nao tem trava contra ciclo no banco; sem o conjunto de
   * visitados a recursao nao terminaria e a tela travaria no servidor. */
  it("nao entra em loop quando dois perfis chefiam um ao outro", () => {
    const opcoes = montarHierarquiaDePerfis([perfil("a", "Ana", "b"), perfil("b", "Bruno", "a")]);

    expect(opcoes).toHaveLength(2);
  });

  it("nao quebra com perfil sem nome preenchido", () => {
    expect(montarHierarquiaDePerfis([perfil("a", null as unknown as string)])).toEqual([
      { value: "a", label: "->(sem nome)" },
    ]);
  });
});
