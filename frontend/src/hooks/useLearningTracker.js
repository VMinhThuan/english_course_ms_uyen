import { useEffect, useRef } from 'react';
import learningApi from '../api/learningApi.js';
import { resolveApiBaseUrl } from '../api/apiBaseUrl.js';

const IDLE_TIMEOUT_MS = 60 * 1000; // 60 seconds of inactivity = idle
const HEARTBEAT_INTERVAL_MS = 15 * 1000; // send heartbeat every 15 seconds
const TICK_INTERVAL_MS = 1000; // evaluate 1-second active ticks

export default function useLearningTracker({ courseId, lessonId, enabled = true }) {
  const sessionIdRef = useRef(null);
  const bufferRef = useRef(0);
  const lastTickRef = useRef(Date.now());
  const isTabVisibleRef = useRef(!document.hidden);
  const lastInteractionRef = useRef(Date.now());
  const isSendingHeartbeatRef = useRef(false);

  useEffect(() => {
    if (!enabled || !lessonId) return undefined;

    let isSubscribed = true;
    bufferRef.current = 0;
    lastTickRef.current = Date.now();
    lastInteractionRef.current = Date.now();
    isTabVisibleRef.current = !document.hidden;

    // 1. User interaction listener to detect real active engagement
    const handleUserInteraction = () => {
      lastInteractionRef.current = Date.now();
    };

    const interactionEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    interactionEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserInteraction, { passive: true });
    });

    // 2. Tab visibility change listener
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      isTabVisibleRef.current = isVisible;
      lastTickRef.current = Date.now();
      if (isVisible) {
        lastInteractionRef.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. Start learning session on backend
    const initializeSession = async () => {
      try {
        const response = await learningApi.startSession(lessonId, courseId);
        if (isSubscribed && response?.data?.sessionId) {
          sessionIdRef.current = response.data.sessionId;
          lastTickRef.current = Date.now();
        }
      } catch (err) {
        // Silently fail or retry - learning experience must never be broken
        console.warn('Learning tracker startSession notice:', err?.message || err);
      }
    };

    initializeSession();

    // 4. One-second active accumulator ticker
    const tickInterval = setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.max(0, Math.min(2, Math.round((now - lastTickRef.current) / 1000)));
      lastTickRef.current = now;

      const isVisible = isTabVisibleRef.current;
      const isUserEngaged = (now - lastInteractionRef.current) < IDLE_TIMEOUT_MS;

      // Only accumulate time when student is actually present and tab is visible
      if (isVisible && isUserEngaged && sessionIdRef.current) {
        bufferRef.current += elapsedSeconds;
      }
    }, TICK_INTERVAL_MS);

    // 5. Periodic heartbeat sender (every 15 seconds)
    const heartbeatInterval = setInterval(async () => {
      const currentSessionId = sessionIdRef.current;
      const secondsToSend = bufferRef.current;

      if (!currentSessionId || secondsToSend <= 0 || isSendingHeartbeatRef.current) {
        return;
      }

      isSendingHeartbeatRef.current = true;
      try {
        await learningApi.sendHeartbeat(currentSessionId, secondsToSend);
        bufferRef.current = Math.max(0, bufferRef.current - secondsToSend);
      } catch (err) {
        console.warn('Learning tracker heartbeat notice:', err?.message || err);
        // On error, cap the retained buffer to 45 seconds to avoid over-accumulation
        bufferRef.current = Math.min(45, bufferRef.current);
      } finally {
        isSendingHeartbeatRef.current = false;
      }
    }, HEARTBEAT_INTERVAL_MS);

    // 6. Beacon or keepalive finalizer when student leaves the page
    const finalizeSession = () => {
      const currentSessionId = sessionIdRef.current;
      const remainingSeconds = bufferRef.current;

      if (!currentSessionId) return;

      const baseUrl = resolveApiBaseUrl(import.meta.env);
      const url = `${baseUrl}/learning/sessions/end`;
      const payload = JSON.stringify({
        sessionId: currentSessionId,
        activeSeconds: remainingSeconds,
      });

      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
        } else {
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // Ignored on window exit
      }

      sessionIdRef.current = null;
      bufferRef.current = 0;
    };

    window.addEventListener('beforeunload', finalizeSession);
    window.addEventListener('pagehide', finalizeSession);

    // Cleanup on unmount (e.g. user navigates to another lesson or dashboard)
    return () => {
      isSubscribed = false;
      clearInterval(tickInterval);
      clearInterval(heartbeatInterval);

      interactionEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserInteraction);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', finalizeSession);
      window.removeEventListener('pagehide', finalizeSession);

      const activeSession = sessionIdRef.current;
      const remaining = bufferRef.current;
      if (activeSession) {
        learningApi.endSession(activeSession, remaining).catch(() => {});
      }
      sessionIdRef.current = null;
      bufferRef.current = 0;
    };
  }, [courseId, lessonId, enabled]);
}
