// Firebase setup (Auth + Firestore)

import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ??
    "AIzaSyDm9sAChCdVzgSf2OQcxPKwO62SsxdNOLM",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ??
    "kaizenbudget-1b699.firebaseapp.com",
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "kaizenbudget-1b699",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ??
    "kaizenbudget-1b699.firebasestorage.app",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "23531434534",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ??
    "1:23531434534:web:1234567890abcdef123456",
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? "G-1234567890",
};

const app = initializeApp(firebaseConfig);

// 🔐 Auth
export const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch(() => {});

// ☁️ Firestore DB
export const db = getFirestore(app);