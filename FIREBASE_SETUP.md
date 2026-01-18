# Firebase setup for Google Sign-In and conversation storage

Eunoia AI can use Firebase for **Sign in with Google** and to **store conversations per user** in Firestore. If Firebase is not configured, the app works in guest mode with a 5-message limit.

## 1. Configure `firebase-config.js`

Copy your web app config from the [Firebase Console](https://console.firebase.google.com/project/eunoia-dj122625/settings/general) (Your apps → Web app → Config) into `firebase-config.js`:

```js
window.firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "eunoia-dj122625.firebaseapp.com",
  projectId: "eunoia-dj122625",
  storageBucket: "eunoia-dj122625.firebasestorage.app",
  messagingSenderId: "123...",
  appId: "1:123..."
};
```

## 2. Enable Google Sign-In

In [Authentication → Sign-in method](https://console.firebase.google.com/project/eunoia-dj122625/authentication/providers), enable **Google** and set your support email.

## 3. Create Firestore and deploy rules

1. In [Firestore Database](https://console.firebase.google.com/project/eunoia-dj122625/firestore), **Create database** (start in production).
2. Deploy the rules in this project:

   ```bash
   firebase deploy --only firestore:rules
   ```

   Rules in `firestore.rules` ensure users can only read/write their own `users/{userId}/conversations/` docs.

## 4. Authorized domains (for localhost)

For local testing, add `localhost` under [Authentication → Settings → Authorized domains](https://console.firebase.google.com/project/eunoia-dj122625/authentication/settings). Your production domain must also be listed.

---

## Behavior

| User type   | Storage                    | Limit        |
|------------|----------------------------|--------------|
| **Guest**  | `sessionStorage` (lost on new tab/refresh) | 5 messages  |
| **Signed in** | Firestore `users/{uid}/conversations/{id}` | No limit     |

- **New chat** starts a new conversation; for signed-in users it is stored as a new Firestore document when you send the first message.
- **Download Chat** works for both guests and signed-in users (current conversation only).
