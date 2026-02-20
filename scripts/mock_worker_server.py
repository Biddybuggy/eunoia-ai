from http.server import BaseHTTPRequestHandler, HTTPServer
import json

SAMPLE = [
    {
        "strategy": "Gentle boundary",
        "reply": "Thanks for being honest — I value our friendship and want to be clear: I see you as a close friend.",
        "signal": "Sets a kind, clear boundary",
        "riskLevel": "low",
        "likelyOutcome": "Preserves the relationship while preventing confusion."
    },
    {
        "strategy": "Clarifying question",
        "reply": "I appreciate you telling me — can you tell me what you meant by that?",
        "signal": "Opens for clarification",
        "riskLevel": "low",
        "likelyOutcome": "May reveal whether they meant something deeper."
    },
    {
        "strategy": "Playful redirect",
        "reply": "Close friend? Guess I get dibs on movie nights then 😄",
        "signal": "Keeps tone light and non-confrontational",
        "riskLevel": "medium",
        "likelyOutcome": "Keeps conversation friendly but may avoid a direct clarification."
    },
    {
        "strategy": "Direct response",
        "reply": "I want to be sure we're on the same page — do you mean we're just friends?",
        "signal": "Seeks clarity and boundaries",
        "riskLevel": "medium",
        "likelyOutcome": "Forces a clear answer, which can be helpful."
    }
]

class Handler(BaseHTTPRequestHandler):
    def _set_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get('content-length', 0))
        raw = self.rfile.read(length).decode('utf-8') if length else ''
        try:
            body = json.loads(raw) if raw else {}
        except Exception:
            self.send_response(400)
            self._set_cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error':'Invalid JSON'}).encode('utf-8'))
            return

        mode = body.get('mode', 'chat')
        if mode == 'message-lab':
            payload = SAMPLE
            self.send_response(200)
            self._set_cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode('utf-8'))
            return

        # default echo
        self.send_response(200)
        self._set_cors()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'echo': body}).encode('utf-8'))

if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', 9000), Handler)
    print('Mock worker running at http://127.0.0.1:9000')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
        print('Server stopped')
