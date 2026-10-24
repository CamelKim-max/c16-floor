import FloorView from "@/components/FloorView";
import { FEATURES } from "@/lib/config";

export default async function FloorPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const params = await searchParams;
  return <FloorView mode={FEATURES.replay && params.mode === "replay" ? "replay" : "live"} />;
}
