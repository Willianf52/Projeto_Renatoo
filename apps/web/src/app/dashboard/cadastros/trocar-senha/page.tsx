"use client";

import { FormEvent, useState } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { PasswordRulesList } from "@/components/PasswordRules";
import { isPasswordValid } from "@/lib/password-policy";
import { createClient } from "@/lib/supabase/client";
import { verificarSenhaVazada } from "@/lib/verificar-senha-vazada";

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
     * Reautenticacao antes da troca.
     *
     * Sem isto, `updateUser({ password })` so exige uma sessao valida -- e
     * qualquer coisa que entregue uma sessao a terceiro (aparelho destravado,
     * cookie exfiltrado) deixa de ser acesso temporario e vira posse da conta:
     * troca-se a senha e o dono e expulso, sem nada a atravessar. O aviso por
     * e-mail do webhook `user-updated` detecta depois do fato; nao impede.
     *
     * `signInWithPassword` com o e-mail da propria sessao e o jeito de exigir
     * a senha atual pelo lado do cliente. A segunda camada e
     * `secure_password_change` no GoTrue (supabase/config.toml), cobrada pelo
     * servidor -- as duas juntas porque esta aqui um refactor remove sem
     * ninguem notar.
     */
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setLoading(false);
      setFormError("Sua sessão expirou. Entre novamente para trocar a senha.");
      return;
    }

    const { error: erroDeReautenticacao } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (erroDeReautenticacao) {
      setLoading(false);
      setErrors((prev) => ({ ...prev, currentPassword: "Senha atual incorreta" }));
      return;
    }

    if (password === currentPassword) {
      setLoading(false);
      setErrors((prev) => ({
        ...prev,
        password: "A nova senha precisa ser diferente da atual",
      }));
      return;
    }

    if (await verificarSenhaVazada(password)) {
      setLoading(false);
      setFormError("Esta senha apareceu em vazamentos de dados conhecidos. Escolha outra.");
      return;
    }

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
              {/* `current-password` no autoComplete: e o que faz o gerenciador
                  preencher a senha existente aqui e a nova nos dois campos
                  abaixo, em vez de oferecer a mesma sugestao nos tres. */}
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
