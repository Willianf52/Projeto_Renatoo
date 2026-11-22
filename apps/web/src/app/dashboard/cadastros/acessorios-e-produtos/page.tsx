import { Suspense } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { TabelaEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { ClipboardListIcon, FilterIcon, TrashIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { excluirItem } from "../maquinas/actions";
import { FormularioDeItem } from "../maquinas/Formularios";
import { getItensDoSite, getSitesParaSelecao } from "../maquinas/queries";
import { rotuloDoItem } from "../maquinas/regras";

/**
 * Cadastros > Acessorios e Produtos (pedido do gestor, 0111): a lista de cada
 * site, com tipo, nome, quantidade e observacao. Escolhe-se o site no filtro;
 * quem administra cadastros adiciona e exclui, os demais so leem.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function siteEscolhido(valor: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(valor) ? valor[0] : valor);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export default function AcessoriosEProdutosPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Acessórios e Produtos" }]} />
      </div>
      <div className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up" style={{ animationDelay: "80ms" }}>
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Acessórios e Produtos
          </h1>
        </div>
        <Suspense fallback={<TabelaEsqueleto colunas={5} minWidth="min-w-[700px]" />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const siteId = siteEscolhido(params.site);
  const [sites, podeAdministrar, itens] = await Promise.all([
    getSitesParaSelecao(),
    podeAdministrarCadastros(),
    siteId ? getItensDoSite(siteId) : Promise.resolve([]),
  ]);

  return (
    <>
      <form method="get" className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end">
        <div className="w-full xl:w-96">
          <FilterSelect label="Site" name="site" placeholder="Escolha o site" defaultValue={siteId ? String(siteId) : undefined} options={sites} />
        </div>
        <Button type="submit" className="group shrink-0 xl:w-52">
          <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
          Ver lista
        </Button>
      </form>

      {!siteId ? (
        <p className="px-4 py-8 text-center text-sm text-brand-muted">Escolha um site para ver a lista de acessórios e produtos.</p>
      ) : (
        <>
          {podeAdministrar ? (
            <div className="border-b border-slate-800">
              <FormularioDeItem siteId={siteId} />
            </div>
          ) : null}
          {itens.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-brand-muted">Nenhum acessório ou produto cadastrado neste site.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-brand-muted">
                  <tr>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Nome</th>
                    <th className="px-4 py-2">Quantidade</th>
                    <th className="px-4 py-2">Observação</th>
                    {podeAdministrar ? <th className="px-4 py-2">Ações</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.id} className="border-t border-slate-800/60 text-white">
                      <td className="px-4 py-2">{rotuloDoItem(i.tipo)}</td>
                      <td className="px-4 py-2">{i.nome}</td>
                      <td className="px-4 py-2 tabular-nums">{i.quantidade}</td>
                      <td className="px-4 py-2">{i.observacao}</td>
                      {podeAdministrar ? (
                        <td className="px-4 py-2">
                          <form action={excluirItem}>
                            <input type="hidden" name="id" value={i.id} />
                            <button
                              type="submit"
                              title={`Excluir ${i.nome}`}
                              aria-label={`Excluir ${i.nome}`}
                              className="rounded-md border border-slate-700 p-1.5 text-slate-300 transition-colors hover:border-red-500 hover:bg-red-500/10 hover:text-red-400"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
