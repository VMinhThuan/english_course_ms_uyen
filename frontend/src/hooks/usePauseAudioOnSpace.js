import { useEffect } from 'react';

const INTERACTIVE_TARGET_SELECTOR = 'input, textarea, select, button, [role="button"], [contenteditable="true"]';

export default function usePauseAudioOnSpace(audioRef, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event) => {
      if ((event.key !== ' ' && event.code !== 'Space') || event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      if (target instanceof Element && (target.isContentEditable || target.closest(INTERACTIVE_TARGET_SELECTOR))) return;

      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) return;

      // A focused navigation link should not make Space scroll past the audio.
      event.preventDefault();
      audio.pause();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [audioRef, enabled]);
}
