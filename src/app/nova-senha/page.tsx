"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { HeroPanel } from "@/components/HeroPanel";
import { FormField } from "@/components/FormField";
import { PasswordRulesList } from "@/components/PasswordRules";
import { isPasswordValid } from "@/lib/password-policy";
import { createClient } from "@/lib/supabase/client";
import { verificarSenhaVazada } from "@/lib/verificar-senha-vazada";

export default function NovaSenhaPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState({ password: "", confirmation: "" });
  const [formError, setFormError] = useState("");
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

    if (await verificarSenhaVazada(password)) {
      setLoading(false);
      setFormError("Esta senha apareceu em vazamentos de dados conhecidos. Escolha outra.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setLoading(false);
      setFormError(
        "Não foi possível redefinir a senha. O link pode ter expirado — solicite um novo.",
      );
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <HeroPanel />

      <section className="flex min-h-screen w-full flex-col border-l border-slate-800 bg-brand-surface lg:w-[25%] lg:min-w-[320px] lg:max-w-md">
        <div className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-10 lg:px-8 xl:px-10">
          <div className="mx-auto w-full max-w-xs">
            <h1 className="text-2xl font-bold text-white">Definir nova senha</h1>
            <p className="mt-2 text-sm text-brand-muted">
              Escolha uma nova senha para acessar sua conta.
            </p>

            <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
              <div>
                <FormField
                  id="password"
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
                  }}
                />
                <PasswordRulesList password={password} />
              </div>

              <FormField
                id="confirmation"
                label="Confirmar senha"
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
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                >
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-brand-green py-3.5 text-sm font-bold uppercase tracking-wider text-brand-navy shadow-lg shadow-brand-green/20 transition-all duration-200 hover:bg-brand-green-hover hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-green focus:ring-offset-2 focus:ring-offset-brand-surface active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
              >
                {loading ? "Salvando..." : "Salvar nova senha"}
              </button>
            </form>

            <div className="mt-4">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-brand-muted transition-colors hover:text-brand-green"
              >
                Voltar ao login
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
