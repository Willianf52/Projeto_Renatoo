"use client";

import { FormEvent, useState } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { PasswordRulesList } from "@/components/PasswordRules";
import { isPasswordValid } from "@/lib/password-policy";
import { createClient } from "@/lib/supabase/client";

export default function TrocarSenhaPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState({
    password: "",
    confirmation: "",
  });
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
      const mensagem = error.message.toLowerCase();
      if (mensagem.includes("should be different")) {
        setFormError("A nova senha precisa ser diferente da atual.");
      } else if (mensagem.includes("weak") || mensagem.includes("requirements")) {
        setFormError("A nova senha foi recusada por não atender aos requisitos.");
      } else {
        setFormError("Não foi possível alterar a senha. Tente novamente.");
      }
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

              <Button type="submit" size="lg" loading={loading} disabled={loading}>
                {loading ? "Alterando..." : "Alterar Senha"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
