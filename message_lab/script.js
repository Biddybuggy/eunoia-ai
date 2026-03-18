const ENDPOINT = "https://eunoia-backend.dylan-m-jaya.workers.dev";

// Message Lab elements and handler
const analyzeBtn = document.getElementById("analyze-btn");
const labInput = document.getElementById("incoming-msg");
const labResults = document.getElementById("lab-results");

const DEFAULT_STYLES = ["Gentle", "Assertive", "Casual", "Confident",  "Friendly", "Direct"];

if (analyzeBtn && labInput && labResults) {
  // make Analyze button match app styling
  analyzeBtn.classList.add('download');
  analyzeBtn.addEventListener("click", async () => {
    const message = labInput.value.trim();
    if (!message) return;
    labResults.innerHTML = "<p class=\"lab-status\">Analyzing…</p>";

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "message-lab",
          message,
          styles: DEFAULT_STYLES
        })
      });

      // Attempt to parse JSON; fall back to text
      let payload;
      try {
        payload = await res.json();
      } catch (e) {
        const txt = await res.text();
        payload = txt;
      }

      renderMessageLab(payload);
    } catch (err) {
      labResults.innerHTML = "<p class=\"lab-error\">Something went wrong.</p>";
      console.error(err);
    }
  });
}

function renderMessageLab(payload) {
  // Optional: show backend debug info only when explicitly enabled
  const showDebug = (() => {
    try { return new URLSearchParams(window.location.search).has("debug"); }
    catch (_) { return false; }
  })();
  const debugLine = (() => {
    if (!showDebug) return "";
    const d = payload && typeof payload === "object" ? payload.debug : null;
    if (!d) return "";
    const req = typeof d.requestedCount === "number" ? d.requestedCount : "?";
    const got = typeof d.parsedCount === "number" ? d.parsedCount : "?";
    return `<p class="lab-status">Options requested: ${escapeHtml(req)} • Options returned: ${escapeHtml(got)}</p>`;
  })();

  // Preferred: backend already parsed strategies array
  if (typeof payload === "object" && payload !== null && Array.isArray(payload.strategies)) {
    _renderArray(payload.strategies, payload.recommended || null);
    if (debugLine) labResults.insertAdjacentHTML("afterbegin", debugLine);
    return;
  }

  // Fallback contract: { raw: "<model text>" }
  if (typeof payload === "object" && payload !== null && payload.raw) {
    const out = typeof payload.raw === "string"
      ? _tryParseText(payload.raw)
      : renderMessageLab(payload.raw);
    if (debugLine) labResults.insertAdjacentHTML("afterbegin", debugLine);
    return out;
  }

  // Direct array
  if (Array.isArray(payload)) {
    _renderArray(payload, null);
    if (debugLine) labResults.insertAdjacentHTML("afterbegin", debugLine);
    return;
  }

  // Try to discover an array anywhere inside an object
  if (typeof payload === "object" && payload !== null) {
    const nested = findArrayInObject(payload);
    // Only treat nested arrays as strategies if they look like [{ reply: ... }, ...]
    if (nested && looksLikeStrategiesArray(nested)) return _renderArray(nested);
    const outText =
      payload?.outputs?.["out-0"] || payload?.outputs?.out0 || payload?.text || payload?.result || null;
    if (outText) return _tryParseText(outText);
  }

  // Last resort: treat as raw text
  if (typeof payload === "string") return _tryParseText(payload);

  // Try any string in payload that looks like model output (e.g. truncated array)
  if (typeof payload === "object" && payload !== null) {
    const str = findStrategyLikeString(payload);
    if (str) return _tryParseText(str);
  }

  labResults.innerHTML = `<p class="lab-error">Invalid response format.</p><pre class="lab-raw">${escapeHtml(JSON.stringify(payload))}</pre>`;
}

function looksLikeStrategiesArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const sample = arr.slice(0, Math.min(3, arr.length));
  return sample.every((x) => {
    if (!x || typeof x !== "object") return false;
    const reply = x.reply ?? x.message ?? x.text ?? "";
    return typeof reply === "string" && reply.trim().length > 0;
  });
}

function findStrategyLikeString(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (typeof obj === 'string' && /"strategy"|"reply"/.test(obj) && obj.indexOf('[') !== -1) return obj;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string' && /"strategy"|"reply"/.test(v) && v.indexOf('[') !== -1) return v;
    if (typeof v === 'object') {
      const found = findStrategyLikeString(v);
      if (found) return found;
    }
  }
  return null;
}

