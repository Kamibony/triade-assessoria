import { initializeApp } from "firebase/app";
import { getFunctions } from "firebase/functions";

// Configuração padrão mínima para que o getFunctions funcione (mesmo com emuladores)
// Idealmente seria preenchido com process.env.VITE_FIREBASE_API_KEY etc.
const firebaseConfig = {
  apiKey: "demo-api-key",
  authDomain: "demo-project.firebaseapp.com",
  projectId: "demo-project",
  storageBucket: "demo-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};

const app = initializeApp(firebaseConfig);
export const functions = getFunctions(app);
