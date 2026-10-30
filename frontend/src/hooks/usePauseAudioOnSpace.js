import { useEffect } from 'react';

const INTERACTIVE_TARGET_SELECTOR = 'input, textarea, select, button, a[href], [role="button"], [contenteditable="true"]';

export default function usePauseAudioOnSpace(audioRef, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event) => {
      if ((event.key !== ' ' && event.code !== 'Space') || event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      if (target instanceof Element && (target.isContentEditable || target.closest(INTERACTIVE_TARGET_SELECTOR))) return;

      const audio = audioRef.current;
      if (!audio) return;

      // Reserve Space for pausing on these practice pages. In particular, do not
      // let a focused native audio control use Space to start playback.
      event.preventDefault();
      if (!audio.paused) audio.pause();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [audioRef, enabled]);
}
