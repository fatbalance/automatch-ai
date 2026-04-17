const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3001;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

loadEnv(path.join(__dirname, ".env"));

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") return sendHtml(res);
  if (req.method === "POST" && req.url === "/match") return handleMatch(req, res);
  if (req.method === "POST" && req.url === "/compare") return handleCompare(req, res);
  json(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`local-min running on http://localhost:${PORT}`);
});

async function handleMatch(req, res) {
  if (!process.env.GROQ_API_KEY) return json(res, 500, { error: "Missing GROQ_API_KEY (.env)" });
  try {
    const body = await readBody(req);
    const chatMessages = Array.isArray(body.messages) ? body.messages : [];
    const context = body.context || {};
    let messages;

    if (chatMessages.length) {
      const bits = [
        context.budget && `Budget: ${String(context.budget).trim()}${context.budgetType ? ` (${context.budgetType})` : ""}`,
        Array.isArray(context.picks) && context.picks.length && `Preferences: ${context.picks.join(", ")}`,
        context.notes && `Notes: ${String(context.notes).trim()}`,
      ].filter(Boolean);
      const systemContent =
        "You are a practical UK car advisor. Be concise and specific. " +
        "When listing cars, use: 1. **Car Name**: short reason." +
        (bits.length ? ` User context: ${bits.join(". ")}` : "");
      messages = [{ role: "system", content: systemContent }, ...chatMessages.map((m) => ({ role: m.role, content: String(m.content || "").trim() }))];
    } else {
      const budget = String(body.budget || "").trim();
      const budgetType = String(body.budgetType || "").trim();
      const picks = Array.isArray(body.picks) ? body.picks : [];
      const notes = String(body.notes || "").trim();
      const prompt = [
        `Budget: ${budget || "Not provided"}${budgetType ? ` (${budgetType})` : ""}`,
        `Preferences: ${picks.length ? picks.join(", ") : "None selected"}`,
        `Notes: ${notes || "None"}`,
        "",
        "Open with one short greeting, then recommend 3 UK cars.",
        "Format each car as: 1. **Car Name**: short reason.",
        "End with one short follow-up question.",
      ].join("\n");
      messages = [
        { role: "system", content: "You are a practical UK car advisor. Be concise and not salesy." },
        { role: "user", content: prompt },
      ];
    }

    const data = await callGroq({ model: "llama-3.3-70b-versatile", temperature: 0.7, messages });
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) return json(res, 500, { error: "No reply from model", details: data });
    return json(res, 200, { reply });
  } catch (e) {
    return json(res, 500, { error: "Server error", details: e?.message || String(e) });
  }
}

async function handleCompare(req, res) {
  if (!process.env.GROQ_API_KEY) return json(res, 500, { error: "Missing GROQ_API_KEY (.env)" });
  try {
    const body = await readBody(req);
    const cars = Array.isArray(body.cars) ? body.cars.map(String).filter(Boolean) : [];
    if (cars.length < 2) return json(res, 400, { error: "Provide at least 2 cars." });

    const prompt = [
      `Compare these UK cars: ${cars.join(", ")}`,
      "",
      "Return ONLY JSON with shape:",
      '{"cars":[{"name":"","price":"","mpg":"","insurance":"","boot":"","reliability":"","pros":[],"cons":[]}]}',
      "Use realistic UK used-car ranges.",
    ].join("\n");

    const data = await callGroq({
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a UK car expert. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return json(res, 500, { error: "No reply from model", details: data });
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return json(res, 500, { error: "Invalid JSON from model", raw: raw.slice(0, 500) });
    }
    const carList = Array.isArray(parsed.cars) ? parsed.cars : [];
    if (!carList.length) return json(res, 500, { error: "No cars in response", parsed });
    return json(res, 200, { cars: carList });
  } catch (e) {
    return json(res, 500, { error: "Server error", details: e?.message || String(e) });
  }
}

function sendHtml(res) {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function json(res, code, payload) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function callGroq(body) {
  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Groq request failed");
  return data;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
