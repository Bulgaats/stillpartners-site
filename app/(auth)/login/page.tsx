import { login, loginWithGoogle } from "@/app/actions/auth";
import Image from "next/image";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ message?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-8">
      <section className="w-full max-w-md rounded-lg bg-white p-5 shadow-panel">
        <Image
          alt="Still Partners"
          className="h-auto w-56"
          height={164}
          priority
          src="/assets/logo/logo-full-light.svg?v=20260427-cache-reset"
          width={820}
        />
        <h1 className="mt-3 text-3xl font-bold text-ink">Internal Beta</h1>
        <p className="mt-2 text-sm leading-6 text-steel">
          Private beta access for approved Still Partners workers and admins.
          Daily Leading Hand access is assigned per job/day.
        </p>
        <form action={login} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-ink">
            Email
            <input
              className="rounded-md border border-steel/30 px-3 py-3 outline-none focus:border-gum focus:ring-2 focus:ring-gum/20"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            Password
            <input
              className="rounded-md border border-steel/30 px-3 py-3 outline-none focus:border-gum focus:ring-2 focus:ring-gum/20"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {params?.message ? (
            <p className="rounded-md bg-safety/15 px-3 py-2 text-sm text-ink">
              {params.message}
            </p>
          ) : null}
          <button
            className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white"
            type="submit"
          >
            Sign in
          </button>
        </form>
        <form action={loginWithGoogle} className="mt-3">
          <button
            className="w-full rounded-md border border-steel/25 bg-white px-4 py-3 text-sm font-semibold text-ink"
            type="submit"
          >
            Continue with Google
          </button>
        </form>
      </section>
    </main>
  );
}
