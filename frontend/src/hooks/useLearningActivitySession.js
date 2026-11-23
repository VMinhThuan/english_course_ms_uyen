import { useEffect, useRef } from 'react';
import learningApi from '../api/learningApi.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const IDLE_TIMEOUT_MS = 60_000;

const supportedActivity = (pathname) => {
  if (pathname.includes('/lessons/')) return null;
  if (pathname.includes('/student/dashboard') || pathname.includes('/student/history') || pathname.includes('/student/profile') || pathname.includes('/student/my-courses') || pathname.includes('/student/courses')) return null;
  if (pathname.includes('vocabulary') || pathname.includes('flashcards')) return 'vocabulary';
  if (pathname.includes('part-1') || pathname.includes('listening') || pathname.includes('dictation')) return 'listening';
  if (pathname.includes('/part-5')) return 'quiz';
  if (pathname.includes('grammar') || pathname.includes('exercise')) return 'exercise';
  if (pathname.startsWith('/student/tests/') || pathname.startsWith('/student/toeic/attempt/')) return 'assessment';
  if (pathname.includes('challenge') || pathname.includes('quest') || pathname.includes('road-to')) return 'interactive';
  return null;
};

const makeRequestId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function useLearningActivitySession(pathname, enabled = true) {
  const sessionIdRef = useRef(null);
  const bufferRef = useRef(0);

  useEffect(() => {
    const activityType = enabled ? supportedActivity(pathname) : null;
    if (!activityType) return undefined;
    let disposed = false;
    let visible = document.visibilityState === 'visible';
    let lastInteraction = Date.now();
    let lastTick = Date.now();
    let sending = false;
    let starting = false;
    let invalidated = false;

    const touch = () => { lastInteraction = Date.now(); };
    const onVisibility = () => { visible = document.visibilityState === 'visible'; lastTick = Date.now(); if (visible) touch(); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, touch, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);

    const startActivitySession = async () => {
      if (disposed || starting || invalidated || !visible || Date.now() - lastInteraction >= IDLE_TIMEOUT_MS) return;
      starting = true;
      try {
        const response = await learningApi.startActivitySession(activityType, pathname.slice(0, 160));
        if (!disposed) sessionIdRef.current = response?.data?.sessionId || null;
      } catch { /* retry on the next active interval */ }
      finally { starting = false; }
    };
    startActivitySession();

    const tick = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, Math.min(2, Math.round((now - lastTick) / 1000)));
      lastTick = now;
      if (visible && now - lastInteraction < IDLE_TIMEOUT_MS && sessionIdRef.current) bufferRef.current += elapsed;
    }, 1000);
    const heartbeat = window.setInterval(async () => {
      if (!sessionIdRef.current) { startActivitySession(); return; }
      if (bufferRef.current <= 0 || sending) return;
      sending = true;
      const seconds = Math.min(45, bufferRef.current);
      try {
        const response = await learningApi.sendHeartbeat(sessionIdRef.current, seconds, makeRequestId());
        const creditedSeconds = Number(response?.data?.addedSeconds);
        bufferRef.current = Math.max(0, bufferRef.current - (Number.isFinite(creditedSeconds) ? creditedSeconds : seconds));
      } catch (error) {
        const code = error?.response?.data?.code;
        if (code === 'SESSION_NOT_ACTIVE' || code === 'SESSION_NOT_FOUND') {
          invalidated = true;
          sessionIdRef.current = null;
          bufferRef.current = 0;
        } else if (code === 'SESSION_EXPIRED') {
          sessionIdRef.current = null;
          bufferRef.current = 0;
        } else bufferRef.current = Math.min(45, bufferRef.current);
      }
      finally { sending = false; }
    }, HEARTBEAT_INTERVAL_MS);
    const cleanup = () => {
      const current = sessionIdRef.current;
      if (current) learningApi.endSession(current, Math.min(45, bufferRef.current)).catch(() => {});
      sessionIdRef.current = null;
      bufferRef.current = 0;
    };

    return () => {
      disposed = true;
      window.clearInterval(tick);
      window.clearInterval(heartbeat);
      events.forEach((event) => window.removeEventListener(event, touch));
      document.removeEventListener('visibilitychange', onVisibility);
      cleanup();
    };
  }, [pathname, enabled]);
}
