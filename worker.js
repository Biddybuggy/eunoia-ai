// NOTE: IMPLEMENTED ON CLOUDFLARE
export default {
  async fetch(request, env) {
    // --- CORS preflight ---
    if (request.method === "OPTIONS") {
      return new Response("", {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      });
    }

    // --- Method guard ---
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // --- Parse JSON body ---
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // --- Validate message ---
    const message = String(body?.message ?? "").trim();
    if (!message) {
      return new Response(JSON.stringify({ error: "Missing message" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // --- Conversation / thread id ---
    // Client should send { conversationId }, but we fall back to a random UUID so it's never empty.
    const conversationId = String(body?.conversationId ?? "").trim();
    const userId = conversationId || crypto.randomUUID();

    // --- Conversation history for context ---
    const history = Array.isArray(body?.history) ? body.history : [];
    // Format history for StackAI (convert to chat_history format)
    const chatHistory = history.map((msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: String(msg.content || ""),
    }));

    // --- Call StackAI ---
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
          // IMPORTANT: this is what makes StackAI treat multiple requests as the same chat/thread
          "user_id": userId,
          // Conversation history for follow-up questions and context
          chat_history: chatHistory,
        }),
      }
    );

    const text = await stackResponse.text();

    // --- Return StackAI response (passthrough) ---
    return new Response(text, {
      status: stackResponse.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};


