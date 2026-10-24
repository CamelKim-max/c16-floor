export async function buzz(
  zone: string,
  item: string | undefined,
): Promise<{ sent: boolean; skipped?: string; status?: number }> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return { sent: false, skipped: "no topic" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("https://ntfy.sh/" + topic, {
      method: "POST",
      headers: {
        Title: "Ready to buy",
        Priority: "4",
        Tags: "shopping",
      },
      body: `Zone ${zone}: Ready to buy — ${item ?? "this item"}`,
      signal: controller.signal,
    });
    return { sent: response.ok, status: response.status };
  } catch {
    return { sent: false, skipped: "error" };
  } finally {
    clearTimeout(timeout);
  }
}
