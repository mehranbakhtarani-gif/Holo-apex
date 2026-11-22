import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  onError?: (msg: string) => void;
  label?: string;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  onError,
  label = 'ورودی صوتی فارسی',
  compact = false,
  className = '',
  disabled = false,
}) => {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore cleanup error
      }
    };
  }, []);

  const toggleListening = () => {
    if (disabled) return;

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      onError?.(
        'مرورگر شما از تبدیل گفتار فارسی پشتیبانی نمی‌کند. لطفاً از کروم/اج جدید استفاده کنید یا متن را تایپ نمایید.'
      );
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'fa-IR';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onresult = (ev) => {
        let combined = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const item = ev.results[i];
          if (item && item[0]?.transcript) {
            combined += `${item[0].transcript} `;
          }
        }
        const cleaned = combined.trim();
        if (cleaned) {
          onTranscript(cleaned);
        }
      };

      rec.onerror = (ev) => {
        setListening(false);
        const code = ev?.error || 'unknown';
        if (code === 'not-allowed') {
          onError?.('دسترسی میکروفون مسدود است. لطفاً مجوز میکروفون را در مرورگر فعال کنید.');
        } else if (code !== 'aborted' && code !== 'no-speech') {
          onError?.(`خطا در تشخیص گفتار فارسی (${code}). دوباره تلاش کنید.`);
        }
      };

      rec.onend = () => {
        setListening(false);
      };

      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
      onError?.('امکان شروع ضبط صدا وجود ندارد.');
    }
  };

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      title={listening ? 'توقف ضبط صدا' : 'صحبت به فارسی برای تبدیل خودکار به سند/فاکتور'}
      className={`inline-flex items-center gap-1.5 ${
        compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
      } rounded-lg font-semibold border transition-colors whitespace-nowrap shrink-0 ${
        listening
          ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700'
          : 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50'
      } disabled:opacity-50 ${className}`}
    >
      {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
      <span>{listening ? 'در حال شنیدن... (توقف)' : label}</span>
    </button>
  );
};
