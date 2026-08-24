import { initializeApp } from "firebase/app";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

// Configuração padrão mínima para que o getFunctions funcione (mesmo com emuladores)
// Idealmente seria preenchido com process.env.VITE_FIREBASE_API_KEY etc.
const firebaseConfig = {
  apiKey: "demo-api-key",
  authDomain: "triade-assessoria.firebaseapp.com",
  projectId: "triade-assessoria",
  storageBucket: "triade-assessoria.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};

const app = initializeApp(firebaseConfig);
export const functions = getFunctions(app, 'us-central1');
export const storage = getStorage(app);
