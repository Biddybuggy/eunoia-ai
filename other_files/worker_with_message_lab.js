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

  const MAX_STYLES = 6;
  const styles = Array.isArray(body?.styles) && body.styles.length
    ? body.styles.map((s) => String(s).trim()).filter(Boolean).slice(0, MAX_STYLES)
    : ["Gentle", "Assertive", "Casual", "Confident",  "Friendly", "Direct"];
  const runId = "084f354b-fe55-4b36-ad8e-e7ec035df57f";
  const deploymentId = "694e2fedc9bc45bac8a7bc4e";

  const requestedCount = styles.length;
  const requestedStyles = styles.slice();

  const debug = {
    requestedCount,
    requestedStyles,
    attempts: 0,
    parsedCount: 0,
    missingStyles: [],
  };

  const buildPrompt = (styleSubset, { onlyMissing } = { onlyMissing: false }) => {
    const styleList = styleSubset.map((s) => `- ${s}`).join("\n");
    return `
You are a relationship decision assistant.

The user received this message:
"${message}"

${onlyMissing ? `You MUST generate ONLY the remaining reply options for the styles below.` : `Generate ${styleSubset.length} DIFFERENT reply options, each with a distinct communication style from this list (use each exactly once):`}
${styleList}

Return ONLY valid JSON as an array of objects. Each object MUST have:
- style (string; one of the styles above)
- reply (string; the exact message the user can send)
- explanation (string; 1 short sentence explaining why/when this reply works)

Constraints:
- Return EXACTLY ${styleSubset.length} objects (no more, no fewer)
- Use each style EXACTLY once, and spell it exactly as provided
- Keep each reply under 240 characters (short, natural, text-message length)
- Keep each explanation under 140 characters
- Keep replies realistic and human, not robotic
- Do not include threats, ultimatums, or insults
- No therapy disclaimers, no extra commentary outside the JSON
`;
  };

  const callStack = async (prompt) => {
    debug.attempts += 1;
    const resp = await fetch(
      `https://api.stack-ai.com/inference/v0/run/${runId}/${deploymentId}`,
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

    const text = await resp.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { modelText: null, strategies: null, rawResponseText: text };
    }
    const rawOutput = parsed?.outputs?.["out-0"] ?? parsed?.outputs?.out0 ?? parsed?.output ?? null;
    const modelText = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput);
    const strategies = extractStrategiesArray(modelText);
    return { modelText, strategies, rawResponseText: null };
  };

  const normalizeStyle = (s) => String(s || "").trim().toLowerCase();

  const normalizeStrategies = (strategiesArr) =>
    (strategiesArr || []).map((s) => ({
      strategy: s?.style ?? s?.strategy ?? s?.tone ?? s?.name ?? "Reply option",
      reply: s?.reply ?? s?.message ?? s?.text ?? "",
      explanation: s?.explanation ?? s?.why ?? s?.rationale ?? s?.signal ?? "",
      riskLevel: s?.riskLevel ?? s?.risk_level ?? s?.risk ?? ""
    }));

  const mergeByStyle = (existing, incoming) => {
    const out = [];
    const seen = new Set();
    const push = (item) => {
      const key = normalizeStyle(item?.strategy);
      if (!key) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };
    (existing || []).forEach(push);
    (incoming || []).forEach(push);
    return out;
  };

  // Attempt 1: ask for all requested styles
  const first = await callStack(buildPrompt(requestedStyles, { onlyMissing: false }));
  const firstNorm = first.strategies ? normalizeStrategies(first.strategies) : [];

  // If short, attempt 2: ask only for missing styles
  const present = new Set(firstNorm.map((s) => normalizeStyle(s.strategy)));
  const missing = requestedStyles.filter((st) => !present.has(normalizeStyle(st)));
  debug.missingStyles = missing;

  let merged = firstNorm;
  let fallbackRaw = first.modelText;

  if (merged.length < requestedCount && missing.length) {
    const second = await callStack(buildPrompt(missing, { onlyMissing: true }));
    const secondNorm = second.strategies ? normalizeStrategies(second.strategies) : [];
    merged = mergeByStyle(merged, secondNorm);
    fallbackRaw = fallbackRaw || second.modelText;
  }

  // Order output to match requestedStyles, and cap to requestedCount
  const ordered = [];
  const byKey = new Map(merged.map((s) => [normalizeStyle(s.strategy), s]));
  for (const st of requestedStyles) {
    const hit = byKey.get(normalizeStyle(st));
    if (hit) ordered.push(hit);
  }
  // If model used unexpected style names, append leftovers
  for (const s of merged) {
    if (ordered.includes(s)) continue;
    ordered.push(s);
  }

  const finalStrategies = ordered.slice(0, requestedCount);
  debug.parsedCount = finalStrategies.length;

  if (finalStrategies.length > 0) {
    // Ask the model to recommend ONE option among the generated strategies.
    // This is a separate, small call so the generation step stays stable.
    let recommended = null;
    try {
      const compact = finalStrategies.map((s) => ({
        style: s.strategy,
        reply: s.reply,
        explanation: s.explanation
      }));
      const recPrompt = `
You are helping the user choose the best reply to send.

Incoming message:
"${message}"

Here are the candidate reply options (JSON):
${JSON.stringify(compact)}

Pick the single BEST option for a healthy outcome (de-escalate, clarify, keep dignity).
Return ONLY valid JSON with:
- style (string; exactly one of the style values above)
- reason (string; 1 short sentence)
`;
      const rec = await callStack(recPrompt);
      const recArr = rec?.strategies;
      // Some models accidentally return an array; accept first object in that case.
      const parseObj = (txt) => {
        if (!txt || typeof txt !== "string") return null;
        const t = txt.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
        try { return JSON.parse(t); } catch (_) { return null; }
      };
      let recObj = null;
      if (Array.isArray(recArr) && recArr.length && recArr[0] && typeof recArr[0] === "object") recObj = recArr[0];
      if (!recObj) recObj = parseObj(rec.modelText);
      if (Array.isArray(recObj)) recObj = recObj[0] || null;
      if (recObj && typeof recObj === "object") {
        const style = String(recObj.style ?? recObj.strategy ?? recObj.tone ?? recObj.name ?? "").trim();
        const reason = String(recObj.reason ?? recObj.explanation ?? recObj.why ?? "").trim();
        if (style) recommended = { style, reason };
      }
    } catch (_) {
      // ignore recommendation failures; still return strategies
    }

    return new Response(JSON.stringify({ strategies: finalStrategies, recommended, debug }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fallback: send raw model text for frontend-side parsing
  return new Response(
    JSON.stringify({ raw: fallbackRaw ?? "", debug }),
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
