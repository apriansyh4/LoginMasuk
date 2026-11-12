export function AuthShell({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md">
      <div className="card p-8">
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-center text-sm text-ink-soft">{footer}</div>}
    </div>
  );
}
