"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { HeroPanel } from "@/components/HeroPanel";
import { EMAIL_REGEX, FormField } from "@/components/FormField";
import { createClient } from "@/lib/supabase/client";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const emailError =
      trimmedEmail === ""
        ? "Campo obrigatório"
        : EMAIL_REGEX.test(trimmedEmail)
          ? ""
          : "E-mail inválido";

    if (emailError) {
      setError(emailError);
      return;
    }

    setError("");
    setLoading(true);

    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/nova-senha`,
    });

    // A confirmacao é sempre a mesma, com ou sem erro: revelar se o e-mail
    // existe permitiria enumerar contas cadastradas.
    setLoading(false);
    setEmail("");
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <HeroPanel />

      <section className="flex min-h-screen w-full flex-col bg-neutral-100 lg:w-[25%] lg:min-w-[320px] lg:max-w-md">
        <div className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-10 lg:px-8 xl:px-10">
          <div className="mx-auto w-full max-w-xs">
            <h1 className="text-2xl font-bold text-slate-800">Esqueceu sua senha?</h1>

            {submitted ? (
              <p className="mt-2 text-sm text-slate-500">
                Se o e-mail informado estiver cadastrado, você receberá em breve as instruções para
                redefinir sua senha.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-500">
                  Por favor entre com seu e-mail no campo abaixo para receber uma nova senha.
                </p>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
                  <FormField
                    id="email"
                    label="Seu e-mail"
                    type="email"
                    autoComplete="email"
                    value={email}
                    error={error}
                    onChange={(value) => {
                      setEmail(value);
                      if (error) {
                        setError("");
                      }
                    }}
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-brand-orange py-3.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-brand-orange/30 transition-all hover:bg-orange-600 hover:shadow-brand-orange/40 focus:outline-none focus:ring-4 focus:ring-brand-orange/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Enviando..." : "Enviar"}
                  </button>
                </form>
              </>
            )}

            <div className="mt-4">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-orange-600"
              >
                <svg
                  aria-hidden="true"
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Voltar
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
