import Link from "next/link";
import { COPY, FEATURES } from "@/lib/config";
import { ROUTES } from "@/lib/contract";

export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 py-12 font-sans text-slate-50">
      <div className="w-full max-w-xl">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">{COPY.appName}</h1>
        <p className="mt-4 text-xl text-slate-300">{COPY.floorTitle}</p>
        <nav className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href={ROUTES.floor} className="rounded-xl bg-lime-300 px-6 py-4 text-center font-semibold text-slate-950 hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300">
            {COPY.floorTitle}
          </Link>
          {FEATURES.replay && (
            <Link href={`${ROUTES.floor}?mode=replay`} className="rounded-xl border border-slate-600 px-6 py-4 text-center font-semibold hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300">
              Replay
            </Link>
          )}
        </nav>
        <p className="mt-12 text-sm leading-6 text-slate-400">{COPY.privacyLine}</p>
      </div>
    </main>
  );
}
