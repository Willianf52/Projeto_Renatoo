"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Texto formatado simples (negrito, italico e lista), como o editor da
 * Observacao do Site/Planta do sistema de referencia.
 *
 * O texto e gravado com marcas leves -- `**negrito**`, `_italico_` e linhas
 * comecando com `- ` para lista --, e nao HTML: a coluna continua texto, o
 * CSV continua legivel, e a tela monta os elementos sem `innerHTML` (nada do
 * que foi digitado vira marcacao executavel).
 */

/** Pura: quebra uma linha em pedacos com negrito/italico. */
export function pedacosDaLinha(linha: string): { texto: string; negrito: boolean; italico: boolean }[] {
  const pedacos: { texto: string; negrito: boolean; italico: boolean }[] = [];
  const padrao = /\*\*([^*]+)\*\*|_([^_]+)_/g;
  let ultimo = 0;
  for (const m of linha.matchAll(padrao)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) pedacos.push({ texto: linha.slice(ultimo, inicio), negrito: false, italico: false });
    if (m[1] !== undefined) pedacos.push({ texto: m[1], negrito: true, italico: false });
    else pedacos.push({ texto: m[2] ?? "", negrito: false, italico: true });
    ultimo = inicio + m[0].length;
  }
  if (ultimo < linha.length) pedacos.push({ texto: linha.slice(ultimo), negrito: false, italico: false });
  return pedacos;
}

function Linha({ texto }: { texto: string }) {
  return (
    <>
      {pedacosDaLinha(texto).map((p, i) =>
        p.negrito ? <strong key={i}>{p.texto}</strong> : p.italico ? <em key={i}>{p.texto}</em> : <span key={i}>{p.texto}</span>,
      )}
    </>
  );
}

/** Mostra o texto com a formatacao; linhas "- " seguidas viram uma lista. */
export function TextoFormatado({ texto }: { texto: string }) {
  const blocos: ReactNode[] = [];
  let lista: string[] = [];
  const fecharLista = () => {
    if (lista.length === 0) return;
    blocos.push(
      <ul key={`l${blocos.length}`} className="list-disc pl-5">
        {lista.map((item, i) => (
          <li key={i}>
            <Linha texto={item} />
          </li>
        ))}
      </ul>,
    );
    lista = [];
  };
  for (const linha of texto.split("\n")) {
    if (/^\s*-\s+/.test(linha)) {
      lista.push(linha.replace(/^\s*-\s+/, ""));
      continue;
    }
    fecharLista();
    blocos.push(
      <p key={`p${blocos.length}`} className="min-h-[1.25rem]">
        <Linha texto={linha} />
      </p>,
    );
  }
  fecharLista();
  return <div className="space-y-1 text-sm text-slate-200">{blocos}</div>;
}

/** O `textarea` com a barra Negrito / Italico / Lista e a pre-visualizacao. */
export function EditorDeTextoFormatado({
  id,
  name,
  defaultValue,
  className,
  rows = 4,
}: {
  id: string;
  name: string;
  defaultValue: string;
  className?: string;
  rows?: number;
}) {
  const campo = useRef<HTMLTextAreaElement>(null);
  const [valor, setValor] = useState(defaultValue);

  const envolver = (marca: string) => {
    const el = campo.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const escolhido = valor.slice(a, b) || "texto";
    const novo = `${valor.slice(0, a)}${marca}${escolhido}${marca}${valor.slice(b)}`;
    setValor(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + marca.length, a + marca.length + escolhido.length);
    });
  };

  const lista = () => {
    const el = campo.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const inicio = valor.lastIndexOf("\n", a - 1) + 1;
    const trecho = valor.slice(inicio, b);
    const comMarcas = trecho
      .split("\n")
      .map((l) => (/^\s*-\s+/.test(l) ? l : `- ${l}`))
      .join("\n");
    setValor(`${valor.slice(0, inicio)}${comMarcas}${valor.slice(b)}`);
    requestAnimationFrame(() => el.focus());
  };

  const botao = "rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-800";

  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="toolbar" aria-label="Formatação do texto">
        <button type="button" className={`${botao} font-bold`} onClick={() => envolver("**")} aria-label="Negrito">
          N
        </button>
        <button type="button" className={`${botao} italic`} onClick={() => envolver("_")} aria-label="Itálico">
          I
        </button>
        <button type="button" className={botao} onClick={lista} aria-label="Lista">
          Lista
        </button>
      </div>
      <textarea
        ref={campo}
        id={id}
        name={name}
        rows={rows}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className={className}
      />
      {/[*_]|^\s*-\s/m.test(valor) && (
        <div className="rounded-md border border-slate-800 px-3 py-2">
          <p className="mb-1 text-xs text-brand-muted">Pré-visualização</p>
          <TextoFormatado texto={valor} />
        </div>
      )}
    </div>
  );
}
