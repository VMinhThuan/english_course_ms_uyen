import { useEffect } from 'react';

const TEXT_ENTRY_SELECTOR = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [role="textbox"], [contenteditable="true"]';
const BUTTON_TARGET_SELECTOR = 'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]';

export default function usePauseAudioOnSpace(audioRef, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event) => {
      if ((event.key !== ' ' && event.code !== 'Space') || event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      if (target instanceof Element && (target.isContentEditable || target.closest(TEXT_ENTRY_SELECTOR))) return;

      const audio = audioRef.current;
      if (!audio && target instanceof Element && target.closest(BUTTON_TARGET_SELECTOR)) return;

      // Keep Space from scrolling this practice page even when no audio is loaded.
      event.preventDefault();
      if (!audio || event.repeat) return;

      if (audio.paused || audio.ended) {
        if (audio.ended) audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise?.catch) playPromise.catch(() => {});
      } else {
        audio.pause();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [audioRef, enabled]);
}
