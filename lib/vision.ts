import { normalizeSignals } from "@/lib/coach";
import { READ, type Signals } from "@/lib/contract";

const SYSTEM = `Describe each visible shopper's observable behavior from left to right, up to ${READ.maxShoppers} shoppers.
Report only observable behavior. Never describe or infer identity, face, age, gender, race, clothing, or looks.
Return ONLY JSON with this structure: {"shoppers":[{"party":"alone","earbuds":false,"phoneInHand":false,"itemsInHand":0,"comparing":false,"lookingAround":false,"touchingProduct":false,"facing":"product","item":"","upsell":"","x":0.50}]}.
x is the horizontal center of the person in the image, from 0 (left edge) to 1 (right edge), rounded to 2 decimals.
party is alone, pair, or group, based on people standing together within arm's reach and facing each other or the same product. If uncertain, use alone.
facing is product, aisle, or exit. itemsInHand counts products held, from 0 to 5; a shopper with nothing in their hands has itemsInHand 0.
comparing is true only when two similar products are both visibly in hand or held up side by side.
earbuds is true only when earbuds or headphones are visible in or on the ears.
lookingAround is true only when the head is turned away from products, scanning the room.
If unsure about a boolean signal, use false.
item is only the product the shopper focuses on, never the person. upsell is one related product or a higher-end alternative the store would suggest (product only, short noun phrase). Omit item or upsell when the product cannot be determined.
Use false, 0, alone, and product as defaults for uncertain signals. If no person is visible, return {"shoppers":[]}.`;

export async function readFrame(dataUrl: string): Promise<Omit<Signals, "dwellSec">[]> {
  const prefix = "data:image/jpeg;base64,";
  if (!dataUrl.startsWith(prefix) || dataUrl.length > READ.maxImageBytes) {
    throw new Error("Invalid frame");
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Vision unavailable");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), READ.modelTimeoutMs);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? "claude-sonnet-5-5",
        max_tokens: 800,
        system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: dataUrl.slice(prefix.length),
              },
            },
            { type: "text", text: "Read the visible shoppers from left to right. Return only the JSON." },
          ],
        }],
      }),
    });
    if (response.status !== 200) throw new Error("Vision request failed");

    const payload: unknown = await response.json();
    if (payload === null || typeof payload !== "object"
      || !("content" in payload) || !Array.isArray(payload.content)) {
      throw new Error("Invalid vision response");
    }
    const text = payload.content.flatMap((block: unknown) => {
      if (block !== null && typeof block === "object" && "type" in block
        && block.type === "text" && "text" in block && typeof block.text === "string") {
        return [block.text];
      }
      return [];
    }).join("\n");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("Invalid vision JSON");
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (parsed === null || typeof parsed !== "object"
      || !("shoppers" in parsed) || !Array.isArray(parsed.shoppers)) {
      throw new Error("Invalid vision shoppers");
    }
    return parsed.shoppers.slice(0, READ.maxShoppers).map((shopper: unknown) => {
      const signals = normalizeSignals(shopper, 0);
      return {
        party: signals.party,
        earbuds: signals.earbuds,
        phoneInHand: signals.phoneInHand,
        itemsInHand: signals.itemsInHand,
        comparing: signals.comparing,
        lookingAround: signals.lookingAround,
        touchingProduct: signals.touchingProduct,
        facing: signals.facing,
        ...(signals.item ? { item: signals.item } : {}),
        ...(signals.upsell ? { upsell: signals.upsell } : {}),
        ...(signals.x !== undefined ? { x: signals.x } : {}),
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}
