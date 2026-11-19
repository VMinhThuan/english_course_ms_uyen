import { useEffect, useRef } from 'react';
import learningApi from '../api/learningApi.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const IDLE_AFTER_MS = 90_000;

export default function useStudentActivityTracker(user, pathname) {
  const routeRef = useRef(pathname);
  routeRef.current = pathname;
  const userKey = user?.role === 'student' ? String(user._id || user.id || user.email || '') : '';

  useEffect(() => {
    if (!userKey) return undefined;

    let lastInteractionAt = Date.now();
    let disposed = false;
    const markInteraction = () => { lastInteractionAt = Date.now(); };
    const sendHeartbeat = (activeSeconds = 0, forceInactive = false) => {
      if (disposed) return;
      const isVisible = document.visibilityState === 'visible';
      const isActive = !forceInactive && isVisible && Date.now() - lastInteractionAt <= IDLE_AFTER_MS;
      learningApi.sendActivityHeartbeat({
        activeSeconds: isActive ? activeSeconds : 0,
        isActive,
        route: routeRef.current,
      }).catch(() => {
        // Presence and study time resume on the next heartbeat if the network returns.
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') markInteraction();
      sendHeartbeat(0, document.visibilityState !== 'visible');
    };

    const interactionEvents = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
    interactionEvents.forEach((eventName) => window.addEventListener(eventName, markInteraction, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);
    sendHeartbeat(0);
    const intervalId = window.setInterval(() => sendHeartbeat(HEARTBEAT_INTERVAL_MS / 1000), HEARTBEAT_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      interactionEvents.forEach((eventName) => window.removeEventListener(eventName, markInteraction));
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [userKey]);

  useEffect(() => {
    if (userKey && pathname.startsWith('/student')) {
      learningApi.sendActivityHeartbeat({
        activeSeconds: 0,
        isActive: document.visibilityState === 'visible',
        route: pathname,
      }).catch(() => {});
    }
  }, [pathname, userKey]);
}
