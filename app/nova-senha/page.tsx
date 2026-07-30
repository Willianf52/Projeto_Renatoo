"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { HeroPanel } from "@/components/HeroPanel";
import { FormField } from "@/components/FormField";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 6;

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
        : password.length < MIN_PASSWORD_LENGTH
          ? `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`
          : "";
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

      <section className="flex min-h-screen w-full flex-col bg-neutral-100 lg:w-[25%] lg:min-w-[320px] lg:max-w-md">
        <div className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-10 lg:px-8 xl:px-10">
          <div className="mx-auto w-full max-w-xs">
            <h1 className="text-2xl font-bold text-slate-800">Definir nova senha</h1>
            <p className="mt-2 text-sm text-slate-500">
              Escolha uma nova senha para acessar sua conta.
            </p>

            <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
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
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600"
                >
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-brand-orange py-3.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-brand-orange/30 transition-all hover:bg-orange-600 hover:shadow-brand-orange/40 focus:outline-none focus:ring-4 focus:ring-brand-orange/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Salvando..." : "Salvar nova senha"}
              </button>
            </form>

            <div className="mt-4">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-orange-600"
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
