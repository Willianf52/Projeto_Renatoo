import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { PaginaDeFormularioEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { QrCodeIcon } from "@/components/dashboard/icons";
import { gerarQrCodeDataUrl } from "@/lib/qrcode";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { QrCodeForm } from "../../QrCodeForm";
import { getOpcoes, getQrCode } from "../../queries";

const LISTAGEM = "/dashboard/cadastros/qr-code";

/**
 * Pagina sem `async`: com Cache Components, o `await` no corpo (permissao e
 * consultas recortadas por RLS) travava a navegacao ate tudo voltar -- ver
 * `site-planta/novo/page.tsx`.
 */
export default function EditarQrCodePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PaginaDeFormularioEsqueleto largura="max-w-2xl" campos={4} />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNumerico = Number(id);

  // `/qr-code/abc/editar` casa com a rota; sem esta checagem viraria uma
  // consulta com NaN e um erro do Postgres em vez de um 404.
  if (!Number.isInteger(idNumerico)) notFound();

  if (!(await podeAdministrarCadastros())) {
    redirect(LISTAGEM);
  }

  const [qrCode, opcoes] = await Promise.all([getQrCode(idNumerico), getOpcoes()]);
  if (!qrCode) notFound();

  const qrDataUrl = await gerarQrCodeDataUrl(qrCode.codigo);

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Cadastros" }, { label: "QR-Code" }, { label: qrCode.codigo }]}
        />
      </div>

      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <QrCodeIcon className="h-4 w-4" />
            Editar QR-Code
          </h1>
          {/* Confirmacao visual de que o codigo cadastrado gera um QR legivel --
              a etiqueta em si sai pelo botao "Imprimir Etiquetas" da listagem. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerada no servidor, next/image não ajuda aqui */}
          <img
            src={qrDataUrl}
            alt={`QR-Code ${qrCode.codigo}`}
            className="h-16 w-16 rounded bg-white p-1"
          />
        </div>

        <QrCodeForm
          id={qrCode.id}
          sites={opcoes.sites}
          valoresIniciais={{
            codigo: qrCode.codigo,
            // O select trabalha com string; o banco devolve number.
            siteId: String(qrCode.site_id),
            finalidade: qrCode.finalidade ?? "",
            ativo: qrCode.ativo,
          }}
        />
      </div>
    </div>
  );
}
