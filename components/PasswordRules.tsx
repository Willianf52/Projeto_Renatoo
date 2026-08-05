import { PASSWORD_RULES } from "@/lib/password-policy";

/**
 * Lista de requisitos que reage conforme o usuario digita. Enquanto o campo
 * esta vazio os itens ficam neutros, para nao receber a senha com uma lista
 * de erros em vermelho antes de qualquer tentativa.
 */
export function PasswordRulesList({ password }: { password: string }) {
  const pristine = password === "";

  return (
    <ul className="mt-2 space-y-1" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const passed = rule.test(password);

        return (
          <li
            key={rule.label}
            className={`flex items-center gap-2 text-xs transition-colors duration-200 ${
              pristine ? "text-brand-muted" : passed ? "text-brand-green" : "text-red-400"
            }`}
          >
            <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              {pristine ? <DotIcon /> : passed ? <CheckIcon /> : <CrossIcon />}
            </span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

function DotIcon() {
  return (
    <svg viewBox="0 0 8 8" className="h-1.5 w-1.5 fill-current">
      <circle cx="4" cy="4" r="4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5">
      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5">
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
