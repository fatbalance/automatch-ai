export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const body = req.body || {};

    // Ensure API key exists (set in Vercel env vars)
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: "Missing GROQ_API_KEY",
        hint: "Set GROQ_API_KEY in Vercel → Settings → Environment Variables (Production), then redeploy.",
      });
    }

    const MODEL = "llama-3.3-70b-versatile";

    let messages;

    // Chat continuation: messages array provided
    const chatMessages = Array.isArray(body.messages) ? body.messages : [];
    const context = body.context || {};

    if (chatMessages.length > 0) {
      const budget = (context.budget ?? "").toString().trim();
      const picks = Array.isArray(context.picks) ? context.picks.map(String) : [];
      const notes = (context.notes ?? "").toString().trim();
      const contextBlurb = [
        budget && `Budget: ${budget}`,
        picks.length && `Preferences: ${picks.join(", ")}`,
        notes && `Notes: ${notes}`,
      ]
        .filter(Boolean)
        .join(". ");

      const systemContent =
        "You are a practical UK car advisor. Be concise, specific, and not salesy." +
        (contextBlurb ? ` The user's initial context: ${contextBlurb}` : "");

      messages = [
        { role: "system", content: systemContent },
        ...chatMessages.map((m) => ({ role: m.role, content: String(m.content || "").trim() })),
      ];
    } else {
      // Initial request: budget, picks, notes
      const budget = (body.budget ?? "").toString().trim();
      const picks = Array.isArray(body.picks) ? body.picks.map(String) : [];
      const notes = (body.notes ?? "").toString().trim();

      const userPrompt = [
        `Budget: ${budget || "Not provided"}`,
        `Preferences: ${picks.length ? picks.join(", ") : "None selected"}`,
        `Notes: ${notes || "None"}`,
        "",
        "Task:",
        "The user has just shared their preferences. You speak first.",
        "Open with a brief friendly greeting (1 sentence) that acknowledges their choices, then recommend 3 cars that suit them in the UK market.",
        "For each car: give a 1-line reason + 3 short bullets (pros/cons or key points).",
        "End with 1 short follow-up question to improve the match.",
        "Keep it concise and practical. You are initiating the conversation.",
      ].join("\n");

      messages = [
        { role: "system", content: "You are a practical UK car advisor. Be concise, specific, and not salesy. When the user shares preferences, you always speak first with a warm opener before your recommendations." },
        { role: "user", content: userPrompt },
      ];
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        messages,
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

