"use client";

import { RefObject, useEffect, useRef } from "react";

/**
 * Fecha popovers ao clicar fora do container -- mesmo padrao usado por
 * FilterDatePicker, FilterTimePicker e FilterMonthPicker, extraido daqui em
 * vez de triplicado.
 *
 * A callback vai numa ref (nao nas deps do efeito) para o listener so ser
 * reinscrito quando `ativo` muda, nao a cada render -- do jeito que o
 * `useEffect` original (com deps `[aberto]`) ja se comportava.
 */
export function useClickOutside(
  containerRef: RefObject<HTMLElement | null>,
  ativo: boolean,
  aoClicarFora: () => void,
) {
  const callbackRef = useRef(aoClicarFora);

  // Sem deps: roda a cada render, mas depois do commit -- diferente de
  // atribuir a ref direto no corpo do componente, que o eslint-plugin-react-
  // hooks recusa (ref e valor de efeito colateral, nao de render).
  useEffect(() => {
    callbackRef.current = aoClicarFora;
  });

  useEffect(() => {
    if (!ativo) return;

    function ouvinte(evento: MouseEvent) {
      if (!containerRef.current?.contains(evento.target as Node)) callbackRef.current();
    }

    document.addEventListener("mousedown", ouvinte);
    return () => document.removeEventListener("mousedown", ouvinte);
  }, [ativo, containerRef]);
}
