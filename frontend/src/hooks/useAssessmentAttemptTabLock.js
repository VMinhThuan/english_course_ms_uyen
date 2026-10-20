import { useCallback, useEffect, useRef, useState } from 'react';

const LOCK_STALE_AFTER_MS = 90_000;
const LOCK_HEARTBEAT_MS = 10_000;

function createTabId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

function readLock(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (!value || typeof value.tabId !== 'string' || !Number.isFinite(Number(value.updatedAt))) return null;
    if (Date.now() - Number(value.updatedAt) > LOCK_STALE_AFTER_MS) return null;
    return value;
  } catch {
    return null;
  }
}

export default function useAssessmentAttemptTabLock(attemptId, enabled = true) {
  const tabIdRef = useRef(null);
  const ownsLockRef = useRef(false);
  if (!tabIdRef.current) tabIdRef.current = createTabId();

  const [isDuplicateTab, setIsDuplicateTab] = useState(false);
  const lockKey = attemptId ? 'english-course:assessment-attempt:' + attemptId : null;

  const writeLock = useCallback(() => {
    if (!lockKey) return false;
    try {
      window.localStorage.setItem(lockKey, JSON.stringify({
        tabId: tabIdRef.current,
        updatedAt: Date.now(),
      }));
      return readLock(lockKey)?.tabId === tabIdRef.current;
    } catch {
      // Keep the attempt usable if browser storage is disabled.
      return true;
    }
  }, [lockKey]);

  const claimLock = useCallback(() => {
    if (!lockKey) return false;
    const current = readLock(lockKey);
    if (current && current.tabId !== tabIdRef.current) return false;
    return writeLock();
  }, [lockKey, writeLock]);

  const takeOverAttempt = useCallback(() => {
    const ownsLock = writeLock();
    ownsLockRef.current = ownsLock;
    setIsDuplicateTab(!ownsLock);
    return ownsLock;
  }, [writeLock]);

  useEffect(() => {
    if (!enabled || !lockKey) {
      setIsDuplicateTab(false);
      return undefined;
    }

    ownsLockRef.current = claimLock();
    setIsDuplicateTab(!ownsLockRef.current);

    const releaseLock = () => {
      try {
        if (readLock(lockKey)?.tabId === tabIdRef.current) {
          window.localStorage.removeItem(lockKey);
        }
      } catch {
        // Ignore storage cleanup failures.
      }
      ownsLockRef.current = false;
    };

    const handleStorage = (event) => {
      if (event.key !== lockKey) return;
      const current = readLock(lockKey);
      if (current && current.tabId !== tabIdRef.current) {
        ownsLockRef.current = false;
        setIsDuplicateTab(true);
      } else if (!current && !ownsLockRef.current) {
        ownsLockRef.current = claimLock();
        setIsDuplicateTab(!ownsLockRef.current);
      }
    };

    const heartbeat = () => {
      if (!ownsLockRef.current) return;
      const current = readLock(lockKey);
      if (current && current.tabId !== tabIdRef.current) {
        ownsLockRef.current = false;
        setIsDuplicateTab(true);
        return;
      }
      ownsLockRef.current = writeLock();
      if (!ownsLockRef.current) setIsDuplicateTab(true);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('pagehide', releaseLock);
    const heartbeatId = window.setInterval(heartbeat, LOCK_HEARTBEAT_MS);

    return () => {
      window.clearInterval(heartbeatId);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('pagehide', releaseLock);
      releaseLock();
    };
  }, [claimLock, enabled, lockKey, writeLock]);

  return { isDuplicateTab, takeOverAttempt };
}
