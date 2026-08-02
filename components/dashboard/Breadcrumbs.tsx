import Link from "next/link";
import { ChevronRightIcon } from "./icons";

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-brand-muted">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.label} className="flex items-center gap-2">
            {index > 0 && <ChevronRightIcon className="h-3.5 w-3.5 text-brand-muted" />}
            {item.href && !isLast ? (
              <Link href={item.href} className="transition-colors hover:text-brand-green">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-white" : undefined}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
