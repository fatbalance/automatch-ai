export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { budget, picks, notes } = req.body || {};
    const safeBudget = (budget ?? "").toString().trim();
    const safePicks = Array.isArray(picks) ? picks : [];
    const safeNotes = (notes ?? "").toString().trim();

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "Missing GROQ_API_KEY in environment variables" });
    }

    const prompt = [
      `Budget: ${safeBudget || "Not provided"}`,
      `Preferences: ${safePicks.length ? safePicks.join(", ") : "None selected"}`,
      `Notes: ${safeNotes || "None"}`,
      "",
      "Task:",
      "- Recommend 3 cars available in the UK market that match the user.",
      "- For each car: give a 1-line reason + 3 bullet pros/cons (short).",
      "- Ask 1 follow-up question to improve the match.",
    ].join("\n");

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
model: "llama-3.3-70b-versatile",
         temperature: 0.7,
        messages: [
          { role: "system", content: "You are a practical UK car advisor. Be concise and specific." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        error: "Groq request failed",
        details: data,
      });
    }

    const reply = data?.choices?.[0]?.message?.content ?? "No response from model.";

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: err?.message || String(err) });
  }
}

