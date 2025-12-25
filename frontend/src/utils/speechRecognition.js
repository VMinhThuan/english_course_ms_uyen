/**
 * Speech-to-Text utilities using Web Speech API
 */

let SpeechRecognition = null;
let recognition = null;

if (typeof window !== 'undefined') {
  SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
}

export const startSpeechRecognition = (options = {}) => {
  if (!SpeechRecognition) {
    console.warn('Speech Recognition not supported');
    return null;
  }

  recognition = new SpeechRecognition();
  recognition.lang = options.lang || 'en-US';
  recognition.continuous = options.continuous || false;
  recognition.interimResults = options.interimResults || false;

  return recognition;
};

export const stopSpeechRecognition = () => {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
};

export const isSpeechRecognitionSupported = () => {
  return !!SpeechRecognition;
};

