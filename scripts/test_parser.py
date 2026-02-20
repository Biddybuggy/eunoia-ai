import json

def extract_json_array(s):
    s = s.replace('```json','\n').replace('```','\n')
    start = s.find('[')
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(s)):
        ch = s[i]
        if ch == '[':
            depth += 1
        elif ch == ']':
            depth -= 1
            if depth == 0:
                return s[start:i+1]
    return None

# malformed sample similar to screenshot: explanatory text + fenced JSON + trailing commas
sample = '''Here are four strategies I generated for you:
```json
[
  {
    "strategy": "Gracious Acceptance",
    "reply": "Thank you for being honest with me. I value our friendship and appreciate your clarity.",
    "signal": "Shows maturity, respect for their feelings, and openness to friendship.",
    "riskLevel": "low",
    "likelyOutcome": "The relationship continues as a friendship with mutual respect and less awkwardness."
  },
  {
    "strategy": "Clarification",
    "reply": "I appreciate your honesty. Can I ask what led you to feel this way? I want to understand.",
    "signal": "Opens dialogue and seeks clarity.",
    "riskLevel": "low",
    "likelyOutcome": "May reveal context and avoid miscommunication."
  },
]
```

Let me know which one you prefer.'''

print('Original sample:\n', sample[:300], '...')

candidate = extract_json_array(sample)
print('\nExtracted candidate:\n', candidate)

if candidate:
    # sanitize trailing commas
    sub = candidate.replace(',\n]', '\n]').replace(',\n}', '\n}')
    try:
        parsed = json.loads(sub)
        print('\nParsed successfully, length:', len(parsed))
    except Exception as e:
        print('\nParsing failed:', e)
        # try collapse whitespace
        loose = sub.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
        try:
            parsed2 = json.loads(loose)
            print('\nParsed with loose whitespace, length:', len(parsed2))
        except Exception as e2:
            print('\nLoose parse failed:', e2)
else:
    print('No candidate found')
