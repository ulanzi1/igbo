export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">404</h1>
      {/* ci-allow-literal-jsx — not-found.tsx at root level renders outside [locale] i18n context */}
      <p className="mt-4 text-lg text-muted">Page not found</p>
    </main>
  );
}
