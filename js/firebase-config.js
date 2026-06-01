// ── Firebase Configuration ─────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtevIopQaFlPQ8tyP4IQkQ1dXlWqexWXc",
  authDomain: "learning-tracker-2d1d5.firebaseapp.com",
  projectId: "learning-tracker-2d1d5",
  storageBucket: "learning-tracker-2d1d5.firebasestorage.app",
  messagingSenderId: "68273792084",
  appId: "1:68273792084:web:e32c46296099d82305b9c1",
  measurementId: "G-9K89KM2T38"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
