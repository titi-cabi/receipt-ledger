export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { image, mediaType } = req.body || {};
  if (!image || !mediaType) {
    res.status(400).json({ error: "Missing image or mediaType" });
    return;
  }

  const prompt = `You are reading a photo of a receipt or invoice. Extract the data and respond with ONLY raw JSON, no markdown fences, no commentary, matching exactly this shape:
{
  "company": string,
  "date": string (YYYY-MM-DD if determinable, else best guess or ""),
  "currency": string (e.g. "THB", "USD", best guess symbol->code),
  "items": [{"name": string, "qty": number, "price": number}],
  "subtotal_excl_vat": number,
  "vat_amount": number,
  "vat_rate_percent": number,
  "total_incl_vat": number
}
If a field truly cannot be determined, use "" for strings or 0 for numbers. Do not invent line items that aren't there. Numbers must be plain numbers, no currency symbols or commas.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json({ error: data?.error?.message || "Anthropic API error" });
      return;
    }

    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) {
      res.status(500).json({ error: "No text in model response" });
      return;
    }

    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read receipt: " + err.message });
  }
}
