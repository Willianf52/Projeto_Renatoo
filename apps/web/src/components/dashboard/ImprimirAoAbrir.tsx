"use client";

import { useEffect } from "react";

/**
 * Dispara o dialogo de impressao do navegador assim que a tela de exportar
 * em PDF monta. "Exportar para PDF" nesta aplicacao e imprimir/salvar como
 * PDF: mais simples e sem dependencia nova do que gerar o PDF no servidor, e
 * o resultado (o proprio dialogo de impressao do navegador) ja deixa
 * "Salvar como PDF" como opcao em qualquer navegador atual.
 *
 * "use client": window.print() so existe no navegador.
 */
export function ImprimirAoAbrir() {
  useEffect(() => {
    window.print();
  }, []);

  return null;
}
