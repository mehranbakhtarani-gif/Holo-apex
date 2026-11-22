import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, CornerDownLeft, Filter, Search, Sparkles, X } from 'lucide-react';
import {
  fuzzyScoreFields,
  FuzzyMatchKind,
  getHighlightSegments,
  normalizeFuzzyText,
} from '../lib/fuzzySearch';
import { toPersianDigits } from '../lib/format';

export interface FuzzyTableOption {
  id: string;
  code?: string;
  label: string;
  sublabel?: string;
  meta?: string;
  metaTone?: 'default' | 'positive' | 'negative' | 'warning';
  badge?: string;
  /** Extra searchable fields (e.g., taxSerial, line items, bank, dates, amounts) */
  keywords?: string;
}

interface FuzzyTableSearchProps {
  /** All available records mapped to suggestion options */
  options: FuzzyTableOption[];
  /** Controlled search query driving live table filtering */
  query: string;
  /** Called immediately on every keystroke to filter the table live */
  onQueryChange: (nextQuery: string) => void;
  /** Called when user picks a specific suggestion (click or Enter) */
  onSelect: (option: FuzzyTableOption) => void;
  /** Optional callback when user wants to lock-filter the table to a picked item's code/label */
  onFilterByOption?: (option: FuzzyTableOption) => void;
  /** Total records in table (before search filter) for live counter */
  totalCount?: number;
  /** Currently matched records in table (after search filter) for live counter */
  matchedCount?: number;
  placeholder?: string;
  emptyText?: string;
  entityLabel?: string;
  className?: string;
  maxSuggestions?: number;
}

export const HighlightedText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const segments = useMemo(() => getHighlightSegments(text, query), [text, query]);
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark
            key={i}
            className="bg-teal-100 dark:bg-teal-900/70 text-teal-950 dark:text-teal-200 rounded-sm px-0.5 font-bold"
          >
            {seg.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        )
      )}
    </>
  );
};

interface ScoredSuggestion {
  opt: FuzzyTableOption;
  score: number;
  isFuzzy: boolean;
  kind: FuzzyMatchKind;
}

