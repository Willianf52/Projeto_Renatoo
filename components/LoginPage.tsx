"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { BrandLogo, HeroPanel } from "./HeroPanel";
import { EMAIL_REGEX, FormField } from "./FormField";
import { Spinner } from "./Spinner";
import { createClient } from "@/lib/supabase/client";

type FieldErrors = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({
    email: "",
    password: "",
  });
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  // Erro vindo do /auth/callback quando o link do e-mail expirou ou ja foi usado.
  const linkError =
    searchParams.get("erro") === "link-invalido"
      ? "O link expirou ou já foi utilizado. Solicite um novo abaixo."
      : "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const emailError =
      trimmedEmail === ""
        ? "Campo obrigatório"
        : EMAIL_REGEX.test(trimmedEmail)
          ? ""
          : "E-mail inválido";
    const passwordError = password.trim() === "" ? "Campo obrigatório" : "";

    if (emailError || passwordError) {
      setErrors({ email: emailError, password: passwordError });
      return;
    }

    setErrors({ email: "", password: "" });
    setFormError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      setLoading(false);
      setFormError(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : "Não foi possível entrar. Tente novamente.",
      );
      return;
    }

    const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";
    router.replace(redirectTo);
    router.refresh();
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <HeroPanel />

      {/* Sidebar de login */}
      <section className="flex min-h-screen w-full flex-col bg-neutral-100 lg:w-[25%] lg:min-w-[320px] lg:max-w-md">
        <div className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-10 lg:px-8 xl:px-10">
          <div className="mb-10 flex justify-center animate-fade-in-up lg:mb-12">
            <BrandLogo variant="dark" />
          </div>

          <form className="mx-auto w-full max-w-xs space-y-8" onSubmit={handleSubmit} noValidate>
            <div className="animate-fade-in-up" style={{ animationDelay: "100ms" }}>
              <FormField
                id="email"
                label="E-mail"
                type="email"
                autoComplete="email"
                value={email}
                error={errors.email}
                onChange={(value) => {
                  setEmail(value);
                  if (errors.email) {
                    setErrors((prev) => ({ ...prev, email: "" }));
                  }
                  if (formError) {
                    setFormError("");
                  }
                }}
              />
            </div>

            <div className="animate-fade-in-up" style={{ animationDelay: "180ms" }}>
              <FormField
                id="password"
                label="Senha"
                type="password"
                autoComplete="current-password"
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
            </div>

            {(formError || linkError) && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 animate-slide-down"
              >
                {formError || linkError}
              </p>
            )}

            <div
              className="flex justify-end animate-fade-in-up"
              style={{ animationDelay: "260ms" }}
            >
              <Link
                href="/recuperar-senha"
                className="group inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-orange-600"
              >
                <svg
                  aria-hidden="true"
                  className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5"
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
                Perdeu sua Senha?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ animationDelay: "340ms" }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-orange py-3.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-brand-orange/30 transition-all duration-200 animate-fade-in-up hover:bg-orange-600 hover:shadow-xl hover:shadow-brand-orange/40 focus:outline-none focus:ring-4 focus:ring-brand-orange/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
            >
              {loading && <Spinner />}
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
