"use client";

import { useRef, useState } from "react";
import { ChevronsLeftIcon, ChevronsRightIcon, XIcon } from "./icons";
import { useClickOutside } from "./useClickOutside";

const DIAS_DA_SEMANA = ["Do", "Se", "Te", "Qu", "Qu", "Se", "Sa"];
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function paraISO(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** `new Date("yyyy-mm-dd")` interpreta como UTC meia-noite -- em fusos
 * negativos (Brasil) isso volta um dia na exibicao local. Construindo com os
 * componentes separados o Date fica em hora local desde o inicio. */
function deISO(iso?: string): Date | null {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
}

function paraExibicao(data: Date): string {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${data.getFullYear()}`;
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Grade fixa de 42 celulas (6 semanas), com os dias do mes vizinho
 * preenchendo as pontas -- como no calendario de referencia. */
function construirGrade(mesReferencia: Date): { data: Date; foraDoMes: boolean }[] {
  const primeiroDia = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth(), 1);
  const inicio = new Date(primeiroDia);
  inicio.setDate(inicio.getDate() - primeiroDia.getDay());

  return Array.from({ length: 42 }, (_, indice) => {
    const data = new Date(inicio);
    data.setDate(inicio.getDate() + indice);
    return { data, foraDoMes: data.getMonth() !== mesReferencia.getMonth() };
  });
}

/**
 * Substitui o `<input type="date">` nativo por um calendario proprio, como no
 * sistema de referencia: o campo mostra o rotulo ("Data Inicial") ate uma
 * data ser escolhida, e o popover de calendario abre ao clicar nele -- em vez
 * do seletor nativo do navegador (visual que nao da pra estilizar).
 *
 * O valor que vai no FormData e o do `<input type="hidden">`: o botao visivel
 * e so a interacao, e por isso o form continua funcionando via GET nativo,
 * sem JS no submit.
 */
export function FilterDatePicker({
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
  const [selecionado, setSelecionado] = useState<Date | null>(() => deISO(defaultValue));
  const [mesVisivel, setMesVisivel] = useState<Date>(() => deISO(defaultValue) ?? new Date());
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, aberto, () => setAberto(false));

  function escolher(data: Date) {
    setSelecionado(data);
    setMesVisivel(data);
    setAberto(false);
  }

  function limpar() {
    setSelecionado(null);
    setAberto(false);
  }

  function mudarMes(delta: number) {
    setMesVisivel((atual) => new Date(atual.getFullYear(), atual.getMonth() + delta, 1));
  }

  const grade = construirGrade(mesVisivel);

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className ?? ""}`}>
      <input type="hidden" name={name} value={selecionado ? paraISO(selecionado) : ""} />

      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={label}
        className={`h-10 w-full min-w-0 rounded-md border border-slate-800 bg-brand-surface px-3 text-left text-sm shadow-sm outline-none transition-all duration-200 hover:border-slate-700 focus:border-brand-green focus:ring-1 focus:ring-brand-green ${
          selecionado ? "pr-8 text-white" : "text-brand-muted"
        }`}
      >
        {selecionado ? paraExibicao(selecionado) : label}
      </button>

      {/* Irmao do botao, nao filho: <button> dentro de <button> e invalido.
          stopPropagation impede o clique de tambem abrir o popover. */}
      {selecionado && (
        <button
          type="button"
          onClick={(evento) => {
            evento.stopPropagation();
            limpar();
          }}
          aria-label={`Limpar ${label}`}
          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-brand-muted transition-colors hover:bg-brand-navy hover:text-white"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}

      {aberto && (
        <div
          role="dialog"
          aria-label={`Calendário — ${label}`}
          className="absolute left-0 top-[calc(100%+4px)] z-20 w-72 rounded-md border border-slate-800 bg-brand-surface p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => mudarMes(-1)}
              aria-label="Mês anterior"
              className="flex h-7 w-7 items-center justify-center rounded text-brand-muted transition-colors hover:bg-brand-navy hover:text-white"
            >
              <ChevronsLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold capitalize text-white">
              {MESES[mesVisivel.getMonth()]} {mesVisivel.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => mudarMes(1)}
              aria-label="Próximo mês"
              className="flex h-7 w-7 items-center justify-center rounded text-brand-muted transition-colors hover:bg-brand-navy hover:text-white"
            >
              <ChevronsRightIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-xs text-brand-muted">
            {DIAS_DA_SEMANA.map((dia, indice) => (
              <span key={indice} className="py-1 font-medium">
                {dia}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {grade.map(({ data, foraDoMes }) => {
              const ehSelecionado = selecionado !== null && mesmoDia(data, selecionado);
              return (
                <div key={data.getTime()} className="flex items-center justify-center py-0.5">
                  <button
                    type="button"
                    onClick={() => escolher(data)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors ${
                      ehSelecionado
                        ? "bg-brand-green font-semibold text-brand-navy"
                        : foraDoMes
                          ? "text-brand-muted/50 hover:bg-brand-navy hover:text-white"
                          : "text-white hover:bg-brand-navy"
                    }`}
                  >
                    {data.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
