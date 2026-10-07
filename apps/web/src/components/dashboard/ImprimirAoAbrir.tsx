"use client";

import { useEffect } from "react";

/** Quanto esperar por imagem lenta antes de imprimir assim mesmo. */
const ESPERA_MAXIMA_MS = 15_000;

/**
 * Dispara o dialogo de impressao do navegador assim que a tela de exportar
 * em PDF monta. "Exportar para PDF" nesta aplicacao e imprimir/salvar como
 * PDF: mais simples e sem dependencia nova do que gerar o PDF no servidor, e
 * o resultado (o proprio dialogo de impressao do navegador) ja deixa
 * "Salvar como PDF" como opcao em qualquer navegador atual.
 *
 * `esperarImagens`: o PDF Unificado traz fotos e assinaturas, e o dialogo
 * aberto antes delas chegarem imprime caixas vazias. Espera cada `<img>` da
 * pagina carregar ou falhar, com um teto, para nunca deixar a pagina sem
 * dialogo por causa de uma foto que nao responde.
 *
 * "use client": window.print() so existe no navegador.
 */
export function ImprimirAoAbrir({ esperarImagens = false }: { esperarImagens?: boolean }) {
  useEffect(() => {
    if (!esperarImagens) {
      window.print();
      return;
    }

    let cancelado = false;
    const pendentes = Array.from(document.images)
      .filter((imagem) => !imagem.complete)
      .map(
        (imagem) =>
          new Promise<void>((pronta) => {
            imagem.addEventListener("load", () => pronta(), { once: true });
            imagem.addEventListener("error", () => pronta(), { once: true });
          }),
      );
    const teto = new Promise<void>((pronta) => setTimeout(pronta, ESPERA_MAXIMA_MS));

    void Promise.race([Promise.all(pendentes), teto]).then(() => {
      if (!cancelado) window.print();
    });

    return () => {
      cancelado = true;
    };
  }, [esperarImagens]);

  return null;
}
