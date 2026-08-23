import Link from "next/link";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "danger";
type Size = "md" | "lg";

/**
 * Antes desta componente, cada tela reescrevia a propria string de classes
 * do botao do zero -- e o resultado eram tres valores diferentes de
 * active:scale (.90/.95/.97/.98) e dois raios de borda concorrendo sem
 * decisao nenhuma por tras, so deriva. `size` preserva a distincao
 * intencional (lg = CTA de destaque como o login, md = botao denso de
 * dashboard); tudo o resto (easing, anel de foco, escala ao clicar,
 * tratamento de disabled) fica igual nos dois.
 */
const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-brand-green text-brand-navy shadow-sm hover:bg-brand-green-hover hover:shadow-lg hover:shadow-brand-green/30 focus-visible:ring-brand-green disabled:hover:shadow-sm",
  secondary:
    "border border-slate-800 text-brand-muted hover:bg-brand-navy hover:text-white focus-visible:ring-slate-600",
  danger:
    "border border-red-500/40 text-red-300 hover:border-red-500 hover:bg-red-500/10 focus-visible:ring-red-500/40",
};

const SIZE_CLASSES: Record<Size, string> = {
  md: "h-10 rounded-md px-6 text-sm font-semibold",
  lg: "rounded-lg py-3.5 text-sm font-bold uppercase tracking-wider",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<React.ComponentProps<typeof Link>, keyof CommonProps> & {
    href: string;
  };

type ButtonProps = ButtonAsButton | ButtonAsLink;

function buildClassName({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
}: Pick<CommonProps, "variant" | "size" | "fullWidth" | "className">) {
  return [
    BASE_CLASSES,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth ? "w-full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * `href` presente vira `<Link>` (ex.: "Cancelar" saindo de um formulario);
 * ausente vira `<button>`. `loading` mostra o spinner e desabilita --
 * so faz sentido em botao, um link nao tem estado de carregamento proprio.
 *
 * `disabled` num link vira um `<span>` inerte (nao navega), em vez de virar
 * atributo HTML invalido num `<a>`. Existe para o "Cancelar" ao lado de um
 * "Salvar" em voo: sem isso, a pessoa navega para longe no meio de uma
 * escrita que so o servidor sabe se ja terminou, e volta sem saber se salvou.
 */
export function Button({ variant, size, fullWidth, loading, disabled, className, children, ...props }: ButtonProps) {
  const classes = buildClassName({ variant, size, fullWidth, className });

  if ("href" in props && props.href !== undefined) {
    const { href, ...linkProps } = props as Omit<ButtonAsLink, keyof CommonProps> & { href: string };

    if (disabled) {
      return (
        <span
          aria-disabled="true"
          className={`${classes} cursor-not-allowed opacity-60`}
          {...(linkProps as React.HTMLAttributes<HTMLSpanElement>)}
        >
          {children}
        </span>
      );
    }

    return (
      <Link href={href} className={classes} {...linkProps}>
        {children}
      </Link>
    );
  }

  const buttonProps = props as Omit<ButtonAsButton, keyof CommonProps>;

  return (
    <button type="button" disabled={disabled || loading} className={classes} {...buttonProps}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}
