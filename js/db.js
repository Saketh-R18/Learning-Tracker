// ── db.js — Firestore database layer ──────────────────────────
import { db } from './firebase-config.js';
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const DB = (() => {

  // ── Topics ──────────────────────────────────────────────────
  async function getTopics(userId) {
    const q = query(collection(db, 'topics'), where('user_id', '==', userId), orderBy('created_at', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function createTopic(userId, name, color, goalHours) {
    const ref = await addDoc(collection(db, 'topics'), {
      user_id: userId, name, color, goal_hours: goalHours || 20, created_at: serverTimestamp()
    });
    return { id: ref.id, user_id: userId, name, color, goal_hours: goalHours || 20 };
  }

  async function deleteTopic(topicId) {
    await deleteDoc(doc(db, 'topics', topicId));
    // delete all sessions for this topic
    const q = query(collection(db, 'sessions'), where('topic_id', '==', topicId));
    const snap = await getDocs(q);
    const dels = snap.docs.map(d => deleteDoc(doc(db, 'sessions', d.id)));
    await Promise.all(dels);
  }

  // ── Sessions ─────────────────────────────────────────────────
  async function startSession(userId, topicId) {
    const ref = await addDoc(collection(db, 'sessions'), {
      user_id: userId, topic_id: topicId,
      started_at: new Date().toISOString(), ended_at: null, duration_seconds: null,
      created_at: serverTimestamp()
    });
    return { id: ref.id, user_id: userId, topic_id: topicId, started_at: new Date().toISOString() };
  }

  async function endSession(sessionId) {
    const ref = doc(db, 'sessions', sessionId);
    const snap = await getDoc(ref);
    const data = snap.data();
    const now = new Date();
    const dur = Math.round((now - new Date(data.started_at)) / 1000);
    await updateDoc(ref, { ended_at: now.toISOString(), duration_seconds: dur });
    return { ...data, id: sessionId, ended_at: now.toISOString(), duration_seconds: dur };
  }

  async function endSessionAt(sessionId, endedAtISO) {
    try {
      const ref = doc(db, 'sessions', sessionId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.ended_at) return; // already ended
      const dur = Math.round((new Date(endedAtISO) - new Date(data.started_at)) / 1000);
      if (dur <= 0) return;
      await updateDoc(ref, { ended_at: endedAtISO, duration_seconds: dur });
    } catch {}
  }

  async function getSessions(userId, topicId) {
    let q;
    if (topicId) {
      q = query(collection(db, 'sessions'), where('user_id', '==', userId), where('topic_id', '==', topicId), orderBy('started_at', 'desc'));
    } else {
      q = query(collection(db, 'sessions'), where('user_id', '==', userId), orderBy('started_at', 'desc'));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ended_at);
  }

  async function getAllOpenSessions(userId) {
    const q = query(collection(db, 'sessions'), where('user_id', '==', userId), where('ended_at', '==', null));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function getTopicStats(userId) {
    const q = query(collection(db, 'sessions'), where('user_id', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.ended_at && s.duration_seconds);
  }

  return { getTopics, createTopic, deleteTopic, startSession, endSession, endSessionAt, getSessions, getAllOpenSessions, getTopicStats };
})();
