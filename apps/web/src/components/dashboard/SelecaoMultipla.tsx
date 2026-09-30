"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/dashboard/icons";

export type OpcaoDeSelecao = { value: string; label: string };

/**
 * Combobox de selecao multipla com busca, etiquetas removiveis e "Selecionar
 * Tudo".
 *
 * Nasceu dentro de `GrupoUsuariosForm` e saiu de la quando o cadastro de
 * modelos de checklist (migration 0061) precisou do mesmo controle para os
 * grupos de sites -- duas copias do mesmo combobox seriam dois lugares para o
 * mesmo bug de clique fora.
 *
 * Nao controla o formulario: a selecao vai no `FormData` por checkboxes
 * escondidos com o `name` recebido, um por opcao. A action le com
 * `formData.getAll(name)`, como fazia com os membros.
 */
export function SelecaoMultipla({
  name,
  opcoes,
  iniciais,
  rotuloDoItem,
  textoSemOpcoes,
}: {
  name: string;
  opcoes: OpcaoDeSelecao[];
  iniciais: string[];
  /** No singular e minusculo: "usuário", "grupo". Vai nos rotulos de acessibilidade. */
  rotuloDoItem: string;
  textoSemOpcoes: string;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(iniciais));
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();

  // Fechado por padrao, como qualquer combobox: a lista so aparece ao clicar
  // no campo ou na seta, e fecha ao clicar fora -- a seta antes era so um
  // icone decorativo, sem clique nenhum por tras, e por isso parecia travada.
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;

    function aoClicarFora(evento: MouseEvent) {
      if (!containerRef.current?.contains(evento.target as Node)) setAberto(false);
    }

    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  // Estado proprio, independente de `marcados`: e um botao de acao ("marque
  // todo mundo agora"), nao um indicador de "todos estao marcados". Ligar essa
  // checkbox a `marcados.size === opcoes.length` fazia ela acender sozinha
  // sempre que a selecao manual coincidia com o total -- inclusive com uma so
  // opcao na lista, bastava marcar ela.
  const [todosSelecionados, setTodosSelecionados] = useState(false);

  function alternar(value: string) {
    setTodosSelecionados(false);
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(value)) novo.delete(value);
      else novo.add(value);
      return novo;
    });
  }

  function selecionarTudo(marcar: boolean) {
    setTodosSelecionados(marcar);
    setMarcados(marcar ? new Set(opcoes.map((opcao) => opcao.value)) : new Set());
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div
        ref={containerRef}
        className="min-w-0 flex-1 overflow-hidden rounded-md border border-slate-800 bg-brand-navy"
      >
        <div className={`relative ${aberto ? "border-b border-slate-800" : ""}`}>
          {/* Cada selecionado vira uma etiqueta removivel dentro da propria
              caixa, como na referencia -- a selecao fica visivel sem precisar
              abrir a lista, e o "x" tira da selecao sem precisar achar a linha
              de novo la embaixo. */}
          <div className="flex flex-wrap items-center gap-1.5 py-2 pl-3 pr-9">
            {opcoes
              .filter((opcao) => marcados.has(opcao.value))
              .map((opcao) => (
                <span
                  key={opcao.value}
                  className="inline-flex max-w-full items-center gap-1 rounded border border-slate-700 bg-brand-surface px-1.5 py-0.5 text-xs text-white"
                >
                  <button
                    type="button"
                    onClick={() => alternar(opcao.value)}
                    aria-label={`Remover ${opcao.label}`}
                    className="text-brand-muted hover:text-red-400"
                  >
                    ×
                  </button>
                  <span className="truncate">{opcao.label}</span>
                </span>
              ))}

            <input
              type="text"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              onFocus={() => setAberto(true)}
              placeholder={marcados.size === 0 ? `Buscar ${rotuloDoItem}...` : ""}
              aria-label={`Buscar ${rotuloDoItem}`}
              className="min-w-[80px] flex-1 bg-transparent py-0.5 text-white outline-none placeholder:text-brand-muted"
            />
          </div>

          <button
            type="button"
            onClick={() => setAberto((atual) => !atual)}
            aria-label={aberto ? "Fechar lista" : "Abrir lista"}
            aria-expanded={aberto}
            className="absolute right-2 top-3 flex h-6 w-6 items-center justify-center rounded text-brand-muted transition-colors hover:bg-brand-surface hover:text-white"
          >
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform duration-200 ${aberto ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {aberto && (
          <div role="listbox" aria-multiselectable="true" className="max-h-52 overflow-y-auto p-1">
            {opcoes.length === 0 ? (
              <p className="px-3 py-1.5 text-sm text-brand-muted">{textoSemOpcoes}</p>
            ) : (
              opcoes
                .filter((opcao) => opcao.label.toLowerCase().includes(termo))
                .map((opcao) => {
                  const selecionado = marcados.has(opcao.value);
                  return (
                    <button
                      key={opcao.value}
                      type="button"
                      role="option"
                      aria-selected={selecionado}
                      onClick={() => alternar(opcao.value)}
                      className={`block w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${
                        selecionado ? "bg-white/5 text-brand-muted" : "text-white hover:bg-brand-green/10"
                      }`}
                    >
                      {opcao.label}
                    </button>
                  );
                })
            )}
          </div>
        )}

        {/* Checkboxes escondidos: carregam a selecao no FormData no lugar dos
            botoes do listbox, que so existem para a interacao visual do
            combobox e nao existem no DOM enquanto a lista esta fechada. */}
        {opcoes.map((opcao) => (
          <input
            key={opcao.value}
            type="checkbox"
            name={name}
            value={opcao.value}
            checked={marcados.has(opcao.value)}
            readOnly
            className="sr-only"
          />
        ))}
      </div>

      <label className="flex shrink-0 items-center gap-2 text-sm text-white sm:pt-2">
        <input
          type="checkbox"
          checked={todosSelecionados}
          onChange={(evento) => selecionarTudo(evento.target.checked)}
          className="h-4 w-4 rounded border-slate-700 bg-brand-navy accent-brand-green"
        />
        Selecionar Tudo
      </label>
    </div>
  );
}
