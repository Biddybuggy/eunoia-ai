# StackAI Follow-up Questions Setup Guide

## ✅ Frontend Changes (Already Done)
The `index.html` file has been updated to:
- Store conversation history in a `conversationHistory` array
- Send the full conversation history with each request
- Maintain context across multiple messages

## 🔧 Backend Updates Required

### Option 1: Update Cloudflare Worker (Current Endpoint)
Your endpoint is: `https://eunoia-backend.dylan-m-jaya.workers.dev`

**Update your Cloudflare Worker code to:**

```javascript
export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const { message, history = [] } = await request.json();

      if (!message) {
        return new Response(JSON.stringify({ error: "Missing message" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Format history for StackAI (if needed)
      // StackAI typically expects chat_history in this format:
      const chatHistory = history.map(msg => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content
      }));

      // Call StackAI API with conversation history
      const stackResponse = await fetch(
        "https://api.stack-ai.com/inference/v0/run/084f354b-fe55-4b36-ad8e-e7ec035df57f/694e2fedc9bc45bac8a7bc4e",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.STACKAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            "doc-0": [],
            "in-0": message,
            "chat_history": chatHistory, // Add conversation history
            "user_id": "",
          }),
        }
      );

      const data = await stackResponse.json();

      return new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};
```

**Important:** Set your StackAI API key as a Cloudflare Worker secret:
```bash
wrangler secret put STACKAI_API_KEY
```

---

### Option 2: Update Firebase Function (Alternative)
If you want to use the Firebase function instead, update `functions/src/index.ts`:

```typescript
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
    const history = req.body?.history ?? [];

    if (!userMessage) {
      res.status(400).json({error: "Missing 'message' in request body."});
      return;
    }

    const apiKey = functions.config().stackai?.key;
    if (!apiKey) {
      res.status(500).json({
        error: "Run: firebase functions:config:set stackai.key=\"YOUR_KEY\"",
      });
      return;
    }

    try {
      // Format history for StackAI
      const chatHistory = history.map((msg: any) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content
      }));

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
            "chat_history": chatHistory, // Add conversation history
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
```

Then deploy:
```bash
cd functions
npm run build
firebase deploy --only functions
```

---

## 📝 StackAI Agent Configuration (Outside IDE)

### In StackAI Dashboard:

1. **Go to your StackAI project**: https://www.stack-ai.com
2. **Navigate to your agent** (ID: `084f354b-fe55-4b36-ad8e-e7ec035df57f`)
3. **Enable Chat History**:
   - Go to the agent settings
   - Look for "Memory" or "Chat History" settings
   - Enable conversation memory/history
   - Set the memory window (e.g., last 10 messages)

4. **Update Input Variables** (if needed):
   - Ensure your agent accepts `chat_history` as an input
   - Or configure it to use the built-in conversation context

5. **Test the Agent**:
   - Use StackAI's built-in chat interface
   - Ask a question, then a follow-up
   - Verify it remembers context

### StackAI API Parameters:
- `in-0`: Current user message
- `chat_history`: Array of previous messages in format:
  ```json
  [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi! How can I help?"},
    {"role": "user", "content": "What did I just say?"}
  ]
  ```

**Note:** Some StackAI agents may use different parameter names like `history` or automatically handle context. Check your StackAI agent's documentation for the exact format.

---

## 🧪 Testing

1. Open your `index.html` in a browser
2. Ask a question: "What is love?"
3. Ask a follow-up: "Can you elaborate on that?"
4. The AI should remember the previous conversation

---

## 🔍 Troubleshooting

- **If follow-ups don't work**: Check StackAI dashboard to ensure chat history is enabled
- **If API errors**: Verify the `chat_history` parameter name matches your StackAI agent's expected format
- **Check browser console**: Look for any errors in the Network tab




