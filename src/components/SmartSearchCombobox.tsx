import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import {
  fuzzyScoreFields,
  getHighlightSegments,
  normalizeFuzzyText,
} from '../lib/fuzzySearch';

export interface SmartSearchOption {
  id: string;
  code?: string;
  label: string;
  sublabel?: string;
  meta?: string;
  metaTone?: 'default' | 'positive' | 'negative' | 'warning';
  keywords?: string;
}

export function normalizeSearchText(input: string): string {
  return normalizeFuzzyText(input);
}

const MatchHighlight: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const segs = useMemo(() => getHighlightSegments(text, query), [text, query]);
  return (
    <>
      {segs.map((s, i) =>
        s.match ? (
          <mark
            key={i}
            className="bg-teal-100 dark:bg-teal-900/70 text-teal-950 dark:text-teal-200 rounded-sm px-0.5 font-bold"
          >
            {s.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        )
      )}
    </>
  );
};

interface SmartSearchComboboxProps {
  options: SmartSearchOption[];
  /** Controlled selected option ID (for picker/selector mode). Omit for pure search-and-jump mode. */
  value?: string;
  /** Called whenever user selects an option from the smart dropdown (click or Enter). */
  onSelect: (option: SmartSearchOption) => void;
  /** Optional live search query callback (for filtering a table simultaneously). */
  onQueryChange?: (query: string) => void;
  /** Controlled query string (optional). */
  query?: string;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  compact?: boolean;
  /** If true, keeps the typed text in input (search-bar mode). If false, shows selected option label when blurred (picker mode). */
  mode?: 'search' | 'picker';
  maxSuggestions?: number;
}

export const SmartSearchCombobox: React.FC<SmartSearchComboboxProps> = ({
  options,
  value,
  onSelect,
  onQueryChange,
  query: controlledQuery,
  placeholder = 'جستجوی هوشمند با اولین کاراکتر یا عدد...',
  emptyText = 'موردی مطابق جستجو یافت نشد.',
  className = '',
  compact = false,
  mode = 'search',
  maxSuggestions = 10,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [internalQuery, setInternalQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedOption = useMemo(
    () => (value !== undefined ? options.find((o) => o.id === value) : undefined),
    [options, value]
  );

  const currentQuery = controlledQuery !== undefined ? controlledQuery : internalQuery;

  const setQueryText = (next: string) => {
    if (controlledQuery === undefined) setInternalQuery(next);
    onQueryChange?.(next);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Fuzzy ranking across code, label, sublabel, meta, and keywords
  const rankedSuggestions = useMemo(() => {
    const q = normalizeFuzzyText(currentQuery);
    if (!q) {
      return options.slice(0, maxSuggestions);
    }

    const scored: { opt: SmartSearchOption; score: number }[] = [];
    for (const opt of options) {
      const res = fuzzyScoreFields(q, [
        { text: opt.code, weight: 1.3 },
        { text: opt.label, weight: 1.15 },
        { text: opt.sublabel, weight: 0.85 },
        { text: opt.meta, weight: 0.7 },
        { text: opt.keywords, weight: 0.85 },
      ]);
      if (res.score > 0) {
        scored.push({ opt, score: res.score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxSuggestions).map((s) => s.opt);
  }, [options, currentQuery, maxSuggestions]);

  useEffect(() => {
    setActiveIndex(0);
  }, [currentQuery, open]);

  const commitSelection = (opt: SmartSearchOption) => {
    onSelect(opt);
    if (mode === 'picker') {
      setQueryText('');
    }
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        rankedSuggestions.length > 0 ? (prev + 1) % rankedSuggestions.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        rankedSuggestions.length > 0
          ? (prev - 1 + rankedSuggestions.length) % rankedSuggestions.length
          : 0
      );
    } else if (e.key === 'Enter') {
      if (open && rankedSuggestions[activeIndex]) {
        e.preventDefault();
        commitSelection(rankedSuggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const displayValue =
    mode === 'picker' && !open && selectedOption
      ? selectedOption.code
        ? `${selectedOption.code} — ${selectedOption.label}`
        : selectedOption.label
      : currentQuery;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        <Search
          className={`absolute right-2.5 text-slate-400 pointer-events-none ${
            compact ? 'w-3.5 h-3.5' : 'w-4 h-4'
          }`}
        />
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onFocus={() => {
            setOpen(true);
            if (mode === 'picker') {
              setQueryText('');
            }
          }}
          onChange={(e) => {
            setQueryText(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === 'picker' && selectedOption
              ? selectedOption.code
                ? `${selectedOption.code} — ${selectedOption.label}`
                : selectedOption.label
              : placeholder
          }
          className={`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors ${
            compact ? 'pr-8 pl-7 py-1.5 text-xs' : 'pr-9 pl-8 py-2 text-xs'
          }`}
          autoComplete="off"
        />
        {currentQuery ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setQueryText('');
              inputRef.current?.focus();
            }}
            className="absolute left-2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="پاک کردن جستجو"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setOpen((o) => !o);
              if (!open) inputRef.current?.focus();
            }}
            className="absolute left-2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="نمایش پیشنهادها"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute right-0 left-0 mt-1 z-50 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden max-h-72 overflow-y-auto">
          {rankedSuggestions.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500 text-center">{emptyText}</div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800" role="listbox">
              {rankedSuggestions.map((opt, idx) => {
                const isActive = idx === activeIndex;
                const isSelected = value !== undefined && opt.id === value;
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        commitSelection(opt);
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full text-right px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                        isActive
                          ? 'bg-teal-50 dark:bg-teal-950/60'
                          : isSelected
                            ? 'bg-slate-50 dark:bg-slate-800/60'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {opt.code && (
                            <span className="font-code text-[11px] font-bold text-teal-700 dark:text-teal-400 shrink-0">
                              <MatchHighlight text={opt.code} query={currentQuery} />
                            </span>
                          )}
                          <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            <MatchHighlight text={opt.label} query={currentQuery} />
                          </span>
                        </div>
                        {opt.sublabel && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            <MatchHighlight text={opt.sublabel} query={currentQuery} />
                          </div>
                        )}
                      </div>
                      {opt.meta && (
                        <span
                          className={`font-code tabular-nums text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                            opt.metaTone === 'positive'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : opt.metaTone === 'negative'
                                ? 'text-rose-700 dark:text-rose-400'
                                : opt.metaTone === 'warning'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {opt.meta}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
            <span>جستجوی فازی هلو (اعداد فارسی/انگلیسی و تطابق هوشمند)</span>
            <span className="font-code">↑ ↓ Enter</span>
          </div>
        </div>
      )}
    </div>
  );
};
