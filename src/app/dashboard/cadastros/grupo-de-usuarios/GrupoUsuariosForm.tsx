"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import { salvarGrupoUsuarios, type EstadoDoFormulario, type ValoresDoGrupo } from "./actions";
import type { Opcao } from "./queries";

const LISTAGEM = "/dashboard/cadastros/grupo-de-usuarios";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

export function GrupoUsuariosForm({
  id,
  valoresIniciais,
  candidatos,
}: {
  /** Ausente na criacao; presente na edicao. */
  id?: number;
  valoresIniciais: ValoresDoGrupo;
  /** Ja vem indentado por hierarquia de chefia -- ver `getCandidatosAMembro`. */
  candidatos: Opcao[];
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(
    salvarGrupoUsuarios,
    {},
  );

  // Depois de uma recusa, o formulario volta com o que a pessoa tinha digitado,
  // e nao com o valor original do banco.
  const valores = estado.valores ?? valoresIniciais;

  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(valores.membros));
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
  // checkbox a `marcados.size === candidatos.length` fazia ela acender sozinha
  // sempre que a selecao manual coincidia com o total -- inclusive com um so
  // candidato na lista, bastava marcar ele.
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
    setMarcados(marcar ? new Set(candidatos.map((c) => c.value)) : new Set());
  }

  return (
    <form action={formAction} className="space-y-4 p-4">
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      {estado.erro && (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {estado.erro}
        </p>
      )}

      <div>
        <label htmlFor="nome" className={rotuloClasses}>
          Nome
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          placeholder="Digite o nome do Grupo de Usuários"
          defaultValue={valores.nome}
          aria-invalid={Boolean(estado.erro)}
          className={getInputClasses(Boolean(estado.erro))}
        />
      </div>

      <div>
        <label htmlFor="descricao" className={rotuloClasses}>
          Descrição
        </label>
        <textarea
          id="descricao"
          name="descricao"
          rows={3}
          defaultValue={valores.descricao}
          className={`${getInputClasses(false)} resize-y`}
        />
      </div>

      <div>
        <span className={rotuloClasses}>Usuários</span>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div
            ref={containerRef}
            className="min-w-0 flex-1 overflow-hidden rounded-md border border-slate-800 bg-brand-navy"
          >
            <div className={`relative ${aberto ? "border-b border-slate-800" : ""}`}>
              {/* Cada selecionado vira uma etiqueta removivel dentro da propria
                  caixa, como na referencia -- a selecao fica visivel sem
                  precisar abrir a lista, e o "x" tira da selecao sem precisar
                  achar a linha de novo la embaixo. */}
              <div className="flex flex-wrap items-center gap-1.5 py-2 pl-3 pr-9">
                {candidatos
                  .filter((candidato) => marcados.has(candidato.value))
                  .map((candidato) => (
                    <span
                      key={candidato.value}
                      className="inline-flex max-w-full items-center gap-1 rounded border border-slate-700 bg-brand-surface px-1.5 py-0.5 text-xs text-white"
                    >
                      <button
                        type="button"
                        onClick={() => alternar(candidato.value)}
                        aria-label={`Remover ${candidato.label}`}
                        className="text-brand-muted hover:text-red-400"
                      >
                        ×
                      </button>
                      <span className="truncate">{candidato.label}</span>
                    </span>
                  ))}

                <input
                  type="text"
                  value={busca}
                  onChange={(evento) => setBusca(evento.target.value)}
                  onFocus={() => setAberto(true)}
                  placeholder={marcados.size === 0 ? "Buscar usuário..." : ""}
                  aria-label="Buscar usuário"
                  className="min-w-[80px] flex-1 bg-transparent py-0.5 text-white outline-none placeholder:text-brand-muted"
                />
              </div>

              <button
                type="button"
                onClick={() => setAberto((atual) => !atual)}
                aria-label={aberto ? "Fechar lista de usuários" : "Abrir lista de usuários"}
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
                {candidatos.length === 0 ? (
                  <p className="px-3 py-1.5 text-sm text-brand-muted">Nenhum usuário cadastrado ainda.</p>
                ) : (
                  candidatos
                    .filter((candidato) => candidato.label.toLowerCase().includes(termo))
                    .map((candidato) => {
                      const selecionado = marcados.has(candidato.value);
                      return (
                        <button
                          key={candidato.value}
                          type="button"
                          role="option"
                          aria-selected={selecionado}
                          onClick={() => alternar(candidato.value)}
                          className={`block w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${
                            selecionado
                              ? "bg-white/5 text-brand-muted"
                              : "text-white hover:bg-brand-green/10"
                          }`}
                        >
                          {candidato.label}
                        </button>
                      );
                    })
                )}
              </div>
            )}

            {/* Checkboxes escondidos: carregam a selecao no FormData no lugar dos
                botoes do listbox, que so existem para a interacao visual do
                combobox e nao existem no DOM enquanto a lista esta fechada. */}
            {candidatos.map((candidato) => (
              <input
                key={candidato.value}
                type="checkbox"
                name="membros"
                value={candidato.value}
                checked={marcados.has(candidato.value)}
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
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar"}
        </Button>
        <Button href={LISTAGEM} variant="secondary">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
