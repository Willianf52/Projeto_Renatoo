"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { PinIcon, SlidersIcon, XIcon } from "@/components/dashboard/icons";
import { TELAS_DO_MENU } from "@/components/dashboard/telas-do-menu";
import { alternarFixado, type AtalhoFixado } from "@/lib/atalhos";
import { salvarAtalhosFixados } from "./actions";

/** Busca sem diferenciar maiuscula nem acento: "usuarios" acha "Usuários". */
function normalizar(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * "Personalizar atalhos", como no sistema de referencia: todas as telas do
 * menu por secao, com busca, "Fixar", "Restaurar padrão" e "Concluir". Nada e
 * gravado antes do "Concluir" -- fechar no X descarta o que mudou.
 *
 * `<dialog>` nativo com `showModal`: o navegador cuida do foco preso, do Esc
 * e do fundo inerte.
 */
export function PersonalizarAtalhos({
  grade,
  fixados: fixadosSalvos,
}: {
  grade: string[];
  fixados: AtalhoFixado[];
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [fixados, setFixados] = useState<AtalhoFixado[]>(fixadosSalvos);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, iniciarSalvamento] = useTransition();

  const naGrade = useMemo(() => new Set(grade), [grade]);
  const secoes = useMemo(() => {
    const termo = normalizar(busca);
    const porSecao = new Map<string, typeof TELAS_DO_MENU>();
    for (const tela of TELAS_DO_MENU) {
      if (termo && !normalizar(tela.label).includes(termo)) continue;
      porSecao.set(tela.secao, [...(porSecao.get(tela.secao) ?? []), tela]);
    }
    return [...porSecao];
  }, [busca]);

  const cheio = fixados.length >= grade.length;

  function abrir() {
    setFixados(fixadosSalvos);
    setBusca("");
    setErro("");
    dialogo.current?.showModal();
  }

  function concluir() {
    iniciarSalvamento(async () => {
      const resultado = await salvarAtalhosFixados(fixados);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      dialogo.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-brand-navy px-3 py-2 text-sm font-medium text-white transition-colors hover:border-brand-green hover:text-brand-green"
      >
        <SlidersIcon className="h-4 w-4" />
        Personalizar
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby="titulo-personalizar"
        className="m-auto w-[calc(100%-2rem)] max-w-3xl rounded-lg border border-slate-800 bg-brand-surface p-0 text-white shadow-xl backdrop:bg-brand-navy/70"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 id="titulo-personalizar" className="text-sm font-semibold">
            Personalizar atalhos
          </h2>
          <button
            type="button"
            aria-label="Fechar sem salvar"
            onClick={() => dialogo.current?.close()}
            className="rounded-md p-1 text-brand-muted hover:bg-slate-800 hover:text-white"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-5 pt-4">
          <p className="text-xs text-brand-muted">
            Fixar um atalho o mantém na posição escolhida. Atalhos não fixados são reordenados
            automaticamente todo mês, conforme o seu uso.
          </p>
          <input
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar atalho..."
            aria-label="Buscar atalho"
            className="w-full rounded-lg border border-slate-700 bg-brand-navy px-4 py-2.5 text-sm text-white placeholder:text-brand-muted focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/30"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-5 py-3">
          {secoes.length === 0 ? (
            <p className="py-6 text-center text-sm text-brand-muted">Nenhum atalho encontrado.</p>
          ) : (
            secoes.map(([secao, telas]) => (
              <section key={secao} className="mb-3">
                <h3 className="border-b border-slate-800 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
                  {secao}
                </h3>
                <ul className="divide-y divide-slate-800/70">
                  {telas.map((tela) => {
                    const fixado = fixados.some((a) => a.rota === tela.href);
                    const Icone = tela.icon;
                    return (
                      <li key={tela.href} className="flex items-center gap-3 py-2">
                        <Icone className="h-4 w-4 shrink-0 text-brand-green" />
                        <span className="min-w-0 flex-1 text-sm">{tela.label}</span>
                        {naGrade.has(tela.href) && (
                          <span className="text-xs text-brand-muted">no grid</span>
                        )}
                        <button
                          type="button"
                          aria-pressed={fixado}
                          disabled={!fixado && cheio}
                          title={!fixado && cheio ? "Os 12 atalhos já estão fixados" : undefined}
                          onClick={() => setFixados((atuais) => alternarFixado(atuais, grade, tela.href))}
                          className={`inline-flex w-24 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            fixado
                              ? "bg-brand-green text-brand-navy hover:bg-brand-green-hover"
                              : "border border-slate-700 text-slate-300 hover:border-brand-green hover:text-brand-green"
                          }`}
                        >
                          <PinIcon className="h-3.5 w-3.5" />
                          {fixado ? "Fixado" : "Fixar"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        {erro && (
          <p role="alert" className="mx-5 mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {erro}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={() => setFixados([])}
            disabled={salvando}
            className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-50"
          >
            Restaurar padrão
          </button>
          <button
            type="button"
            onClick={concluir}
            disabled={salvando}
            className="rounded-md bg-brand-green px-4 py-2 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-green-hover disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Concluir"}
          </button>
        </div>
      </dialog>
    </>
  );
}
