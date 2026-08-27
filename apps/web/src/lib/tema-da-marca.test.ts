import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CORES_DA_MARCA } from "@projeto-renatoo/shared";

/**
 * Portao anti-drift entre os dois renderizadores da marca.
 *
 * O Tailwind v4 so aceita token como custom property em `@theme`, entao o
 * painel nao consegue importar `CORES_DA_MARCA` -- a paleta existe duas vezes
 * por necessidade do build, nao por escolha. Este teste e o que impede as duas
 * copias de virarem dois produtos: quem trocar um hex no CSS sem trocar no
 * shared (ou o contrario) para no CI, e nao em campo.
 *
 * Compara os conjuntos inteiros, e nao valor a valor: assim token novo no CSS
 * que ninguem levou para o app -- e token removido do app que ficou orfao no
 * CSS -- tambem falham.
 */
const globalsCss = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);

/**
 * `--color-brand-green-hover: #00c853;` -> `{ "green-hover": "#00c853" }`.
 * O `;` no fim e obrigatorio no padrao para nao casar com uma mencao ao token
 * dentro de comentario ou de `var()`.
 */
function lerCoresDoCss(css: string): Record<string, string> {
  const padrao = /--color-brand-([a-z-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g;

  return Object.fromEntries(
    [...css.matchAll(padrao)].map(([, nome, hex]) => [nome, hex.toLowerCase()]),
  );
}

describe("tokens da marca", () => {
  it("a paleta do globals.css e a mesma do shared", () => {
    expect(lerCoresDoCss(globalsCss)).toEqual({ ...CORES_DA_MARCA });
  });

  it("nenhum token da marca fica so no shared", () => {
    // Redundante com o toEqual acima enquanto ele passar, mas a mensagem de
    // falha aqui diz *qual* token sumiu do CSS, em vez de despejar os dois
    // objetos lado a lado para o proximo a comparar a olho.
    for (const nome of Object.keys(CORES_DA_MARCA)) {
      expect(globalsCss).toContain(`--color-brand-${nome}:`);
    }
  });

  it("o regex de leitura reconhece a forma real do arquivo", () => {
    // Sem isto, um `@theme` renomeado (ou um prefixo `--color-brand-` trocado)
    // faria `lerCoresDoCss` devolver `{}` -- e um `{}` comparado com `{}` num
    // shared tambem vazio passaria calado. Ancora o teste em algo que so o
    // arquivo de verdade tem.
    expect(Object.keys(lerCoresDoCss(globalsCss)).length).toBeGreaterThan(0);
  });
});
