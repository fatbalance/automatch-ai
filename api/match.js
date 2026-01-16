export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    // Read body safely
    const body = req.body || {};
    const budget = (body.budget ?? "").toString().trim();
    const picks = Array.isArray(body.picks) ? body.picks.map(String) : [];
    const notes = (body.notes ?? "").toString().trim();

    // Ensure API key exists (set in Vercel env vars)
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: "Missing GROQ_API_KEY",
        hint: "Set GROQ_API_KEY in Vercel → Settings → Environment Variables (Production), then redeploy.",
      });
    }

    // You can swap this model if you want:
    // - "llama-3.3-70b-versatile" (strong, good reasoning)
    // - "llama-3.1-8b-instant" (faster/cheaper)
    const MODEL = "llama-3.3-70b-versatile";

    const userPrompt = [
      `Budget: ${budget || "Not provided"}`,
      `Preferences: ${picks.length ? picks.join(", ") : "None selected"}`,
      `Notes: ${notes || "None"}`,
      "",
      "Task:",
      "Recommend 3 cars that suit the user in the UK market.",
      "For each: give a 1-line reason + 3 short bullets (pros/cons or key points).",
      "Then ask 1 short follow-up question to improve the match.",
      "Keep it concise and practical.",
    ].join("\n");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: "You are a practical UK car advisor. Be concise, specific, and not salesy.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const data = await response.json();

    // If Groq returns an error, return it clearly (without leaking secrets)
    if (!response.ok) {
      return res.status(response.status).json({
        error: "Groq request failed",
        status: response.status,
        details: data,
        hint: "If the error mentions a model, change MODEL to a supported one (e.g. llama-3.3-70b-versatile or llama-3.1-8b-instant).",
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({
        error: "No reply returned from model",
        details: data,
      });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err?.message || String(err),
    });
  }
}

