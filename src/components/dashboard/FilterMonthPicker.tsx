"use client";

import { useRef, useState } from "react";
import { ChevronsLeftIcon, ChevronsRightIcon } from "./icons";
import { useClickOutside } from "./useClickOutside";

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function paraISO(ano: number, mes: number): string {
  return `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

function deISO(iso?: string): { ano: number; mes: number } | null {
  if (!iso) return null;
  const [ano, mes] = iso.split("-").map(Number);
  if (!ano || !mes) return null;
  return { ano, mes: mes - 1 };
}

function paraExibicao(valor: { ano: number; mes: number }): string {
  return `${String(valor.mes + 1).padStart(2, "0")}/${valor.ano}`;
}

/**
 * Mesmo motivo do FilterDatePicker: `<input type="month">` nativo nao da pra
 * estilizar. Popover mais simples que o de data -- so ano (com navegacao) e
 * os 12 meses em grade, sem dias.
 */
export function FilterMonthPicker({
  label,
  name,
  defaultValue,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  className?: string;
}) {
  const [selecionado, setSelecionado] = useState(() => deISO(defaultValue));
  const [anoVisivel, setAnoVisivel] = useState(() => deISO(defaultValue)?.ano ?? new Date().getFullYear());
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, aberto, () => setAberto(false));

  function escolher(mes: number) {
    setSelecionado({ ano: anoVisivel, mes });
    setAberto(false);
  }

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className ?? ""}`}>
      <input type="hidden" name={name} value={selecionado ? paraISO(selecionado.ano, selecionado.mes) : ""} />

      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={label}
        className={`h-10 w-full min-w-0 rounded-md border border-slate-800 bg-brand-surface px-3 text-left text-sm shadow-sm outline-none transition-all duration-200 hover:border-slate-700 focus:border-brand-green focus:ring-1 focus:ring-brand-green ${
          selecionado ? "text-white" : "text-brand-muted"
        }`}
      >
        {selecionado ? paraExibicao(selecionado) : label}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label={`Selecionar mês — ${label}`}
          className="absolute left-0 top-[calc(100%+4px)] z-20 w-56 rounded-md border border-slate-800 bg-brand-surface p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setAnoVisivel((atual) => atual - 1)}
              aria-label="Ano anterior"
              className="flex h-7 w-7 items-center justify-center rounded text-brand-muted transition-colors hover:bg-brand-navy hover:text-white"
            >
              <ChevronsLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-white">{anoVisivel}</span>
            <button
              type="button"
              onClick={() => setAnoVisivel((atual) => atual + 1)}
              aria-label="Próximo ano"
              className="flex h-7 w-7 items-center justify-center rounded text-brand-muted transition-colors hover:bg-brand-navy hover:text-white"
            >
              <ChevronsRightIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {MESES_ABREV.map((nome, indice) => {
              const ehSelecionado = selecionado?.ano === anoVisivel && selecionado.mes === indice;
              return (
                <button
                  key={nome}
                  type="button"
                  onClick={() => escolher(indice)}
                  className={`rounded-md py-1.5 text-sm transition-colors ${
                    ehSelecionado
                      ? "bg-brand-green font-semibold text-brand-navy"
                      : "text-white hover:bg-brand-navy"
                  }`}
                >
                  {nome}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
