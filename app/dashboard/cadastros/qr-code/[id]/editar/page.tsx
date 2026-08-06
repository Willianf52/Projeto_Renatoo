import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { QrCodeIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { QrCodeForm } from "../../QrCodeForm";
import { getOpcoes, getQrCode } from "../../queries";

const LISTAGEM = "/dashboard/cadastros/qr-code";

export default async function EditarQrCodePage({ params }: { params: Promise<{ id: string }> }) {
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
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <QrCodeIcon className="h-4 w-4" />
            Editar QR-Code
          </h1>
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
