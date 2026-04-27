export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <section className="w-full max-w-md rounded-lg bg-white p-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-wide text-steel">
          Offline
        </p>
        <h1 className="mt-2 text-2xl font-bold text-ink">Still Partners</h1>
        <p className="mt-3 text-sm leading-6 text-steel">
          Your device is offline. Saved app screens remain available, and new
          submissions should be sent once your connection returns.
        </p>
      </section>
    </main>
  );
}
