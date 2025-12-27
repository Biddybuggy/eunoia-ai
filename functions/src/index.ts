import * as functions from "firebase-functions";
import cors from "cors";

const corsHandler = cors({origin: true});

export const yourFunction = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed. Use POST."});
      return;
    }

    const userMessage = String(req.body?.message ?? "").trim();
    if (!userMessage) {
      res.status(400).json({error: "Missing 'message' in request body."});
      return;
    }

    const apiKey = functions.config().stackai?.key;
    if (!apiKey) {
      res.status(500).json({
        error:
          "Run: firebase functions:config:set stackai.key=\"YOUR_KEY\"",
      });
      return;
    }

    try {
      const stackResponse = await fetch(
        "https://api.stack-ai.com/inference/v0/run/084f354b-fe55-4b36-ad8e-e7ec035df57f/694e2fedc9bc45bac8a7bc4e",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            "doc-0": [],
            "in-0": userMessage,
            "user_id": "",
          }),
        }
      );

      const data = await stackResponse.json();
      res.status(stackResponse.status).json(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({error: message});
    }
  });
});
