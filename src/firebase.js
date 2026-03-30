// Firebase setup (Auth + Firestore)

import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const hardcodedConfig = {
  apiKey: "AIzaSyDm9sAChCdVzgSf2OQcxPKwO62SsxdNOLM",
  authDomain: "kaizenbudget-1b699.firebaseapp.com",
  projectId: "kaizenbudget-1b699",
  storageBucket: "kaizenbudget-1b699.firebasestorage.app",
  messagingSenderId: "23531434534",
  appId: "1:23531434534:web:1234567890abcdef123456",
  measurementId: "G-1234567890",
};

const env = import.meta.env;
const envHasAll =
  !!env.VITE_FIREBASE_API_KEY &&
  !!env.VITE_FIREBASE_AUTH_DOMAIN &&
  !!env.VITE_FIREBASE_PROJECT_ID &&
  !!env.VITE_FIREBASE_STORAGE_BUCKET &&
  !!env.VITE_FIREBASE_MESSAGING_SENDER_ID &&
  !!env.VITE_FIREBASE_APP_ID &&
  !!env.VITE_FIREBASE_MEASUREMENT_ID;

const firebaseConfig = envHasAll
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
      measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
    }
  : hardcodedConfig;

const app = initializeApp(firebaseConfig);

// 🔐 Auth
export const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch(() => {});

// ☁️ Firestore DB
export const db = getFirestore(app);