// Recursively search an object for the first array value
function findArrayInObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) return obj;
  for (const k of Object.keys(obj)) {
    try {
      const v = obj[k];
      if (Array.isArray(v)) return v;
      if (typeof v === 'object') {
        const found = findArrayInObject(v);
        if (found) return found;
      }
      if (typeof v === 'string' && v.trim().startsWith('[')) {
        // try to parse stringified JSON array
        try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) return parsed;
        } catch (e) {
          // ignore parse errors
        }
      }
    } catch (e) {
      // continue
    }
  }
  return null;
}

function _tryParseText(text) {
  const txt = String(text || '').replace(/```(?:json)?/g, '\n').trim();

  try {
    const parsed = JSON.parse(txt);
    if (Array.isArray(parsed)) return _renderArray(parsed);
  } catch (_) {}

  function extractJsonArray(s) {
    const start = s.indexOf('[');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
    return null;
  }

  const candidate = extractJsonArray(txt);
  if (candidate) {
    const sub = candidate.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
    try {
      const arr = JSON.parse(sub);
      if (Array.isArray(arr) && arr.length) return _renderArray(arr);
    } catch (_) {}
    try {
      const arr = JSON.parse(sub.replace(/\n/g, ' ').replace(/\s+/g, ' '));
      if (Array.isArray(arr) && arr.length) return _renderArray(arr);
    } catch (_) {}
  }

  // Truncated response: extract every complete { ... } object that looks like a strategy
  const partial = extractCompleteStrategyObjects(txt);
  if (partial.length) return _renderArray(partial);

  labResults.innerHTML = `<p class="lab-error">Couldn't parse model output as JSON.</p><pre class="lab-raw">${escapeHtml(String(text))}</pre>`;
}

function extractCompleteStrategyObjects(txt) {
  const out = [];
  let i = txt.indexOf('[');
  if (i === -1) return out;
  i += 1;
  while (i < txt.length) {
    while (i < txt.length && /[\s,]/.test(txt[i])) i++;
    if (i >= txt.length || txt[i] !== '{') break;
    const start = i;
    let depth = 0;
    let inStr = false;
    let escape = false;
    let quote = '';
    for (; i < txt.length; i++) {
      const c = txt[i];
      if (escape) { escape = false; continue; }
      if (c === '\\' && inStr) { escape = true; continue; }
      if (inStr) {
        if (c === quote) inStr = false;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const slice = txt.slice(start, i + 1).replace(/,\s*}/g, '}');
          try {
            const obj = JSON.parse(slice);
            if (obj && typeof obj === 'object' && (obj.strategy || obj.reply || obj.name)) out.push(obj);
          } catch (_) {}
          i++;
          break;
        }
      }
    }
  }
  return out;
}

function _renderArray(arr, recommended) {
  if (!arr.length) {
    labResults.innerHTML = "<p class=\"lab-error\">No strategies returned.</p>";
    return;
  }
  const recStyle = recommended?.style ? String(recommended.style).trim().toLowerCase() : "";
  const recReason = recommended?.reason ? String(recommended.reason).trim() : "";
  const norm = (s) => ({
    strategy: s.strategy ?? s.style ?? s.tone ?? s.name ?? "Strategy",
    reply: s.reply ?? s.message ?? s.text ?? "",
    explanation: s.explanation ?? s.why ?? s.rationale ?? s.signal ?? "",
    riskLevel: s.riskLevel ?? s.risk_level ?? s.risk ?? ""
  });

  labResults.innerHTML = "<div class=\"lab-grid\">" + arr.map((s, i) => {
    const n = norm(s);
    const isRec = recStyle && String(n.strategy).trim().toLowerCase() === recStyle;
    const metaLines = [];
    if (isRec) metaLines.push(`<p class="lab-meta"><strong>Recommended</strong>${recReason ? ` — ${escapeHtml(recReason)}` : ""}</p>`);
    if (n.explanation) metaLines.push(`<p class="lab-expl">${escapeHtml(n.explanation)}</p>`);
    if (n.riskLevel) metaLines.push(`<p class="lab-meta"><strong>Risk Level:</strong> ${escapeHtml(n.riskLevel)}</p>`);
    return `<div class="lab-card${isRec ? " lab-card-recommended" : ""}" data-index="${i}">
      <h4>${escapeHtml(n.strategy)}</h4>
      <p class="lab-reply">"${escapeHtml(n.reply)}"</p>
      ${metaLines.join("")}
    </div>`;
  }).join("") + "</div>";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
