/**
 * Text-to-Speech utilities using Web Speech API
 */

let speechSynthesis = null;
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  speechSynthesis = window.speechSynthesis;
}

export const speakText = (text, options = {}) => {
  if (!speechSynthesis) {
    console.warn('Speech Synthesis not supported');
    return null;
  }

  // Cancel any ongoing speech
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options.lang || 'en-US';
  utterance.rate = options.rate || 1;
  utterance.pitch = options.pitch || 1;
  utterance.volume = options.volume || 1;

  speechSynthesis.speak(utterance);

  return utterance;
};

export const stopSpeaking = () => {
  if (speechSynthesis) {
    speechSynthesis.cancel();
  }
};

export const pauseSpeaking = () => {
  if (speechSynthesis) {
    speechSynthesis.pause();
  }
};

export const resumeSpeaking = () => {
  if (speechSynthesis) {
    speechSynthesis.resume();
  }
};

