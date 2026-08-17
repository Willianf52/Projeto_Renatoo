import Link from "next/link";
import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { FilterMonthPicker } from "@/components/dashboard/FilterMonthPicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ClipboardListIcon,
  ExcelIcon,
  FilterIcon,
  PdfIcon,
  SearchIcon,
} from "@/components/dashboard/icons";
import { extrairFiltros, formatarDuracao, getOpcoesFiltros, getRegistroDeRondas, primeiro, type SearchParams } from "./queries";

const PAGE_SIZE = 15;
const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);

export default async function RegistroDeRondasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);
  const pagina = Math.max(1, Number(primeiro(params.pagina)) || 1);

  const [opcoes, registro] = await Promise.all([getOpcoesFiltros(), getRegistroDeRondas(filtros)]);

  const totalItems = registro.linhas.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const linhasPagina = registro.linhas.slice((pagina - 1) * PAGE_SIZE, (pagina - 1) * PAGE_SIZE + PAGE_SIZE);

  const buildPageHref = (novaPagina: number) => {
    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      if (chave === "pagina") continue;
      const v = primeiro(valor);
      if (v) query.set(chave, v);
    }
    query.set("pagina", String(novaPagina));
    return `?${query.toString()}`;
  };

  // Mesmos filtros da tela, sem a paginacao -- exportar sempre traz o mes
  // inteiro, nao so a pagina de Locais visivel.
  const queryExportacao = (() => {
    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      if (chave === "pagina") continue;
      const v = primeiro(valor);
      if (v) query.set(chave, v);
    }
    const texto = query.toString();
    return texto ? `?${texto}` : "";
  })();

  const podeVoltar = pagina > 1;
  const podeAvancar = pagina < totalPages;

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[
            { label: "Inspeções" },
            { label: "Relatórios" },
            { label: "Registro das Rondas por Tempo de Permanência" },
          ]}
        />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Registro das Rondas por Tempo de Permanência
          </h1>
          <div className="flex items-center gap-2">
            <Acao
              titulo="Exportar para Excel"
              href={`/dashboard/inspecoes/relatorios/registro-de-rondas/export/excel${queryExportacao}`}
              className="bg-emerald-600/40"
              target="_blank"
            >
              <ExcelIcon className="h-4 w-4" />
            </Acao>
            <Acao
              titulo="Exportar para PDF"
              href={`/dashboard/inspecoes/relatorios/registro-de-rondas/export/pdf${queryExportacao}`}
              className="bg-red-600/40"
              target="_blank"
            >
              <PdfIcon className="h-4 w-4" />
            </Acao>
          </div>
        </div>

        {/* GET nativo, mesmo mecanismo das demais telas. Linha 1 com largura
            propria (Mes/Ano estreito, Coletor e Local flexiveis) e linhas 2/3
            em grade de 5, como na referencia -- Filtrar fica numa faixa cheia
            por baixo, e nao dentro da grade. */}
        <form method="get" className="space-y-3 border-b border-slate-800 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="w-full sm:w-40">
              <FilterMonthPicker label="Mês/Ano" name="mes" defaultValue={filtros.mes} />
            </div>
            <div className="min-w-0 flex-1">
              <FilterSelect
                label="Coletor de Dados"
                name="coletor_dados"
                defaultValue={filtros.coletorDados}
                options={opcoes.coletoresDados}
              />
            </div>
            <div className="min-w-0 flex-1">
              <FilterSelect label="Local" name="local" defaultValue={filtros.local} options={opcoes.locais} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterSelect
              label="Funcionário"
              name="funcionario"
              defaultValue={filtros.funcionario}
              options={opcoes.funcionarios}
            />
            <FilterSelect label="Área / Setor" name="area" defaultValue={filtros.area} options={opcoes.areas} />
            <FilterSelect label="Evento" name="evento" defaultValue={filtros.evento} options={opcoes.eventos} />
            <FilterSelect
              label="Qualificador"
              name="qualificador"
              defaultValue={filtros.qualificador}
              options={opcoes.qualificadores}
            />
            <FilterSelect
              label="Checkpoints"
              name="checkpoint"
              defaultValue={filtros.checkpoint}
              options={opcoes.checkpoints}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Sem tabela de checklists no schema -- campo fica visivel (igual
                a referencia) mas sem opcao nenhuma pra escolher. */}
            <FilterSelect label="Checklists" name="checklist" options={[]} />
            <FilterSelect
              label="Atividades"
              name="atividade"
              defaultValue={filtros.atividade}
              options={opcoes.atividades}
            />
            <FilterSelect
              label="Grupos Sites"
              name="grupo_site"
              defaultValue={filtros.grupoSite}
              options={opcoes.gruposSites}
            />
            <FilterSelect
              label="Grupos Usuários"
              name="grupo_usuario"
              defaultValue={filtros.grupoUsuario}
              options={opcoes.gruposUsuarios}
            />
            <FilterSelect label="Motivos" name="motivo" defaultValue={filtros.motivo} options={opcoes.motivos} />
          </div>

          <Button type="submit" className="group w-full">
            <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
            Filtrar
          </Button>
        </form>

        {registro.truncado && (
          <p className="border-b border-slate-800 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
            Mês com mais leituras do que o exibido — ajuste os filtros para reduzir o total. Os valores acima podem
            estar incompletos.
          </p>
        )}

        {linhasPagina.length === 0 ? (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center animate-fade-in-up">
            <div className="rounded-full bg-brand-navy p-3 text-brand-muted">
              <SearchIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-white">Nenhuma ronda encontrada</p>
            <p className="text-sm text-brand-muted">Ajuste o período ou os filtros acima para localizar registros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-b-lg">
            <table className="w-full min-w-[1600px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-brand-muted">
                  <th className="sticky left-0 z-10 bg-brand-surface px-3 py-2 font-semibold whitespace-nowrap">
                    Local
                  </th>
                  {DIAS.map((dia) => (
                    <th key={dia} className="px-2 py-2 text-center font-semibold">
                      {dia}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {linhasPagina.map((linha, indice) => (
                  <tr
                    key={linha.siteId}
                    className="border-b border-slate-800/60 animate-fade-in-up hover:bg-white/5"
                    style={{ animationDelay: `${Math.min(indice, 12) * 30}ms` }}
                  >
                    <td className="sticky left-0 z-10 bg-brand-surface px-3 py-2 font-medium whitespace-nowrap text-brand-green">
                      {linha.siteNome}
                    </td>
                    {linha.duracoesPorDia.map((duracoes, diaIndice) => (
                      <td key={diaIndice} className="px-2 py-2 text-center text-white">
                        {duracoes.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {duracoes.map((ms, i) => (
                              <span key={i} className="whitespace-nowrap">
                                {formatarDuracao(ms)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2 text-center font-semibold text-white">
                      {formatarDuracao(linha.totalMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-end gap-1 border-t border-slate-800 px-4 py-3">
              <PaginacaoBotao disabled={!podeVoltar} href={podeVoltar ? buildPageHref(1) : undefined} ariaLabel="Primeira página">
                <ChevronsLeftIcon className="h-4 w-4" />
              </PaginacaoBotao>
              <PaginacaoBotao
                disabled={!podeVoltar}
                href={podeVoltar ? buildPageHref(pagina - 1) : undefined}
                ariaLabel="Página anterior"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </PaginacaoBotao>
              <span className="px-3 text-xs text-brand-muted">
                Pág: {totalItems > 0 ? pagina : 0} de {totalPages} | Total: {totalItems} locais
              </span>
              <PaginacaoBotao
                disabled={!podeAvancar}
                href={podeAvancar ? buildPageHref(pagina + 1) : undefined}
                ariaLabel="Próxima página"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </PaginacaoBotao>
              <PaginacaoBotao
                disabled={!podeAvancar}
                href={podeAvancar ? buildPageHref(totalPages) : undefined}
                ariaLabel="Última página"
              >
                <ChevronsRightIcon className="h-4 w-4" />
              </PaginacaoBotao>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Mesmo visual dos botoes de paginacao da DataTable -- nao reaproveitado de
 * la porque a tabela aqui e uma grade propria (coluna Local fixa, 31 colunas
 * de dia), fora do formato columns/rows que a DataTable espera. */
function PaginacaoBotao({
  children,
  disabled,
  href,
  ariaLabel,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  href?: string;
  ariaLabel: string;
}) {
  const className =
    "flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-brand-muted transition-all duration-200 hover:bg-brand-navy hover:text-white active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100";

  if (!href || disabled) {
    return (
      <button type="button" disabled aria-label={ariaLabel} className={className}>
        {children}
      </button>
    );
  }

  return (
    <Link href={href} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  );
}
