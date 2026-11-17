import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { CarIcon } from "@/components/dashboard/icons";
import { idNaUrl } from "@/lib/id-na-url";
import { FormularioDeKm, FormularioDeManutencao } from "../RegistrosDoVeiculo";
import { getHistorico, getVeiculo, nomesDasPessoas } from "../queries";
import { formatarKm, placaNaTela, rotuloDoTipo, situacaoDaRevisao } from "../regras";

/**
 * A pagina do veiculo: situacao da revisao, os formularios de km e de
 * manutencao (qualquer pessoa da UP registra, pelo RLS da 0104) e o historico.
 * O link do aviso dos 9.000 km traz para ca.
 */

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** "aaaa-mm-dd" (coluna date) como "dd/mm/aaaa", sem passar por fuso. */
function dataNaTela(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

const COR_DO_TOM = {
  "em-dia": "border-brand-green/40 bg-brand-green/10 text-brand-green",
  perto: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  vencida: "border-red-500/40 bg-red-500/10 text-red-300",
} as const;

export default function VeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-4xl" campos={6} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const id = idNaUrl((await params).id);
  if (id === null) notFound();

  const [veiculo, historico] = await Promise.all([getVeiculo(id), getHistorico(id)]);
  if (!veiculo) notFound();

  const nomes = await nomesDasPessoas([
    veiculo.usuario_id,
    ...historico.km.map((k) => k.registrado_por),
    ...historico.manutencoes.map((m) => m.registrado_por),
  ]);
  const situacao = situacaoDaRevisao(veiculo.km_atual, veiculo.km_ultima_revisao);
  const placa = placaNaTela(veiculo.placa);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Veículos", href: "/dashboard/cadastros/veiculos" }, { label: placa }]} />
      </div>

      <section className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up">
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <CarIcon className="h-4 w-4" />
            {placa} · {veiculo.modelo}
          </h1>
        </div>
        <dl className="grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Usuário</dt>
            <dd className="text-white">{veiculo.usuario_id ? nomes.get(veiculo.usuario_id) : ""}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Km atual</dt>
            <dd className="text-white">{formatarKm(veiculo.km_atual)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Última revisão</dt>
            <dd className="text-white">{formatarKm(veiculo.km_ultima_revisao)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">Empresa</dt>
            <dd className="text-white">{veiculo.empresa}</dd>
          </div>
        </dl>
        {veiculo.ativo ? (
          <p className={`mx-4 mb-4 rounded-md border px-3 py-2 text-sm ${COR_DO_TOM[situacao.tom]}`}>
            {situacao.rotulo}. A revisão é a cada 10.000 km e o aviso sai aos 9.000.
          </p>
        ) : (
          <p className="mx-4 mb-4 text-sm text-brand-muted">Veículo inativo: não gera aviso de revisão.</p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-lg bg-brand-surface shadow-sm">
          <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Registrar km</h2>
          <FormularioDeKm veiculoId={veiculo.id} />
        </section>
        <section className="overflow-hidden rounded-lg bg-brand-surface shadow-sm">
          <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Registrar manutenção</h2>
          <FormularioDeManutencao veiculoId={veiculo.id} />
        </section>
      </div>

      <section className="overflow-hidden rounded-lg bg-brand-surface shadow-sm">
        <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Histórico de manutenção</h2>
        {historico.manutencoes.length === 0 ? (
          <p className="px-4 py-6 text-sm text-brand-muted">Nenhuma manutenção registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-brand-muted">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Km</th>
                  <th className="px-4 py-2">O que foi feito</th>
                  <th className="px-4 py-2">Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {historico.manutencoes.map((m) => (
                  <tr key={m.id} className="border-t border-slate-800/60 text-white">
                    <td className="px-4 py-2">{dataNaTela(m.data)}</td>
                    <td className="px-4 py-2">{rotuloDoTipo(m.tipo)}</td>
                    <td className="px-4 py-2">{m.km === null ? "" : formatarKm(m.km)}</td>
                    <td className="px-4 py-2">{m.descricao}</td>
                    <td className="px-4 py-2">{nomes.get(m.registrado_por) ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg bg-brand-surface shadow-sm">
        <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Histórico de km</h2>
        {historico.km.length === 0 ? (
          <p className="px-4 py-6 text-sm text-brand-muted">Nenhum km registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-brand-muted">
                <tr>
                  <th className="px-4 py-2">Quando</th>
                  <th className="px-4 py-2">Km</th>
                  <th className="px-4 py-2">Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {historico.km.map((k) => (
                  <tr key={k.id} className="border-t border-slate-800/60 text-white">
                    <td className="px-4 py-2">{dataHora.format(new Date(k.registrado_em))}</td>
                    <td className="px-4 py-2">{formatarKm(k.km)}</td>
                    <td className="px-4 py-2">{nomes.get(k.registrado_por) ?? ""}</td>
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
