"use client";

import { useRef, useState } from "react";
import { ChevronDownIcon } from "./icons";
import { useClickOutside } from "./useClickOutside";

export type OpcaoDoFiltro = { value: string; label: string };

/**
 * Filtro de selecao multipla do tamanho dos demais (`FilterSelect`), para as
 * grades de filtro de listagem. Nasceu no Historico de Checklist (18/10/2026),
 * onde o sistema de referencia deixa marcar varios Checklists, Sites, Grupos e
 * Responsaveis de uma vez.
 *
 * Diferente de `SelecaoMultipla` (formularios de cadastro): fecha numa linha so,
 * sem etiquetas nem "Selecionar Tudo" ao lado, porque precisa caber numa celula
 * da grade.
 *
 * Funciona no `<form method="get">` sem JS no envio: cada opcao marcada vira um
 * `<input type="hidden">` com o mesmo `name`, e o navegador manda
 * `site=1&site=2`. A pagina le com todos os valores do parametro.
 */
export function FilterMultiSelect({
  label,
  name,
  options,
  defaultValues = [],
}: {
  label: string;
  name: string;
  options: OpcaoDoFiltro[];
  defaultValues?: string[];
}) {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(defaultValues));
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, aberto, () => setAberto(false));

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const visiveis = termo
    ? options.filter((opcao) => opcao.label.toLocaleLowerCase("pt-BR").includes(termo))
    : options;
  const escolhidos = options.filter((opcao) => marcados.has(opcao.value));
  const resumo =
    escolhidos.length === 0
      ? label
      : escolhidos.length <= 2
        ? escolhidos.map((opcao) => opcao.label).join(", ")
        : `${escolhidos.length} selecionados`;

  function alternar(valor: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(valor)) novo.delete(valor);
      else novo.add(valor);
      return novo;
    });
  }

  return (
    <div
      ref={containerRef}
      className="relative min-w-0"
      onKeyDown={(evento) => {
        if (evento.key === "Escape") setAberto(false);
      }}
    >
      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={escolhidos.length ? `${label}: ${resumo}` : label}
        title={escolhidos.length ? escolhidos.map((opcao) => opcao.label).join(", ") : undefined}
        className={`flex h-10 w-full min-w-0 items-center rounded-md border bg-brand-surface px-3 pr-9 text-left text-sm shadow-sm outline-none transition-all duration-200 hover:border-slate-700 focus-visible:border-brand-green focus-visible:ring-1 focus-visible:ring-brand-green ${
          aberto ? "border-brand-green ring-1 ring-brand-green" : "border-slate-800"
        } ${escolhidos.length ? "text-white" : "text-brand-muted"}`}
      >
        <span className="truncate">{resumo}</span>
      </button>
      <ChevronDownIcon
        className={`pointer-events-none absolute right-3 top-3 h-4 w-4 text-brand-muted transition-transform duration-200 ${
          aberto ? "rotate-180" : ""
        }`}
      />

      {aberto && (
        <div className="absolute left-0 right-0 top-11 z-30 min-w-[16rem] rounded-md border border-slate-700 bg-brand-surface shadow-lg">
          <div className="border-b border-slate-800 p-2">
            <input
              type="text"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar..."
              aria-label={`Buscar em ${label}`}
              autoFocus
              className="h-8 w-full rounded border border-slate-800 bg-brand-navy px-2 text-sm text-white outline-none placeholder:text-brand-muted focus:border-brand-green"
            />
          </div>
          <div role="listbox" aria-multiselectable="true" aria-label={label} className="max-h-60 overflow-y-auto p-1">
            {visiveis.length === 0 ? (
              <p className="px-3 py-1.5 text-sm text-brand-muted">
                {options.length === 0 ? "Nenhuma opção." : "Nada encontrado."}
              </p>
            ) : (
              visiveis.map((opcao) => {
                const marcado = marcados.has(opcao.value);
                return (
                  <button
                    key={opcao.value}
                    type="button"
                    role="option"
                    aria-selected={marcado}
                    onClick={() => alternar(opcao.value)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-white transition-colors hover:bg-brand-green/10"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                        marcado ? "border-brand-green bg-brand-green text-sobre-verde" : "border-slate-600"
                      }`}
                    >
                      {marcado ? "✓" : ""}
                    </span>
                    <span className="truncate">{opcao.label}</span>
                  </button>
                );
              })
            )}
          </div>
          {marcados.size > 0 && (
            <div className="border-t border-slate-800 p-1">
              <button
                type="button"
                onClick={() => setMarcados(new Set())}
                className="w-full rounded px-2 py-1.5 text-left text-xs text-brand-muted transition-colors hover:text-white"
              >
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}

      {[...marcados].map((valor) => (
        <input key={valor} type="hidden" name={name} value={valor} />
      ))}
    </div>
  );
}
