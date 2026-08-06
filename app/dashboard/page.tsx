import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { GraficoDeMetas } from "@/components/dashboard/GraficoDeMetas";
import { Indicador } from "@/components/dashboard/Indicador";
import {
  BuildingIcon,
  ClipboardListIcon,
  QrCodeIcon,
  SearchIcon,
} from "@/components/dashboard/icons";
import {
  getMetasDoMes,
  getResumoDoMes,
  getTotaisDeCadastro,
  rotuloDoMes,
  totalizarMetas,
} from "./queries";

const numero = (valor: number) => new Intl.NumberFormat("pt-BR").format(valor);

export default async function DashboardPage() {
  const [resumo, metas, cadastros] = await Promise.all([
    getResumoDoMes(),
    getMetasDoMes(),
    getTotaisDeCadastro(),
  ]);

  const totais = totalizarMetas(metas);
  const mes = rotuloDoMes();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Painel" }]} />
      </div>

      {/* Faixa de indicadores. Um número solto não vira gráfico de uma barra:
          o valor é a visualização. */}
      <div
        className="grid grid-cols-1 gap-4 animate-fade-in-up sm:grid-cols-2 xl:grid-cols-4"
        style={{ animationDelay: "60ms" }}
      >
        <Indicador
          rotulo="Coletas no mês"
          valor={numero(resumo.leituras)}
          detalhe={mes}
          icone={<ClipboardListIcon className="h-5 w-5" />}
        />
        <Indicador
          rotulo="Visitas no mês"
          valor={numero(resumo.visitas)}
          detalhe={`Em ${numero(resumo.sitesVisitados)} ${resumo.sitesVisitados === 1 ? "site" : "sites"}`}
          icone={<SearchIcon className="h-5 w-5" />}
        />
        <Indicador
          rotulo="Cumprimento da meta"
          // `null` quando não há meta cadastrada: "0%" leria como "nada foi
          // feito", que é uma afirmação diferente de "não há meta".
          valor={totais.percentual === null ? "—" : `${totais.percentual}%`}
          detalhe={
            totais.percentual === null
              ? "Sem meta cadastrada para o mês"
              : `${numero(totais.realizadas)} de ${numero(totais.esperadas)} visitas`
          }
          icone={<BuildingIcon className="h-5 w-5" />}
        />
        <Indicador
          rotulo="Sites ativos"
          valor={numero(cadastros.sitesAtivos)}
          detalhe={`${numero(cadastros.qrCodesAtivos)} QR-Codes ativos`}
          icone={<QrCodeIcon className="h-5 w-5" />}
        />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "120ms" }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Visitas realizadas x meta, por site</h2>
          <p className="text-xs text-brand-muted">{mes} · piores primeiro</p>
        </div>

        <div className="p-4">
          {metas.length === 0 ? (
            /* Dois motivos levam a lista vazia, e a diferença importa: não há
               meta cadastrada, ou o nível de acesso não alcança
               `metas_visitas` (a policy da 0006 libera só para gestão). Sem
               esta distinção a tela parece quebrada nos dois casos. */
            <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-10 text-center">
              <p className="text-sm font-medium text-white">Nenhuma meta para {mes}</p>
              <p className="text-sm text-brand-muted">
                As metas ficam em <code>metas_visitas</code> e são visíveis apenas para os níveis
                Gestor e Supervisor.
              </p>
            </div>
          ) : (
            <GraficoDeMetas metas={metas} />
          )}
        </div>
      </div>
    </div>
  );
}
