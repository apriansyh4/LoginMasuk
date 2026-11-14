'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Header link that marks the section you are in (also for its sub-pages). */
export function NavLink({ href, also = [], children }: { href: string; also?: string[]; children: React.ReactNode }) {
  const path = usePathname() ?? '/';
  const active = [href, ...also].some((p) => path === p || path.startsWith(`${p}/`));
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={active ? 'btn bg-kunyit font-extrabold text-ink' : 'nav-item'}
    >
      {children}
    </Link>
  );
}
