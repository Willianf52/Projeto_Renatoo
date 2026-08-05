"use client";

import { FormEvent, useState } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { FormField } from "@/components/FormField";
import { PasswordRulesList } from "@/components/PasswordRules";
import { isPasswordValid } from "@/lib/password-policy";
import { Spinner } from "@/components/Spinner";
import { createClient } from "@/lib/supabase/client";

export default function TrocarSenhaPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState({
    currentPassword: "",
    password: "",
    confirmation: "",
  });
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const currentPasswordError = currentPassword === "" ? "Campo obrigatório" : "";
    const passwordError =
      password === ""
        ? "Campo obrigatório"
        : isPasswordValid(password)
          ? ""
          : "A senha não atende aos requisitos";
    const confirmationError =
      confirmation === ""
        ? "Campo obrigatório"
        : confirmation !== password
          ? "As senhas não coincidem"
          : "";

    if (currentPasswordError || passwordError || confirmationError) {
      setErrors({
        currentPassword: currentPasswordError,
        password: passwordError,
        confirmation: confirmationError,
      });
      return;
    }

    setErrors({ currentPassword: "", password: "", confirmation: "" });
    setFormError("");
    setLoading(true);

    const supabase = createClient();

    /**
     * A senha atual vai junto para que a troca exija conhecer a antiga. Sem
     * isso, quem chega a uma sessao aberta -- notebook destravado, cookie
     * roubado -- troca a senha sem saber a atual e tranca o dono para fora.
     *
     * Quem confere e o GoTrue, nao esta tela: a validacao daqui so evita uma
     * ida ao servidor com campo vazio. A checagem de verdade depende de
     * "Require current password when updating" estar ligado em Authentication
     * > Sign In / Providers > Email. Com a opcao desligada o campo e coletado
     * e enviado, mas o servidor ignora -- por isso este codigo vai primeiro e
     * a opcao e ligada depois, sem janela em que a tela quebra.
     *
     * O fluxo de recuperacao (/nova-senha) nao manda `current_password` de
     * proposito: quem esqueceu a senha nao a conhece. O GoTrue trata esse caso
     * checando `!session.IsRecovery()` antes de exigir a senha atual, entao a
     * recuperacao continua funcionando com a opcao ligada.
     */
    const { error } = await supabase.auth.updateUser({
      current_password: currentPassword,
      password,
    });

    setLoading(false);

    if (error) {
      const mensagem = error.message.toLowerCase();
      // Casado pelo `code`, nao pela mensagem: o texto do GoTrue muda entre
      // versoes, o codigo nao. A mensagem fica como rede de seguranca.
      const codigo = "code" in error && typeof error.code === "string" ? error.code : "";
      const ehSenhaAtual =
        codigo.includes("current_password") || mensagem.includes("current password");

      if (ehSenhaAtual) {
        setErrors((prev) => ({ ...prev, currentPassword: "Senha atual incorreta" }));
        setFormError("A senha atual informada está incorreta.");
      } else if (mensagem.includes("should be different")) {
        setFormError("A nova senha precisa ser diferente da atual.");
      } else if (mensagem.includes("weak") || mensagem.includes("requirements")) {
        setFormError("A nova senha foi recusada por não atender aos requisitos.");
      } else {
        setFormError("Não foi possível alterar a senha. Tente novamente.");
      }
      return;
    }

    setCurrentPassword("");
    setPassword("");
    setConfirmation("");
    setSuccess(true);
  };

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Trocar Senha" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="text-sm font-semibold text-white">Trocar Senha</h1>
        </div>

        <div className="p-6">
          {success ? (
            <div
              role="status"
              className="max-w-xl rounded-lg border border-brand-green/40 bg-brand-green/10 px-4 py-3 text-sm text-brand-green animate-slide-down"
            >
              Senha alterada com sucesso. Ela já vale para os próximos acessos.
            </div>
          ) : (
            <form className="max-w-xl space-y-6" onSubmit={handleSubmit} noValidate>
              {/* Antes da nova senha, como em qualquer troca: a ordem espelha o
                  que se pede a pessoa -- prove quem voce e, depois escolha. */}
              <FormField
                id="senha-atual"
                label="Senha atual"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                error={errors.currentPassword}
                onChange={(value) => {
                  setCurrentPassword(value);
                  if (errors.currentPassword) {
                    setErrors((prev) => ({ ...prev, currentPassword: "" }));
                  }
                  if (formError) {
                    setFormError("");
                  }
                }}
              />

              <div>
                <FormField
                  id="nova-senha"
                  label="Nova senha"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  error={errors.password}
                  onChange={(value) => {
                    setPassword(value);
                    if (errors.password) {
                      setErrors((prev) => ({ ...prev, password: "" }));
                    }
                    if (formError) {
                      setFormError("");
                    }
                  }}
                />
                <PasswordRulesList password={password} />
              </div>

              <FormField
                id="confirmar-senha"
                label="Confirme a nova senha"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                error={errors.confirmation}
                onChange={(value) => {
                  setConfirmation(value);
                  if (errors.confirmation) {
                    setErrors((prev) => ({ ...prev, confirmation: "" }));
                  }
                }}
              />

              {formError && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 animate-slide-down"
                >
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-lg bg-brand-green px-6 py-3 text-sm font-bold uppercase tracking-wider text-brand-navy shadow-lg shadow-brand-green/30 transition-all duration-200 hover:bg-brand-green-hover hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-green active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
              >
                {loading && <Spinner />}
                {loading ? "Alterando..." : "Alterar Senha"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
