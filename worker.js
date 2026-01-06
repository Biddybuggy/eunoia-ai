export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    };

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

    const message = String(body?.message ?? "").trim();
    if (!message) {
      return new Response(JSON.stringify({ error: "Missing message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conversationId = String(body?.conversationId ?? "").trim();
    const userId = conversationId || crypto.randomUUID();

    // Trim history in backend too (defense-in-depth)
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

    // Stream passthrough (no buffering)
    const headers = new Headers(stackResponse.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Type", "application/json");

    return new Response(stackResponse.body, {
      status: stackResponse.status,
      headers,
    });
  },
};
