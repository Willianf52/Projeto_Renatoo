import Link from "next/link";
import { ChevronRightIcon } from "./icons";

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.label} className="flex items-center gap-2">
            {index > 0 && <ChevronRightIcon className="h-3.5 w-3.5 text-slate-400" />}
            {item.href && !isLast ? (
              <Link href={item.href} className="transition-colors hover:text-orange-600">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-slate-700" : undefined}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
