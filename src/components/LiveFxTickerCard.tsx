import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { formatMoney, getTodayShamsi, toPersianDigits } from '../lib/format';
import { ActiveModule } from '../types/accounting';

interface LiveFxItem {
  code: 'USD' | 'EUR' | 'AED' | 'CNY';
  name: string;
  symbol: string;
  priceIrr: number;
  highIrr?: number;
  lowIrr?: number;
  changeIrr: number;
  changePercent: number;
  direction: 'up' | 'down' | 'flat';
  updatedTime: string;
}

interface LiveFxResponse {
  fetchedAt: number;
  source: string;
  sourceUrl: string;
  items: LiveFxItem[];
  cached?: boolean;
  stale?: boolean;
}

const DISPLAY_ORDER: ('USD' | 'CNY' | 'AED' | 'EUR')[] = ['USD', 'CNY', 'AED', 'EUR'];

export const LiveFxTickerCard: React.FC<{
  onNavigate: (mod: ActiveModule, intent?: string, subKey?: string) => void;
}> = ({ onNavigate }) => {
  const { profile, upsertExchangeRate, showToast, logActivity } = useAccounting();
  const [data, setData] = useState<LiveFxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingToErp, setSyncingToErp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRates = useCallback(async (force = false) => {
    try {
      if (force) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const res = await fetch(force ? '/api/live-fx?refresh=1' : '/api/live-fx');
      if (!res.ok) throw new Error('دریافت نرخ زنده ناموفق بود.');
      const json = (await res.json()) as LiveFxResponse;
      if (Array.isArray(json.items) && json.items.length > 0) {
        setData(json);
      } else {
        setError('نرخ لحظه‌ای از منبع دریافت نشد.');
      }
    } catch {
      setError('اتصال به سرور نرخ زنده ارز برقرار نشد.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRates(false);
    const timer = window.setInterval(() => {
      fetchRates(false);
    }, 180_000);
    return () => window.clearInterval(timer);
  }, [fetchRates]);

  const orderedItems = DISPLAY_ORDER.map((code) => data?.items.find((i) => i.code === code)).filter(
    (x): x is LiveFxItem => Boolean(x)
  );

  const handleApplyToSystem = async () => {
    if (orderedItems.length === 0) return;
    setSyncingToErp(true);
    try {
      const today = getTodayShamsi();
      for (const item of orderedItems) {
        await upsertExchangeRate({
          currencyCode: item.code,
          date: today,
          rateToIrr: item.priceIrr,
          rateType: 'market',
          notes: 'همگام‌سازی خودکار از تابلوی زنده chand.app',
        });
      }
      logActivity(
        'ارز و نرخ روز',
        'همگام‌سازی نرخ‌های زنده ارز در سیستم',
        `نرخ دلار، یوان، درهم و یورو بر اساس تابلوی زنده بازار در تاریخ ${today} ذخیره شد.`
      );
      showToast('نرخ لحظه‌ای دلار، یوان، درهم و یورو در تابلوی نرخ روز سیستم ثبت شد.');
    } finally {
      setSyncingToErp(false);
    }
  };

  const unit = profile.currencyUnit;
  const fetchedTimeLabel = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  return (
    <section
      aria-label="تابلوی زنده قیمت روز ارز"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3.5 border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              قیمت لحظه‌ای ارزهای تجاری (دلار، یوان، درهم و یورو)
            </h2>
            <span className="text-xs text-slate-400" aria-hidden="true">
              ·
            </span>
            <a
              href="https://chand.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
            >
              <span>منبع: chand.app</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
            <span>{data?.source || 'بازار آزاد تهران (همگام با chand.app)'}</span>
            {fetchedTimeLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-code tabular-nums">آخرین بروزرسانی: {fetchedTimeLabel}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleApplyToSystem}
            disabled={syncingToErp || orderedItems.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{syncingToErp ? 'در حال ثبت...' : 'اعمال در نرخ امروز سیستم'}</span>
          </button>
          <button
            type="button"
            onClick={() => fetchRates(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>بروزرسانی زنده</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('currencies', 'rates', 'currencies-def')}
            className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline px-1.5 whitespace-nowrap"
          >
            مدیریت ارزها
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
          {DISPLAY_ORDER.map((c) => (
            <div
              key={c}
              className="h-20 rounded-lg bg-slate-100/80 dark:bg-slate-800/60 animate-pulse"
            />
          ))}
        </div>
      ) : error && orderedItems.length === 0 ? (
        <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-rose-700 dark:text-rose-400">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchRates(true)}
            className="font-semibold text-teal-700 dark:text-teal-400 hover:underline"
          >
            تلاش مجدد
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-slate-100 dark:divide-slate-800 pt-3">
          {orderedItems.map((item) => {
            const isUp = item.direction === 'up';
            const isDown = item.direction === 'down';
            return (
              <div
                key={item.code}
                className="py-2.5 sm:py-1 sm:px-4 first:sm:pr-0 last:sm:pl-0 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {item.name}
                  </span>
                  <span className="font-code text-[11px] font-bold text-slate-400">
                    {item.code} ({item.symbol})
                  </span>
                </div>

                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="text-lg font-extrabold font-code tabular-nums text-slate-900 dark:text-white">
                    {formatMoney(item.priceIrr, unit)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-0.5 text-[11px] font-code tabular-nums font-semibold ${
                      isUp
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : isDown
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-slate-500'
                    }`}
                  >
                    {isUp && <ArrowUpRight className="w-3.5 h-3.5" />}
                    {isDown && <ArrowDownRight className="w-3.5 h-3.5" />}
                    <span>
                      {item.changePercent > 0 ? '+' : ''}
                      {toPersianDigits(item.changePercent.toFixed(2))}٪
                    </span>
                  </span>
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-code tabular-nums">
                  {item.lowIrr && item.highIrr ? (
                    <span>
                      بازه: {formatMoney(item.lowIrr, unit, false)} – {formatMoney(item.highIrr, unit, false)}
                    </span>
                  ) : (
                    <span>بازار آزاد</span>
                  )}
                  {item.updatedTime && <span>{toPersianDigits(item.updatedTime)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
