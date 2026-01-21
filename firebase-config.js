// Load from environment or fallback to inline (for development only)
window.firebaseConfig = {
  apiKey: typeof process !== 'undefined' && process.env.VITE_FIREBASE_API_KEY ? process.env.VITE_FIREBASE_API_KEY : "AIzaSyD5mw8IycB1FDHNgov21JdwrXYOOnPPjY8",
  authDomain: typeof process !== 'undefined' && process.env.VITE_FIREBASE_AUTH_DOMAIN ? process.env.VITE_FIREBASE_AUTH_DOMAIN : "eunoia-dj122625.firebaseapp.com",
  projectId: typeof process !== 'undefined' && process.env.VITE_FIREBASE_PROJECT_ID ? process.env.VITE_FIREBASE_PROJECT_ID : "eunoia-dj122625",
  storageBucket: typeof process !== 'undefined' && process.env.VITE_FIREBASE_STORAGE_BUCKET ? process.env.VITE_FIREBASE_STORAGE_BUCKET : "eunoia-dj122625.firebasestorage.app",
  messagingSenderId: typeof process !== 'undefined' && process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ? process.env.VITE_FIREBASE_MESSAGING_SENDER_ID : "196432488320",
  appId: typeof process !== 'undefined' && process.env.VITE_FIREBASE_APP_ID ? process.env.VITE_FIREBASE_APP_ID : "1:196432488320:web:4849c7812fc5e226734365"
};
