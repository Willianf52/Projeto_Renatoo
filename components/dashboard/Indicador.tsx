/**
 * Indicador numerico da faixa do topo do painel.
 *
 * Um numero solto nao vira grafico de uma barra: o valor e a visualizacao. As
 * cifras usam os algarismos proporcionais da fonte, e nao `tabular-nums` --
 * largura igual para todo digito faz um numero curto parecer frouxo em corpo
 * grande, e aqui nada precisa alinhar verticalmente com nada.
 */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  icone,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  icone: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-brand-surface p-4 shadow-sm transition-shadow duration-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">{rotulo}</p>
        <span className="shrink-0 text-brand-muted" aria-hidden="true">
          {icone}
        </span>
      </div>

      <p className="mt-2 text-3xl font-semibold text-white">{valor}</p>

      {detalhe && <p className="mt-1 text-xs text-brand-muted">{detalhe}</p>}
    </div>
  );
}
