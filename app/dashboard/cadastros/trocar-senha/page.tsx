"use client";

import { FormEvent, useState } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { FormField } from "@/components/FormField";
import { PasswordRulesList, isPasswordValid } from "@/components/PasswordRules";
import { Spinner } from "@/components/Spinner";
import { createClient } from "@/lib/supabase/client";

export default function TrocarSenhaPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState({ password: "", confirmation: "" });
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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

    if (passwordError || confirmationError) {
      setErrors({ password: passwordError, confirmation: confirmationError });
      return;
    }

    setErrors({ password: "", confirmation: "" });
    setFormError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setFormError(
        error.message.includes("should be different")
          ? "A nova senha precisa ser diferente da atual."
          : "Não foi possível alterar a senha. Tente novamente.",
      );
      return;
    }

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
        className="overflow-hidden rounded-lg bg-white shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="bg-brand-navy px-4 py-3">
          <h1 className="text-sm font-semibold text-white">Trocar Senha</h1>
        </div>

        <div className="p-6">
          {success ? (
            <div
              role="status"
              className="max-w-xl rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 animate-slide-down"
            >
              Senha alterada com sucesso. Ela já vale para os próximos acessos.
            </div>
          ) : (
            <form className="max-w-xl space-y-6" onSubmit={handleSubmit} noValidate>
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
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 animate-slide-down"
                >
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl bg-brand-orange px-6 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-brand-orange/30 transition-all duration-200 hover:bg-orange-600 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-brand-orange/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
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
