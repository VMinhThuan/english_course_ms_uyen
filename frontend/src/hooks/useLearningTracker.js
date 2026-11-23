import { useEffect, useRef } from 'react';
import learningApi from '../api/learningApi.js';
import { resolveApiBaseUrl } from '../api/apiBaseUrl.js';

const IDLE_TIMEOUT_MS = 60 * 1000; // 60 seconds of inactivity = idle
const HEARTBEAT_INTERVAL_MS = 15 * 1000; // send heartbeat every 15 seconds
const TICK_INTERVAL_MS = 1000; // evaluate 1-second active ticks
const makeRequestId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function useLearningTracker({ courseId, lessonId, enabled = true }) {
  const sessionIdRef = useRef(null);
  const bufferRef = useRef(0);
  const lastTickRef = useRef(Date.now());
  const isTabVisibleRef = useRef(!document.hidden);
  const lastInteractionRef = useRef(Date.now());
  const isSendingHeartbeatRef = useRef(false);
  const isStartingSessionRef = useRef(false);
  const sessionInvalidatedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !lessonId) return undefined;

    let isSubscribed = true;
    bufferRef.current = 0;
    sessionInvalidatedRef.current = false;
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
      if (!isSubscribed || isStartingSessionRef.current || sessionInvalidatedRef.current) return;
      isStartingSessionRef.current = true;
      try {
        const response = await learningApi.startSession(lessonId, courseId);
        if (isSubscribed && response?.data?.sessionId) {
          sessionIdRef.current = response.data.sessionId;
          lastTickRef.current = Date.now();
        }
      } catch (err) {
        // Silently fail or retry - learning experience must never be broken
        console.warn('Learning tracker startSession notice:', err?.message || err);
      } finally {
        isStartingSessionRef.current = false;
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
      const isMediaPlaying = [...document.querySelectorAll('audio, video')].some((media) => !media.paused && !media.ended && media.readyState >= 2);

      // Only accumulate time when student is actually present and tab is visible
      if (isVisible && (isUserEngaged || isMediaPlaying) && sessionIdRef.current) {
        bufferRef.current += elapsedSeconds;
      }
    }, TICK_INTERVAL_MS);

    // 5. Periodic heartbeat sender (every 15 seconds)
    const heartbeatInterval = setInterval(async () => {
      const currentSessionId = sessionIdRef.current;
      const secondsToSend = bufferRef.current;

      if (!currentSessionId) {
        if (!sessionInvalidatedRef.current && isTabVisibleRef.current && (Date.now() - lastInteractionRef.current) < IDLE_TIMEOUT_MS) {
          initializeSession();
        }
        return;
      }
      if (secondsToSend <= 0 || isSendingHeartbeatRef.current) {
        return;
      }

      isSendingHeartbeatRef.current = true;
      try {
        const response = await learningApi.sendHeartbeat(currentSessionId, secondsToSend, makeRequestId());
        const creditedSeconds = Number(response?.data?.addedSeconds);
        bufferRef.current = Math.max(0, bufferRef.current - (Number.isFinite(creditedSeconds) ? creditedSeconds : secondsToSend));
      } catch (err) {
        console.warn('Learning tracker heartbeat notice:', err?.message || err);
        const errorCode = err?.response?.data?.code;
        if (errorCode === 'SESSION_NOT_ACTIVE' || errorCode === 'SESSION_NOT_FOUND') {
          // Another tab may own the single active session. Do not restart here
          // and evict the other tab's session again.
          sessionInvalidatedRef.current = true;
          sessionIdRef.current = null;
          bufferRef.current = 0;
        } else if (errorCode === 'SESSION_EXPIRED') {
          sessionIdRef.current = null;
          bufferRef.current = 0;
        } else {
          // On a transient network error, retain only a bounded unsent buffer.
          bufferRef.current = Math.min(45, bufferRef.current);
        }
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
        const token = localStorage.getItem('accessToken');
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: payload,
          keepalive: true,
        }).catch(() => {});
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
