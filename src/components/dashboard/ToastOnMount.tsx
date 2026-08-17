"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";

/**
 * Dispara um toast a partir de um parametro que sobrevive a um redirect de
 * Server Action (ex.: `redirect(\`\${LISTAGEM}?salvo=1\`)` depois de salvar).
 * A Server Action nao tem como chamar `useToast()` diretamente -- ela roda no
 * servidor, o toast e estado de cliente -- entao o sinal viaja pela propria
 * URL. Limpa o parametro depois de mostrar, senao um refresh repete o toast.
 */
export function ToastOnMount({
  message,
  variant,
  cleanHref,
}: {
  message: string;
  variant?: "success" | "error";
  /** URL sem o parametro de sinalizacao, para substituir no historico. */
  cleanHref: string;
}) {
  const { show } = useToast();
  const router = useRouter();
  const jaMostrou = useRef(false);

  useEffect(() => {
    // O Strict Mode do React (dev) monta, desmonta e monta de novo todo
    // efeito sem cleanup, de proposito -- sem este guard o toast apareceria
    // duas vezes a cada salvamento, so em desenvolvimento.
    if (jaMostrou.current) return;
    jaMostrou.current = true;

    show(message, variant);
    router.replace(cleanHref);
    // Roda so uma vez, no mount: refazer a cada render reabriria o toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
