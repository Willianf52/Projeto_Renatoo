import { Suspense } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { DataTable } from "@/components/dashboard/DataTable";
import { TabelaEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { ClipboardListIcon, TrashIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { excluirMeta } from "./actions";
import { MetaForm } from "./MetaForm";
import { getMetasDaSemana, getOpcoesDoFormulario } from "./queries";

/**
 * Cadastros > Metas de Visita (pedido do gestor, 0105): meta semanal por
 * pessoa e lugar, com o "1 de 4" da semana corrente. Quem administra
 * cadastros cadastra e ve todas; os demais veem so as proprias (RLS).
 */

const COLUNAS = ["Pessoa", "Lugar", "Meta da semana", "Feitas", "Situação", "Ações"];
const MIN_WIDTH = "min-w-[760px]";

function semanaNaTela(inicio: string | null): string {
  if (!inicio) return "";
  const [ano, mes, dia] = inicio.split("-").map(Number);
  const segunda = new Date(Date.UTC(ano, mes - 1, dia));
  const domingo = new Date(Date.UTC(ano, mes - 1, dia + 6));
  const f = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return `Semana de ${f.format(segunda)} a ${f.format(domingo)}`;
}

export default function MetasDeVisitaPage() {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Metas de Visita" }]} />
      </div>

      <Suspense fallback={null}>
        <Formulario />
      </Suspense>

      <div className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up" style={{ animationDelay: "80ms" }}>
        <Suspense fallback={<TabelaEsqueleto colunas={COLUNAS.length} minWidth={MIN_WIDTH} />}>
          <Tabela />
        </Suspense>
      </div>
    </div>
  );
}

async function Formulario() {
  if (!(await podeAdministrarCadastros())) return null;
  const { usuarios, sites } = await getOpcoesDoFormulario();
  return (
    <section className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up">
      <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Nova meta</h2>
      <MetaForm usuarios={usuarios} sites={sites} />
    </section>
  );
}

async function Tabela() {
  const [{ semanaInicio, linhas }, podeAdministrar] = await Promise.all([getMetasDaSemana(), podeAdministrarCadastros()]);

  const rows = linhas.map((m) => {
    const batida = m.feitas >= m.meta;
    return [
      m.usuarioNome,
      m.siteNome,
      `${m.meta} por semana`,
      `${m.feitas} de ${m.meta}`,
      !m.ativo ? (
        <span key="s" className="text-brand-muted">Inativa</span>
      ) : batida ? (
        <span key="s" className="text-brand-green">Meta batida</span>
      ) : (
        <span key="s" className="text-amber-400">
          {m.meta - m.feitas === 1 ? "Falta 1" : `Faltam ${m.meta - m.feitas}`}
        </span>
      ),
      podeAdministrar ? (
        <form key="a" action={excluirMeta}>
          <input type="hidden" name="id" value={m.id} />
          <button
            type="submit"
            title={`Excluir a meta de ${m.usuarioNome} em ${m.siteNome}`}
            aria-label={`Excluir a meta de ${m.usuarioNome} em ${m.siteNome}`}
            className="rounded-md border border-slate-700 p-1.5 text-slate-300 transition-colors hover:border-red-500 hover:bg-red-500/10 hover:text-red-400"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </form>
      ) : (
        ""
      ),
    ];
  });

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
          <ClipboardListIcon className="h-4 w-4" />
          Metas de Visita
        </h1>
        <span className="text-xs text-brand-muted">{semanaNaTela(semanaInicio)}</span>
      </div>
      <DataTable
        columns={COLUNAS}
        rows={rows}
        page={1}
        totalPages={1}
        totalItems={rows.length}
        buildPageHref={() => "?"}
        minWidth={MIN_WIDTH}
        emptyTitle="Nenhuma meta cadastrada"
        emptyDescription={podeAdministrar ? "Cadastre a primeira meta no formulário acima." : "As metas são cadastradas pela gestão."}
      />
    </>
  );
}
