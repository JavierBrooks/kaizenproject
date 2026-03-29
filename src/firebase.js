// Firebase setup (Auth + Firestore)

import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDm9sAChCdVzgSf2OQcxPKwO62SsxdNOLM",
  authDomain: "kaizenbudget-1b699.firebaseapp.com",
  projectId: "kaizenbudget-1b699",
  storageBucket: "kaizenbudget-1b699.firebasestorage.app",
  messagingSenderId: "23531434534",
  appId: "1:23531434534:web:1234567890abcdef123456",
  measurementId: "G-1234567890",
};

const app = initializeApp(firebaseConfig);

// 🔐 Auth
export const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch(() => {});

// ☁️ Firestore DB
export const db = getFirestore(app);