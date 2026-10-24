import FloorView from "@/components/FloorView";
import { FEATURES, FEED_CLIPS } from "@/lib/config";

export default async function FloorPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[]; clip?: string | string[] }>;
}) {
  const params = await searchParams;
  const mode = params.mode === "feed" ? "feed" : FEATURES.replay && params.mode === "replay" ? "replay" : "live";
  const clip = typeof params.clip === "string" ? Number.parseInt(params.clip, 10) : NaN;
  const clipProps = mode === "feed" && clip >= 1 && clip <= FEED_CLIPS.length ? { clip } : {};
  return <FloorView mode={mode} {...clipProps} />;
}
