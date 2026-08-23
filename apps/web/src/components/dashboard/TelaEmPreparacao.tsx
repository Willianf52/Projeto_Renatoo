import { Breadcrumbs } from "./Breadcrumbs";
import { ClipboardListIcon } from "./icons";

/**
 * Tela de um cadastro que ja existe na navegacao mas ainda nao tem
 * funcionalidade. Sem isto o item do menu levaria a um 404, que e pior: nao
 * distingue "ainda nao construido" de "link quebrado".
 */
export function TelaEmPreparacao({
  secao,
  titulo,
  descricao,
}: {
  secao: string;
  titulo: string;
  descricao: string;
}) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: secao }, { label: titulo }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="text-sm font-semibold text-white">{titulo}</h1>
        </div>

        <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center">
          <div className="rounded-full bg-brand-navy p-3 text-brand-muted">
            <ClipboardListIcon className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-white">Tela em preparação</p>
          <p className="text-sm text-brand-muted">{descricao}</p>
        </div>
      </div>
    </div>
  );
}
