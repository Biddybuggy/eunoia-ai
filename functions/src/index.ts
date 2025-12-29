import * as functions from "firebase-functions";
import cors from "cors";

const corsHandler = cors({ origin: true });

const STACK_AI_URL =
  "https://api.stack-ai.com/inference/v0/run/084f354b-fe55-4b36-ad8e-e7ec035df57f/694e2fedc9bc45bac8a7bc4e";

export const yourFunction = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    // --- Preflight ---
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.status(204).send("");
      return;
    }

    // --- Method guard ---
    if (req.method !== "POST") {
      res.set("Access-Control-Allow-Origin", "*");
      res.status(405).json({ error: "Use POST" });
      return;
    }

    // --- Validate body ---
    const userMessage = String(req.body?.message ?? "").trim();
    if (!userMessage) {
      res.set("Access-Control-Allow-Origin", "*");
      res.status(400).json({ error: "Missing message" });
      return;
    }

    // --- Conversation/thread id (stable) ---
    const conversationId = String(req.body?.conversationId ?? "").trim();
    const userId = conversationId || crypto.randomUUID();

    try {
      // --- StackAI API key ---
      const apiKeyFromConfig = (functions.config() as any)?.stackai?.key as
        | string
        | undefined;

      const apiKeyFromEnv = process.env.STACKAI_API_KEY;

      const apiKey = apiKeyFromConfig || apiKeyFromEnv;
      if (!apiKey) {
        res.set("Access-Control-Allow-Origin", "*");
        res.status(500).json({
          error:
            "Missing StackAI API key. Set functions config `stackai.key` or env var `STACKAI_API_KEY`.",
        });
        return;
      }

      // --- Call StackAI ---
      const stackResponse = await fetch(STACK_AI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          "in-0": userMessage,
          user_id: userId,
          "doc-0": [],
        }),
      });

      const contentType = stackResponse.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await stackResponse.json();
        res.set("Access-Control-Allow-Origin", "*");
        res.status(stackResponse.status).json(data);
        return;
      } else {
        const text = await stackResponse.text();
        res.set("Access-Control-Allow-Origin", "*");
        res.status(stackResponse.status).json({ raw: text });
        return;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.set("Access-Control-Allow-Origin", "*");
      res.status(500).json({ error: message });
    }
  });
});
