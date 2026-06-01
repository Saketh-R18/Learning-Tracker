// ── auth.js ────────────────────────────────────────────────────
import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const Auth = (() => {
  let _user = null;
  let _profile = null;

  function getUser() { return _user; }
  function getProfile() { return _profile; }

  function init() {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          _user = user;
          await loadProfile();
          resolve(true);
        } else {
          _user = null;
          _profile = null;
          resolve(false);
        }
      });
    });
  }

  async function loadProfile() {
    if (!_user) return;
    const ref = doc(db, 'profiles', _user.uid);
    const snap = await getDoc(ref);
    _profile = snap.exists() ? snap.data() : null;
  }

  async function register(email, password, displayName) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    _user = cred.user;
    await updateProfile(_user, { displayName });
    const ref = doc(db, 'profiles', _user.uid);
    await setDoc(ref, { display_name: displayName, email, created_at: serverTimestamp() });
    _profile = { display_name: displayName, email };
    return _user;
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    _user = cred.user;
    await loadProfile();
    return _user;
  }

  async function logout() {
    await signOut(auth);
    _user = null;
    _profile = null;
  }

  return { init, register, login, logout, getUser, getProfile };
})();
