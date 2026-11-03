import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { FORMATOS_DE_ETIQUETA } from "@/components/dashboard/FolhaDeEtiquetas";
import { QrCodeIcon } from "@/components/dashboard/icons";
import { SelecaoMultipla } from "@/components/dashboard/SelecaoMultipla";
import { Button } from "@/components/Button";
import { extrairFiltros, getQrCodesParaExportar, primeiro, type SearchParams } from "../../queries";

const LISTAGEM = "/dashboard/cadastros/qr-code";

/**
 * Antes de imprimir as etiquetas, como a caixa "Gerar PDF" do QR-Code no
 * sistema de referencia: o formato do papel (A3, A4, A4 com um QR por folha,
 * A5) e se o logo vai na etiqueta. As etiquetas sao as do filtro da tela, que
 * chegam aqui na URL e seguem como campos escondidos.
 *
 * Espera a contagem antes de renderizar, entao `instant = false` (ver
 * `historico-de-checklist/export/escolher-modelo/page.tsx`).
 */
export const instant = false;

export default async function OpcoesDeEtiquetaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { rows, truncado } = await getQrCodesParaExportar(extrairFiltros(params));
  const filtros = Object.entries(params)
    .map(([chave, valor]) => [chave, primeiro(valor)] as const)
    .filter(([chave, valor]) => valor && !["pagina", "salvo", "formato", "logo", "etiqueta_sites"].includes(chave));
  // Os sites das etiquetas do filtro, para escolher dentro da caixa, como no
  // antigo ("Selecione os QR-Codes que deseja..." com a lista de locais).
  const sitesDasEtiquetas = [
    ...new Map(rows.map((r) => [String(r.site_id), r.sites?.nome ?? `Site ${r.site_id}`])).entries(),
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[{ label: "Cadastros" }, { label: "QR-Code", href: LISTAGEM }, { label: "Imprimir Etiquetas" }]}
      />

      <form
        method="get"
        action={`${LISTAGEM}/export/etiquetas`}
        target="_blank"
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm"
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <QrCodeIcon className="h-4 w-4" />
            Imprimir Etiquetas
          </h1>
          <p className="mt-1 text-xs text-brand-muted">
            {rows.length} {rows.length === 1 ? "etiqueta" : "etiquetas"} no filtro da tela
            {truncado ? " (limitado ao teto de exportação)" : ""}. Para imprimir só alguns sites, volte e filtre
            a lista antes.
          </p>
        </div>

        {filtros.map(([chave, valor]) => (
          <input key={chave} type="hidden" name={chave} value={valor} />
        ))}

        <div className="space-y-5 p-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-white">Formato do papel</legend>
            <div className="flex flex-wrap gap-4">
              {FORMATOS_DE_ETIQUETA.map((formato) => (
                <label key={formato.value} className="flex items-center gap-2 text-sm text-white">
                  <input
                    type="radio"
                    name="formato"
                    value={formato.value}
                    defaultChecked={formato.value === "A4"}
                    className="h-4 w-4 accent-brand-green"
                  />
                  {formato.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <span className="mb-2 block text-sm font-medium text-white">Sites</span>
            <p className="mb-2 text-xs text-brand-muted">Nenhum marcado: todos os sites do filtro.</p>
            <SelecaoMultipla
              name="etiqueta_sites"
              opcoes={sitesDasEtiquetas}
              iniciais={[]}
              rotuloDoItem="site"
              textoSemOpcoes="Nenhum site no filtro."
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-white">
            <input type="checkbox" name="logo" value="1" className="h-4 w-4 accent-brand-green" />
            Exibir logo
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3">
          <Button href={LISTAGEM} variant="secondary">
            Voltar
          </Button>
          <Button type="submit" disabled={rows.length === 0}>
            Gerar PDF
          </Button>
        </div>
      </form>
    </div>
  );
}
