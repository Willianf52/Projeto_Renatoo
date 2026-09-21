"use client";

import { useState } from "react";
import { ChevronRightIcon } from "@/components/dashboard/icons";
import type { NoDoMapa } from "./queries";

/**
 * A grade em arvore do Mapa de Eventos por Site. Client Component so por causa
 * do abrir/fechar das pastas -- os dados chegam prontos do servidor.
 *
 * Tudo abre FECHADO, como na referencia: a primeira coisa que se ve e a linha
 * "UP Serviços" com o total de cada dia, e quem quer o detalhe expande.
 */
export function ArvoreDoMapa({ colunas, raiz }: { colunas: string[]; raiz: NoDoMapa }) {
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());

  const alternar = (chave: string) =>
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });

  const linhas: { no: NoDoMapa; nivel: number }[] = [];
  const visitar = (no: NoDoMapa, nivel: number) => {
    linhas.push({ no, nivel });
    if (abertos.has(no.chave)) no.filhos.forEach((filho) => visitar(filho, nivel + 1));
  };
  visitar(raiz, 0);

  return (
    <table className="w-full border-collapse text-left text-xs">
      <thead>
        <tr className="border-b border-slate-800 text-brand-muted">
          <th scope="col" className="sticky left-0 z-10 min-w-64 bg-brand-surface px-3 py-2 font-semibold">
            Site
          </th>
          {colunas.map((coluna) => (
            <th key={coluna} scope="col" className="px-1 py-2 text-center font-semibold whitespace-nowrap">
              {coluna}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map(({ no, nivel }) => {
          const temFilhos = no.filhos.length > 0;
          const aberto = abertos.has(no.chave);

          return (
            <tr key={no.chave} className="border-b border-slate-800/60 animate-fade-in">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-brand-surface px-3 py-1.5 font-normal whitespace-nowrap"
                style={{ paddingLeft: `${0.75 + nivel * 1.25}rem` }}
              >
                <span className="flex items-center gap-1.5">
                  {temFilhos ? (
                    <button
                      type="button"
                      onClick={() => alternar(no.chave)}
                      aria-expanded={aberto}
                      aria-label={`${aberto ? "Recolher" : "Expandir"} ${no.nome}`}
                      className="rounded p-0.5 text-brand-muted transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <ChevronRightIcon
                        className={`h-3.5 w-3.5 transition-transform duration-200 ${aberto ? "rotate-90" : ""}`}
                      />
                    </button>
                  ) : (
                    // Mesmo recuo do botao, para os nomes das folhas alinharem.
                    <span className="w-4.5 shrink-0" aria-hidden />
                  )}
                  <IconeDePasta />
                  <span className={nivel === 0 ? "font-semibold text-white" : "text-white"}>{no.nome}</span>
                </span>
              </th>
              {no.porDia.map((quantidade, dia) => (
                <td key={dia} className="p-px">
                  <span
                    className={`block min-w-9 rounded-sm px-1 py-1 text-center font-medium text-white ${
                      quantidade > 0 ? "bg-red-600" : "bg-emerald-600/80"
                    }`}
                  >
                    {quantidade}
                  </span>
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Pasta, como a referencia desenha organizacao, grupo e site. So visual: o
 * nome ao lado ja diz o que e a linha.
 */
function IconeDePasta() {
  return (
    <svg viewBox="0 0 20 16" className="h-3.5 w-4 shrink-0 text-amber-400" fill="currentColor" aria-hidden>
      <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h4.1l1.6 2h9.3A1.5 1.5 0 0 1 19 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 1 13.5z" />
    </svg>
  );
}
