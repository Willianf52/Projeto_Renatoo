"use client";

import { useRef, useState } from "react";
import { XIcon } from "./icons";
import { useClickOutside } from "./useClickOutside";

const HORAS = Array.from({ length: 24 }, (_, indice) => String(indice).padStart(2, "0"));
const MINUTOS = Array.from({ length: 60 }, (_, indice) => String(indice).padStart(2, "0"));

/** "08:05" -> { hora: "08", minuto: "05" }; vazio ou fora do formato vira
 * "sem selecao", nao erro -- mesmo criterio de `deISO` em FilterDatePicker. */
function lerValor(valor?: string): { hora: string; minuto: string } | null {
  if (!valor) return null;
  const [hora, minuto] = valor.split(":");
  if (!hora || !minuto) return null;
  return { hora, minuto };
}

/**
 * Substitui o `<input type="time">` nativo pelo mesmo tratamento que
 * `FilterDatePicker` deu as datas: o campo mostra o rotulo ("Hora Inicial")
 * ate um horario ser escolhido, em vez do "--:--" que o navegador desenha por
 * conta propria e ignora o `placeholder` -- por isso Hora Inicial e Hora
 * Final ficavam visualmente identicos, so distinguiveis por leitor de tela
 * (`aria-label`), nunca a olho.
 *
 * Popover com dois `<select>` (hora/minuto) em vez de calendario: e a mesma
 * ideia de "escolher e fechar", adaptada ao que um horario pede -- duas
 * listas fechadas, sem grade de dias para desenhar.
 *
 * O valor que vai no FormData e o do `<input type="hidden">`, no formato
 * "HH:MM" -- o mesmo que o input nativo produzia, para `combinarDataHora`
 * (`coletas-importadas/queries.ts`) continuar recebendo exatamente o que
 * esperava.
 */
export function FilterTimePicker({
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
  const [selecionado, setSelecionado] = useState<{ hora: string; minuto: string } | null>(() =>
    lerValor(defaultValue),
  );
  const [pendente, setPendente] = useState<{ hora: string; minuto: string }>(
    () => lerValor(defaultValue) ?? { hora: "00", minuto: "00" },
  );
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, aberto, () => setAberto(false));

  function abrir() {
    // O popover sempre parte do horario ja escolhido -- ou de meia-noite, se
    // ainda nao havia nenhum -- para reabrir nao perder o que a pessoa
    // ajustou da ultima vez.
    setPendente(selecionado ?? { hora: "00", minuto: "00" });
    setAberto((atual) => !atual);
  }

  function aplicar() {
    setSelecionado(pendente);
    setAberto(false);
  }

  function limpar(evento: React.MouseEvent) {
    evento.stopPropagation();
    setSelecionado(null);
    setAberto(false);
  }

  const valorFormulario = selecionado ? `${selecionado.hora}:${selecionado.minuto}` : "";

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className ?? ""}`}>
      <input type="hidden" name={name} value={valorFormulario} />

      <button
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={label}
        className={`h-10 w-full min-w-0 rounded-md border border-slate-800 bg-brand-surface px-3 text-left text-sm shadow-sm outline-none transition-all duration-200 hover:border-slate-700 focus:border-brand-green focus:ring-1 focus:ring-brand-green ${
          selecionado ? "pr-8 text-white" : "text-brand-muted"
        }`}
      >
        {selecionado ? valorFormulario : label}
      </button>

      {/* Irmao do botao, nao filho: <button> dentro de <button> e invalido. */}
      {selecionado && (
        <button
          type="button"
          onClick={limpar}
          aria-label={`Limpar ${label}`}
          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-brand-muted transition-colors hover:bg-brand-navy hover:text-white"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}

      {aberto && (
        <div
          role="dialog"
          aria-label={`Horário — ${label}`}
          className="absolute left-0 top-[calc(100%+4px)] z-20 w-48 rounded-md border border-slate-800 bg-brand-surface p-3 shadow-lg"
        >
          <div className="flex items-center gap-2">
            <select
              aria-label="Hora"
              value={pendente.hora}
              onChange={(evento) => setPendente((atual) => ({ ...atual, hora: evento.target.value }))}
              className="h-10 min-w-0 flex-1 rounded-md border border-slate-800 bg-brand-navy px-2 text-center text-sm text-white outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green"
            >
              {HORAS.map((hora) => (
                <option key={hora} value={hora}>
                  {hora}
                </option>
              ))}
            </select>
            <span className="text-brand-muted">:</span>
            <select
              aria-label="Minuto"
              value={pendente.minuto}
              onChange={(evento) => setPendente((atual) => ({ ...atual, minuto: evento.target.value }))}
              className="h-10 min-w-0 flex-1 rounded-md border border-slate-800 bg-brand-navy px-2 text-center text-sm text-white outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green"
            >
              {MINUTOS.map((minuto) => (
                <option key={minuto} value={minuto}>
                  {minuto}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={aplicar}
            className="mt-2 h-9 w-full rounded-md bg-brand-green text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-green-hover"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
