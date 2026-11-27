const AUTH_EVENT_STORAGE_KEY = 'english-course-auth-event';
const CHANNEL_NAME = 'english-course-auth';
const seenEventIds = new Set();
let channel = null;

export const AUTH_EVENT_TYPES = Object.freeze({
  LOGIN_COMMITTED: 'LOGIN_COMMITTED',
  LOGOUT_COMMITTED: 'LOGOUT_COMMITTED',
  SESSION_REPLACED: 'SESSION_REPLACED',
});

const decodeTokenPayload = (token) => {
  try {
    const encoded = String(token || '').split('.')[1];
    if (!encoded || typeof globalThis.atob !== 'function') return null;
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(Array.from(globalThis.atob(normalized), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const getSessionIdFromAccessToken = (token) => {
  const sid = decodeTokenPayload(token)?.sid;
  return typeof sid === 'string' && sid ? sid : null;
};

export const getCurrentAccessTokenSessionId = () => (
  typeof localStorage === 'undefined' ? null : getSessionIdFromAccessToken(localStorage.getItem('accessToken'))
);

const normalizeEvent = (event) => {
  if (!event || typeof event !== 'object' || !AUTH_EVENT_TYPES[event.type] || typeof event.eventId !== 'string') return null;
  return { type: event.type, eventId: event.eventId, sessionId: typeof event.sessionId === 'string' ? event.sessionId : null };
};

export const publishAuthEvent = ({ type, sessionId = null } = {}) => {
  if (!AUTH_EVENT_TYPES[type] || typeof window === 'undefined') return;
  const event = { type, sessionId, eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
  try {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('english-course-auth-event', { detail: event }));
    }
  } catch { /* non-browser test/runtime shim */ }
  seenEventIds.add(event.eventId);
  try { (window.localStorage || localStorage).setItem(AUTH_EVENT_STORAGE_KEY, JSON.stringify(event)); } catch { /* storage may be blocked */ }
  try { channel?.postMessage(event); } catch { /* BroadcastChannel may be unavailable */ }
};

export const subscribeAuthEvents = (handler) => {
  if (typeof window === 'undefined') return () => {};
  const deliver = (raw) => {
    const event = normalizeEvent(raw);
    if (!event || seenEventIds.has(event.eventId)) return;
    seenEventIds.add(event.eventId);
    if (seenEventIds.size > 100) seenEventIds.delete(seenEventIds.values().next().value);
    handler(event);
  };
  const onCustom = (event) => deliver(event.detail);
  const onStorage = (event) => {
    if (event.key !== AUTH_EVENT_STORAGE_KEY || !event.newValue) return;
    try { deliver(JSON.parse(event.newValue)); } catch { /* malformed storage event */ }
  };
  window.addEventListener('english-course-auth-event', onCustom);
  window.addEventListener('storage', onStorage);
  let onChannelMessage = null;
  if (typeof window.BroadcastChannel === 'function') {
    if (!channel) channel = new window.BroadcastChannel(CHANNEL_NAME);
    onChannelMessage = (event) => deliver(event.data);
    channel.addEventListener('message', onChannelMessage);
  }
  return () => {
    window.removeEventListener('english-course-auth-event', onCustom);
    window.removeEventListener('storage', onStorage);
    if (onChannelMessage) channel?.removeEventListener('message', onChannelMessage);
  };
};
