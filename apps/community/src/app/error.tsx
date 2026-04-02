"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">Something went wrong</h1>
      <p className="mt-4 text-lg text-muted">{error.message}</p>
      <button className="mt-6 rounded-md bg-primary px-4 py-2 text-white" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