export const FuzzyTableSearch: React.FC<FuzzyTableSearchProps> = ({
  options,
  query,
  onQueryChange,
  onSelect,
  onFilterByOption,
  totalCount,
  matchedCount,
  placeholder = 'جستجوی هوشمند فازی (تایپ اولین کاراکتر، شماره، نام یا مبلغ)...',
  emptyText = 'رکوردی منطبق با عبارت جستجو یافت نشد.',
  entityLabel = 'رکورد',
  className = '',
  maxSuggestions = 8,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const hasQuery = normalizeFuzzyText(query).length > 0;

  const suggestions: ScoredSuggestion[] = useMemo(() => {
    if (!hasQuery) {
      return options.slice(0, maxSuggestions).map((opt) => ({
        opt,
        score: 100,
        isFuzzy: false,
        kind: 'exact' as FuzzyMatchKind,
      }));
    }

    const scored: ScoredSuggestion[] = [];
    for (const opt of options) {
      const res = fuzzyScoreFields(query, [
        { text: opt.code, weight: 1.3 },
        { text: opt.label, weight: 1.15 },
        { text: opt.sublabel, weight: 0.9 },
        { text: opt.meta, weight: 0.75 },
        { text: opt.badge, weight: 0.7 },
        { text: opt.keywords, weight: 0.85 },
      ]);
      if (res.score > 0) {
        scored.push({ opt, score: res.score, isFuzzy: res.isFuzzy, kind: res.kind });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxSuggestions);
  }, [options, query, hasQuery, maxSuggestions]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  const handleSelectItem = (opt: FuzzyTableOption) => {
    onSelect(opt);
    setOpen(false);
  };

  const handleFilterOnly = (opt: FuzzyTableOption) => {
    if (onFilterByOption) {
      onFilterByOption(opt);
    } else {
      onQueryChange(opt.code || opt.label);
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
      setActiveIndex((prev) => (suggestions.length > 0 ? (prev + 1) % suggestions.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        suggestions.length > 0 ? (prev - 1 + suggestions.length) % suggestions.length : 0
      );
    } else if (e.key === 'Enter' && open && suggestions[activeIndex]) {
      e.preventDefault();
      if (e.shiftKey) {
        handleFilterOnly(suggestions[activeIndex].opt);
      } else {
        handleSelectItem(suggestions[activeIndex].opt);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showCounter =
    typeof matchedCount === 'number' && typeof totalCount === 'number' && hasQuery;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        <Search className="absolute right-3 w-4 h-4 text-teal-600 dark:text-teal-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          aria-label={placeholder}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 pr-9 pl-24 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 transition-colors"
        />

        <div className="absolute left-2 flex items-center gap-1.5">
          {showCounter && (
            <span className="font-code tabular-nums text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 border border-teal-200/70 dark:border-teal-800 whitespace-nowrap">
              {toPersianDigits(matchedCount)} / {toPersianDigits(totalCount)}
            </span>
          )}
          {query ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                onQueryChange('');
                inputRef.current?.focus();
              }}
              className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="پاک کردن فیلتر"
              aria-label="پاک کردن فیلتر"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                setOpen((prev) => !prev);
                if (!open) inputRef.current?.focus();
              }}
              className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="باز کردن پیشنهادها"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Live Fuzzy Suggestions Dropdown */}
      {open && (
        <div className="absolute right-0 left-0 mt-1.5 z-50 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
          <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10.5px] text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3 h-3 text-teal-600 dark:text-teal-400" />
              {hasQuery
                ? `پیشنهادهای هوشمند فازی (${toPersianDigits(suggestions.length)} ${entityLabel} برتر)`
                : `دسترسی سریع به آخرین ${entityLabel}ها`}
            </span>
            {showCounter && (
              <span className="font-code text-teal-700 dark:text-teal-400 font-semibold">
                فیلتر زنده جدول: {toPersianDigits(matchedCount)} مورد
              </span>
            )}
          </div>

          {suggestions.length === 0 ? (
            <div className="px-4 py-5 text-center space-y-1">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {emptyText}
              </div>
              <div className="text-[11px] text-slate-400">
                می‌توانید چند کلمه جداگانه (مثل نام طرف‌حساب + شماره) یا حروف اصلی را تایپ کنید.
              </div>
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800" role="listbox">
              {suggestions.map(({ opt, isFuzzy, kind }, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <li
                    key={opt.id}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`flex items-center justify-between gap-2 px-3.5 py-2.5 transition-colors ${
                      isActive
                        ? 'bg-teal-50/90 dark:bg-teal-950/60'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectItem(opt);
                      }}
                      className="flex-1 min-w-0 text-right"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {opt.code && (
                          <span className="font-code text-[11px] font-bold text-teal-700 dark:text-teal-400 shrink-0">
                            <HighlightedText text={opt.code} query={query} />
                          </span>
                        )}
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          <HighlightedText text={opt.label} query={query} />
                        </span>
                        {hasQuery && isFuzzy && (
                          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 shrink-0">
                            {kind === 'typo' ? 'تطابق املایی' : 'تطابق فازی'}
                          </span>
                        )}
                      </div>
                      {opt.sublabel && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          <HighlightedText text={opt.sublabel} query={query} />
                        </div>
                      )}
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      {opt.meta && (
                        <span
                          className={`font-code tabular-nums text-[11px] font-semibold whitespace-nowrap ${
                            opt.metaTone === 'positive'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : opt.metaTone === 'negative'
                                ? 'text-rose-700 dark:text-rose-400'
                                : opt.metaTone === 'warning'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {opt.meta}
                        </span>
                      )}
                      <button
                        type="button"
                        title="فیلتر فوری جدول روی همین رکورد (Shift+Enter)"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFilterOnly(opt);
                        }}
                        className="p-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-teal-700 hover:border-teal-300 dark:hover:text-teal-400 dark:hover:border-teal-700 bg-white dark:bg-slate-900"
                        aria-label="فیلتر جدول روی این رکورد"
                      >
                        <Filter className="w-3 h-3" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="px-3.5 py-1.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <span>جستجوی فازی فارسی و انگلیسی (حساس به اشتباه تایپی و چندکلمه‌ای)</span>
            <span className="font-code flex items-center gap-1.5">
              <span>↑↓ انتخاب</span>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5">
                <CornerDownLeft className="w-2.5 h-2.5" />
                نمایش
              </span>
              <span>·</span>
              <span>Shift+Enter فیلتر</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
