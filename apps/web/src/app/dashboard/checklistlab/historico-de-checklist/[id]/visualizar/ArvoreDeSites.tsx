"use client";

import { useEffect, useRef } from "react";
import { FolderIcon } from "@/components/dashboard/icons";
import type { NoDaArvore } from "../../queries";

/**
 * A arvore de sites do cartao "Site", so leitura, com o site do checklist
 * destacado -- como no "Visualizar" do sistema de referencia. Client so pelo
 * `scrollIntoView`: com centenas de sites, o destacado ficaria fora da caixa.
 */
export function ArvoreDeSites({ raizes, selecionado }: { raizes: NoDaArvore[]; selecionado: number | null }) {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const alvo = caixa.current?.querySelector<HTMLElement>("[data-selecionado='true']");
    if (alvo && caixa.current) {
      caixa.current.scrollTop = alvo.offsetTop - caixa.current.offsetTop - 8;
    }
  }, [selecionado]);

  return (
    <div
      ref={caixa}
      className="relative max-h-96 overflow-auto rounded-md border border-slate-800 bg-brand-navy p-2 text-sm"
    >
      <Nos nos={raizes} selecionado={selecionado} nivel={0} />
    </div>
  );
}

function Nos({ nos, selecionado, nivel }: { nos: NoDaArvore[]; selecionado: number | null; nivel: number }) {
  return (
    <ul aria-label={nivel === 0 ? "Sites" : undefined}>
      {nos.map((no) => {
        const marcado = no.id === selecionado;
        return (
          <li key={no.id} aria-current={marcado ? "true" : undefined}>
            <div
              data-selecionado={marcado ? "true" : undefined}
              style={{ paddingLeft: `${nivel * 1.25}rem` }}
              className={`flex items-center gap-2 whitespace-nowrap rounded px-1.5 py-0.5 ${
                marcado ? "border border-sky-200/40 text-sky-200" : "text-brand-muted"
              }`}
            >
              <FolderIcon className="h-4 w-4 shrink-0" />
              <span>{no.nome}</span>
            </div>
            {no.filhos.length > 0 && <Nos nos={no.filhos} selecionado={selecionado} nivel={nivel + 1} />}
          </li>
        );
      })}
    </ul>
  );
}
