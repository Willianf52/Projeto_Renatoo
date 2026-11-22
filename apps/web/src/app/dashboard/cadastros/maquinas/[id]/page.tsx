import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { SlidersIcon } from "@/components/dashboard/icons";
import { idNaUrl } from "@/lib/id-na-url";
import { FormularioDeManutencao } from "../Formularios";
import { getManutencoes, getMaquina, nomesDasPessoas, nomesDosSites } from "../queries";
import { dataNaTela, rotuloDaManutencao } from "../regras";

/**
 * A pagina da maquina: dados, o formulario de manutencao (qualquer pessoa que
 * enxergue o site, ate o CLIENTE; RLS da 0111) e o historico.
 */
export default function MaquinaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-4xl" campos={5} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const id = idNaUrl((await params).id);
  if (id === null) notFound();

  const [maquina, manutencoes] = await Promise.all([getMaquina(id), getManutencoes(id)]);
  if (!maquina) notFound();

  const [sites, pessoas] = await Promise.all([
    nomesDosSites([maquina.site_id]),
    nomesDasPessoas(manutencoes.map((m) => m.registrado_por)),
  ]);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Cadastros" }, { label: "Máquinas", href: "/dashboard/cadastros/maquinas" }, { label: maquina.modelo }]}
        />
      </div>

      <section className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up">
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <SlidersIcon className="h-4 w-4" />
            {maquina.modelo}
          </h1>
        </div>
        <dl className="grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Site</dt>
            <dd className="text-white">{sites.get(maquina.site_id)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Ativo (patrimônio)</dt>
            <dd className="text-white">{maquina.patrimonio}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Status</dt>
            <dd className="text-white">{maquina.ativo ? "Ativo" : "Inativo"}</dd>
          </div>
        </dl>
        {maquina.descricao ? <p className="px-4 pb-4 text-sm text-brand-muted">{maquina.descricao}</p> : null}
      </section>

      <section className="overflow-hidden rounded-lg bg-brand-surface shadow-sm">
        <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Registrar manutenção</h2>
        <FormularioDeManutencao maquinaId={maquina.id} />
      </section>

      <section className="overflow-hidden rounded-lg bg-brand-surface shadow-sm">
        <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Histórico de manutenção</h2>
        {manutencoes.length === 0 ? (
          <p className="px-4 py-6 text-sm text-brand-muted">Nenhuma manutenção registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-brand-muted">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">O que foi feito</th>
                  <th className="px-4 py-2">Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {manutencoes.map((m) => (
                  <tr key={m.id} className="border-t border-slate-800/60 text-white">
                    <td className="px-4 py-2">{dataNaTela(m.data)}</td>
                    <td className="px-4 py-2">{rotuloDaManutencao(m.tipo)}</td>
                    <td className="px-4 py-2">{m.descricao}</td>
                    <td className="px-4 py-2">{pessoas.get(m.registrado_por) ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
