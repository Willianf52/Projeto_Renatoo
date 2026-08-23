import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { QrCodeIcon } from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { QrCodeForm } from "../QrCodeForm";
import { getOpcoes } from "../queries";

const VALORES_VAZIOS = {
  codigo: "",
  siteId: "",
  finalidade: "",
  ativo: true,
};

export default async function NovoQrCodePage() {
  // O RLS ja recusaria o insert, mas seria depois de preencher o formulario
  // inteiro. Quem nao administra nem chega a ver a tela.
  if (!(await podeAdministrarCadastros())) {
    redirect("/dashboard/cadastros/qr-code");
  }

  const opcoes = await getOpcoes();

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "QR-Code" }, { label: "Novo" }]} />
      </div>

      <div
        className="max-w-2xl overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <QrCodeIcon className="h-4 w-4" />
            Novo QR-Code
          </h1>
        </div>

        <QrCodeForm valoresIniciais={VALORES_VAZIOS} sites={opcoes.sites} />
      </div>
    </div>
  );
}
