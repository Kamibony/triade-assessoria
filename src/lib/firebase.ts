import { initializeApp } from "firebase/app";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "triade-assessoria.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "triade-assessoria",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "triade-assessoria.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:abcdef"
};

import { getFirestore } from "firebase/firestore";

const app = initializeApp(firebaseConfig);
export const functions = getFunctions(app, 'us-central1');
export const storage = getStorage(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
