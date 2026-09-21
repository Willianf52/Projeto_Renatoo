import type { AvisoDePeriodo as Aviso } from "@/lib/relatorios";
import { SearchIcon } from "./icons";

/**
 * Corpo dos relatorios que exigem periodo, enquanto ele nao foi informado. O
 * texto vem de `avisoDePeriodo` (lib/relatorios.ts); aqui so a apresentacao.
 *
 * `role="alert"` so no destaque: a pagina e recarregada pelo GET do filtro, e
 * o leitor de tela precisa ouvir que faltou data. Na primeira abertura o
 * texto e orientacao e anunciar como alerta seria ruido.
 */
export function AvisoDePeriodo({ aviso }: { aviso: Aviso }) {
  return (
    <div
      role={aviso.destaque ? "alert" : undefined}
      className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center animate-fade-in-up"
    >
      <div
        className={`rounded-full p-3 ${aviso.destaque ? "bg-amber-500/10 text-amber-400" : "bg-brand-navy text-brand-muted"}`}
      >
        <SearchIcon className="h-6 w-6" />
      </div>
      <p className={`text-sm font-medium ${aviso.destaque ? "text-amber-400" : "text-white"}`}>{aviso.titulo}</p>
      <p className="text-sm text-brand-muted">{aviso.descricao}</p>
    </div>
  );
}
