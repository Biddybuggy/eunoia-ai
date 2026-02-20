export default {
  async fetch(request, env) {
    const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🔑 NEW: mode routing
    const mode = String(body?.mode ?? "chat");

    const message = String(body?.message ?? "").trim();

    // =========================
    // MESSAGE LAB MODE
    // =========================
    if (mode === "message-lab") {
      return handleMessageLab({ message, body, env, corsHeaders });
    }

    // =========================
    // CHAT MODE (existing logic)
    // =========================
    if (!message) {
      return new Response(JSON.stringify({ error: "Missing message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conversationId = String(body?.conversationId ?? "").trim();
    const userId = conversationId || crypto.randomUUID();

    const MAX_TURNS = 12;
    const MAX_CHARS_PER_MSG = 1500;

    const history = Array.isArray(body?.history) ? body.history : [];
    const chatHistory = history.slice(-MAX_TURNS).map((msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: String(msg.content || "").slice(0, MAX_CHARS_PER_MSG),
    }));

    const stackResponse = await fetch(
      "https://api.stack-ai.com/inference/v0/run/084f354b-fe55-4b36-ad8e-e7ec035df57f/694e2fedc9bc45bac8a7bc4e",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.STACKAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          "in-0": message,
          "doc-0": [],
          user_id: userId,
          chat_history: chatHistory,
        }),
      }
    );

    const headers = new Headers(stackResponse.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Type", "application/json");

    return new Response(stackResponse.body, {
      status: stackResponse.status,
      headers,
    });
  },
};

// =========================
// MESSAGE LAB HANDLER
// =========================
async function handleMessageLab({ message, body, env, corsHeaders }) {
  if (!message) {
    return new Response(JSON.stringify({ error: "Missing incoming message" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const riskProfile = body?.riskProfile || "unknown";

  const prompt = `
You are a relationship decision assistant.

The user received this message:
"${message}"

User risk profile:
${riskProfile}

Generate exactly 4 DIFFERENT reply strategies.

For each strategy, return:
- strategy (short name)
- reply (exact message text)
- signal (what this communicates)
- riskLevel (low, medium, or high)
- likelyOutcome (1 sentence)

Return ONLY valid JSON as an array.
`;

  const stackResponse = await fetch(
    "https://api.stack-ai.com/inference/v0/run/084f354b-fe55-4b36-ad8e-e7ec035df57f/694e2fedc9bc45bac8a7bc4e",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STACKAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "in-0": prompt,
        "doc-0": [],
        user_id: crypto.randomUUID(),
        chat_history: [],
      }),
    }
  );

  const text = await stackResponse.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid response from Stack AI" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawOutput = parsed?.outputs?.["out-0"] ?? parsed?.outputs?.out0 ?? parsed?.output ?? null;
  const modelText = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput);

  const strategies = extractStrategiesArray(modelText);
  if (strategies && strategies.length > 0) {
    return new Response(JSON.stringify({ strategies }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fallback: send raw model text for frontend-side parsing
  return new Response(
    JSON.stringify({ raw: modelText }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function extractStrategiesArray(text) {
  if (!text || typeof text !== "string") return null;
  let s = text.trim();

  const stripCodeFence = (str) => str.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  s = stripCodeFence(s);

  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed) && parsed.every((x) => x && typeof x === "object")) return parsed;
  } catch (_) {}

  const start = s.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        const candidate = s.slice(start, i + 1)
          .replace(/,\s*]/g, "]")
          .replace(/,\s*}/g, "}");
        try {
          const arr = JSON.parse(candidate);
          if (Array.isArray(arr) && arr.every((x) => x && typeof x === "object")) return arr;
        } catch (_) {}
        break;
      }
    }
  }
  const partial = extractCompleteStrategyObjects(s);
  return partial.length ? partial : null;
}

function extractCompleteStrategyObjects(txt) {
  const out = [];
  let i = txt.indexOf("[");
  if (i === -1) return out;
  i += 1;
  while (i < txt.length) {
    while (i < txt.length && /[\s,]/.test(txt[i])) i++;
    if (i >= txt.length || txt[i] !== "{") break;
    const start = i;
    let depth = 0;
    let inStr = false;
    let escape = false;
    let quote = "";
    for (; i < txt.length; i++) {
      const c = txt[i];
      if (escape) { escape = false; continue; }
      if (c === "\\" && inStr) { escape = true; continue; }
      if (inStr) {
        if (c === quote) inStr = false;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          const slice = txt.slice(start, i + 1).replace(/,\s*}/g, "}");
          try {
            const obj = JSON.parse(slice);
            if (obj && typeof obj === "object" && (obj.strategy || obj.reply || obj.name)) out.push(obj);
          } catch (_) {}
          i++;
          break;
        }
      }
    }
  }
  return out;
}
