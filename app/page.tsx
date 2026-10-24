import Link from "next/link";
import { COPY, FEATURES } from "@/lib/config";
import { ROUTES } from "@/lib/contract";

export default function Home() {
  return (
    <main className="flex min-h-dvh min-w-0 items-center justify-center bg-bg-base px-4 py-12 font-sans text-text-primary sm:px-6">
      <div className="w-full min-w-0 max-w-xl">
        <h1 className="text-2xl font-bold sm:text-4xl sm:font-semibold">{COPY.appName}</h1>
        <p className="mt-4 text-xl text-text-secondary">{COPY.floorTitle}</p>
        <nav className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href={ROUTES.floor} className="control control-primary text-center">
            {COPY.floorTitle}
          </Link>
          {FEATURES.replay && (
            <Link href={`${ROUTES.floor}?mode=replay`} className="control text-center">
              Replay
            </Link>
          )}
        </nav>
        <p className="mt-12 border-t border-border-default pt-4 text-caption text-text-muted">{COPY.privacyLine}</p>
      </div>
    </main>
  );
}
