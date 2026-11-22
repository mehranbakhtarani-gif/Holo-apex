import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Command, Keyboard, Search, X } from 'lucide-react';
import { ActiveModule } from '../types/accounting';
import { useAccounting } from '../context/AccountingContext';
import { formatMoney, formatWeight, toPersianDigits } from '../lib/format';
import { fuzzyScoreFields, normalizeFuzzyText } from '../lib/fuzzySearch';
import { HighlightedText } from './FuzzyTableSearch';

export const HOLOO_SHORTCUTS: { key: string; label: string; module?: ActiveModule; desc: string }[] = [
  { key: 'F1', label: 'راهنمای کلیدهای میانبر', desc: 'باز/بسته کردن پنجره راهنمای کلیدهای میانبر هلو Apex' },
  { key: 'F2', label: 'فاکتور فروش سریع', module: 'invoices', desc: 'ورود مستقیم به فرم صدور فاکتور فروش رسمی و سامانه مودیان' },
  { key: 'F3', label: 'ثبت سند حسابداری', module: 'vouchers', desc: 'باز کردن ویرایشگر سند دوبل حسابداری' },
  { key: 'F4', label: 'فاکتور خرید و انبار', module: 'invoices', desc: 'ورود به بخش صدور فاکتور خرید کالا و ورود به انبار' },
  { key: 'F5', label: 'طرف‌حساب‌ها و اشخاص', module: 'parties', desc: 'مدیریت مشتریان، تأمین‌کنندگان، سقف اعتبار و مانده حساب' },
  { key: 'F6', label: 'انبارداری و کالاها', module: 'inventory', desc: 'تعریف کالا، کاردکس، انبارگردانی و هشدار نقطه سفارش' },
  { key: 'F7', label: 'خزانه‌داری و چک صیادی', module: 'treasury', desc: 'دریافت و پرداخت، مدیریت چک صیادی و ماشین‌حساب راس‌گیری' },
  { key: 'F8', label: 'ماژول‌های شرکتی', module: 'corporate', desc: 'حقوق و دستمزد، دارایی ثابت و استهلاک، مراکز هزینه و بستن حساب' },
  { key: 'F9', label: 'گزارش‌های مالی پیشرفته', module: 'reports', desc: 'تراز آزمایشی ۲/۴/۶ ستونی، سود و زیان، ترازنامه و دفاتر' },
  { key: 'F10', label: 'داشبورد مدیریت مالی', module: 'dashboard', desc: 'نمای مدیریتی نقدینگی، فروش، نمودارها و هشدارهای مالی' },
  { key: 'Ctrl + K', label: 'جستجوی سراسری فرمان‌ها', desc: 'جستجوی فوری در حساب‌ها، کالاها، طرف‌حساب‌ها و منوها' },
  { key: 'Alt + C', label: 'ماشین‌حساب حسابداری', desc: 'باز کردن ماشین‌حساب سریع مالی در هر صفحه' },
  { key: 'Ctrl + P', label: 'چاپ گزارش یا فاکتور', desc: 'چاپ رسمی سند، فاکتور یا گزارش فعال' },
];

export const ShortcutHelpModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onNavigate: (mod: ActiveModule, intent?: string) => void;
}> = ({ open, onClose, onNavigate }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 no-print">
      <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              کلیدهای میانبر استاندارد هلو شرکتی Apex
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="بستن"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {HOLOO_SHORTCUTS.map((sc) => (
            <div
              key={sc.key}
              className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {sc.label}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sc.desc}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {sc.module && (
                  <button
                    onClick={() => {
                      onNavigate(
                        sc.module!,
                        sc.key === 'F2'
                          ? 'new-sale'
                          : sc.key === 'F4'
                            ? 'new-purchase'
                            : sc.key === 'F3'
                              ? 'new-voucher'
                              : undefined
                      );
                      onClose();
                    }}
                    className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
                  >
                    اجرا
                  </button>
                )}
                <kbd className="font-code text-xs font-semibold px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 min-w-[54px] text-center">
                  {sc.key}
                </kbd>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const CommandPaletteModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onNavigate: (mod: ActiveModule, intent?: string) => void;
}> = ({ open, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const { accounts, parties, products, vouchers, cheques, invoices, currencies, profile } =
    useAccounting();

  const results = useMemo(() => {
    const q = normalizeFuzzyText(query);
    const items: {
      title: string;
      subtitle: string;
      category: string;
      score: number;
      isFuzzy?: boolean;
      action: () => void;
    }[] = [];

    const staticCommands: {
      title: string;
      subtitle: string;
      category: string;
      keywords?: string;
      action: () => void;
    }[] = [
      {
        title: 'تعریف ارزهای پایه و نرخ برابری روزانه (USD / EUR / AED / CNY)',
        subtitle: 'ثبت نرخ روز ارز، مدیریت ارزهای پایه و صدور فاکتور و سند حسابداری ارزی',
        category: 'ارزی',
        keywords: 'ارز دلار یورو درهم یوان نرخ برابری روزانه فاکتور ارزی سند ارزی تسعیر usd eur aed cny',
        action: () => onNavigate('currencies', 'rates'),
      },
      {
        title: 'مبدل سریع ارزی (تبدیل مبلغ ارزی به ریال با نرخ روز)',
        subtitle: 'محاسبه معادل ریالی بر اساس تاریخ شمسی و تابلوی نرخ برابری روزانه',
        category: 'ارزی',
        keywords: 'مبدل ارز تبدیل دلار به ریال نرخ روز',
        action: () => onNavigate('currencies', 'converter'),
      },
      {
        title: 'طراحی و سفارشی‌سازی قالب فاکتور، تعداد واحد و چاپ هلو',
        subtitle: 'انتخاب قالب (رسمی مودیان / کلاسیک هلو / مدرن نخ)، ۱/۲/۳ واحدی، رنگ و متن پاورقی',
        category: 'طراحی فاکتور',
        keywords: 'قالب فاکتور طراحی چاپ واتساپ تلگرام کارتن کیلوگرم بوبین',
        action: () => onNavigate('settings', 'invoice-designer'),
      },
      {
        title: 'مرور حساب‌ها (دریل‌داون گروه → کل → معین)',
        subtitle: 'تحلیل سلسله‌مراتبی گردش و مانده حساب‌ها با فیلتر بازه تاریخ',
        category: 'گزارش',
        action: () => onNavigate('reports', 'moroor'),
      },
      {
        title: 'گزارش معاملات فصلی (ماده ۱۶۹)',
        subtitle: 'تجمیع خرید و فروش به تفکیک طرف‌حساب با شناسه ملی و کد اقتصادی',
        category: 'مالیاتی',
        action: () => onNavigate('reports', 'seasonal-169'),
      },
      {
        title: 'مرکز حسابرسی و کنترل اسناد حسابداری',
        subtitle: 'بررسی خودکار ۹ کنترل حسابرسی، تطبیق کل با تفصیلی و ارزش افزوده',
        category: 'حسابرسی',
        action: () => onNavigate('audit'),
      },
      {
        title: 'صدور فاکتور فروش نخ جدید (F2)',
        subtitle: 'ثبت فاکتور رسمی چندواحدی (کارتن/بوبین/کیلوگرم) با سند خودکار',
        category: 'فاکتور',
        action: () => onNavigate('invoices', 'new-sale'),
      },
      {
        title: 'صدور پیش‌فاکتور، برگشت از فروش یا ضایعات',
        subtitle: 'عملیات کامل فاکتورهای بازرگانی و تبدیل پیش‌فاکتور',
        category: 'فاکتور',
        action: () => onNavigate('invoices', 'new-proforma'),
      },
      {
        title: 'ثبت سند حسابداری جدید (F3)',
        subtitle: 'ویرایشگر سند دوبل کل، معین، تفصیلی و مرکز هزینه',
        category: 'حسابداری',
        action: () => onNavigate('vouchers', 'new-voucher'),
      },
      {
        title: 'صدور فاکتور خرید / واردات نخ (F4)',
        subtitle: 'ورود نخ به انبار و ثبت سند خرید و ارزش افزوده',
        category: 'فاکتور',
        action: () => onNavigate('invoices', 'new-purchase'),
      },
      {
        title: 'انبارگردانی گروهی و سند تعدیل کسری/اضافی',
        subtitle: 'شمارش باسکول و کارتن انبار با ثبت سند اتوماتیک اختلاف موجودی',
        category: 'انبار',
        action: () => onNavigate('inventory', 'stocktaking'),
      },
      {
        title: 'تغییر گروهی نرخ خرید و فروش نخ‌ها',
        subtitle: 'افزایش یا کاهش درصدی نرخ هر کیلوگرم نخ‌ها به صورت همزمان',
        category: 'انبار',
        action: () => onNavigate('inventory', 'bulk-price'),
      },
      {
        title: 'حواله انتقال نخ بین انبارها',
        subtitle: 'انتقال موجودی بین انبار شادآباد، بندرعباس و یزد',
        category: 'انبار',
        action: () => onNavigate('inventory', 'transfer'),
      },
      {
        title: 'انتقال وجه بین صندوق و حساب‌های بانکی',
        subtitle: 'ثبت سند انتقال بین بانکی و شارژ تنخواه‌گردان',
        category: 'خزانه',
        action: () => onNavigate('treasury', 'transfer'),
      },
      {
        title: 'تراز آزمایشی ۲/۴/۶/۸ ستونی و سود و زیان (F9)',
        subtitle: 'تراز ۸ ستونی، ترازنامه، دفتر کل و صورتحساب طرف‌حساب',
        category: 'گزارش',
        action: () => onNavigate('reports', 'trial'),
      },
      {
        title: 'صورتحساب تفصیلی طرف‌حساب',
        subtitle: 'گردش ریز بدهکار، بستانکار و ارسال واتساپ/تلگرام',
        category: 'گزارش',
        action: () => onNavigate('reports', 'party-ledger'),
      },
      {
        title: 'سود ناخالص فروش به تفکیک کالا و فاکتور',
        subtitle: 'تحلیل حاشیه سود هر نوع نخ و هر فاکتور فروش',
        category: 'گزارش',
        action: () => onNavigate('reports', 'product-profit'),
      },
      {
        title: 'حقوق و دستمزد، فیش حقوقی و پرداخت بانکی (F8)',
        subtitle: 'لیست بیمه ۳۰٪، مالیات حقوق، چاپ فیش و سند پرداخت بانکی',
        category: 'شرکتی',
        action: () => onNavigate('corporate', 'payroll'),
      },
      {
        title: 'ماشین‌حساب راس‌گیری چک و خزانه‌داری (F7)',
        subtitle: 'مدیریت چک‌های صیادی، خرج چک و دریافت/پرداخت سریع',
        category: 'خزانه',
        action: () => onNavigate('treasury', 'cheques'),
      },
      {
        title: 'پرونده واردات نخ و تسهیم قیمت تمام‌شده (کوتاژ و گمرک)',
        subtitle: 'تسهیم هزینه حمل، بیمه و گمرک بر اساس وزن/ارزش و سند ترخیص انبار',
        category: 'واردات',
        keywords: 'واردات کوتاژ گمرک ترخیص قیمت تمام شده landed cost',
        action: () => onNavigate('commercial', 'imports'),
      },
      {
        title: 'سفارش فروش، حواله باسکول (±کیلوگرم) و بارکد کارتن',
        subtitle: 'ثبت وزن واقعی باسکول، تبدیل به فاکتور رسمی و چاپ لیبل بارکد لات',
        category: 'بازرگانی',
        keywords: 'سفارش فروش باسکول حواله خروج بارکد کارتن لیبل',
        action: () => onNavigate('commercial', 'orders'),
      },
      {
        title: 'پیمانکاری رنگرزی و بافندگی (کارمزدی)',
        subtitle: 'ارسال نخ خام، ثبت افت مجاز و کارمزد و ایجاد لات نخ رنگی نهایی',
        category: 'تولید / رنگرزی',
        keywords: 'رنگرزی بافندگی پیمانکاری کارمزدی افت مجاز',
        action: () => onNavigate('commercial', 'subcontract'),
      },
      {
        title: 'تسعیر ارز پایان دوره و صورت‌حساب دو ستونه (ارزی/ریالی)',
        subtitle: 'محاسبه سود/زیان تسعیر و صدور سند خودکار به حساب ۶۰۹۰۱/۸۰۹۰۱',
        category: 'ارزی',
        keywords: 'تسعیر ارز سود زیان تسعیر دو ستونه ارزی ریالی',
        action: () => onNavigate('currencies', 'revaluation'),
      },
      {
        title: 'مغایرت‌گیری خودکار بانکی (CSV)',
        subtitle: 'تطبیق صورتحساب بانک با دفتر بانک و صدور یک‌کلیک سند کارمزد بانکی',
        category: 'خزانه',
        keywords: 'مغایرت بانکی صورتحساب بانک csv تطبیق',
        action: () => onNavigate('treasury', 'reconciliation'),
      },
      {
        title: 'چاپ کالیبره برگه چک صیادی (میلی‌متر)',
        subtitle: 'تنظیم مختصات X/Y و چاپ مستقیم روی برگه چک صیادی با حروف فارسی',
        category: 'خزانه',
        keywords: 'چاپ چک برگه صیادی کالیبراسیون میلی متر',
        action: () => onNavigate('treasury', 'cheque-print'),
      },
      {
        title: 'گزارش سنی مطالبات (۰ تا +۹۰ روز) و یادآور واتساپ',
        subtitle: 'تفکیک بدهکاران معوق و ارسال مستقیم پیگیری وصول در واتساپ/تلگرام',
        category: 'گزارش',
        keywords: 'گزارش سنی مطالبات معوق بدهکاران aging',
        action: () => onNavigate('reports', 'aging'),
      },
      {
        title: 'پورسانت واسطه‌ها و بازاریابان نخ',
        subtitle: 'محاسبه پورسانت فروش واسطه‌ها و صدور یک‌کلیک سند هزینه پورسانت',
        category: 'گزارش',
        keywords: 'پورسانت واسطه بازاریاب کارمزد فروش',
        action: () => onNavigate('reports', 'commissions'),
      },
      {
        title: 'خروجی‌های قانونی بیمه DSK، مالیات TTMS و JSON مودیان',
        subtitle: 'دانلود استاندارد DSKKAR00/DSKWOR00، دیسکت مالیات حقوق و سامانه مودیان',
        category: 'مالیاتی',
        keywords: 'بیمه dsk ttms مودیان json تامین اجتماعی',
        action: () => onNavigate('reports', 'statutory'),
      },
      {
        title: 'مدیریت کاربران (RBAC) و گزارش ممیزی عملیات',
        subtitle: 'تعیین سطوح دسترسی اپراتورها و مشاهده تاریخچه کامل فعالیت‌ها',
        category: 'امنیت و ممیزی',
        keywords: 'کاربران سطوح دسترسی rbac ممیزی تاریخچه عملیات audit log',
        action: () => onNavigate('settings', 'rbac'),
      },
      {
        title: 'پشتیبان‌گیری JSON و تنظیمات شرکتی',
        subtitle: 'دانلود و بازیابی فایل پشتیبان، سال مالی و نصب PWA',
        category: 'تنظیمات',
        action: () => onNavigate('settings'),
      },
    ];

    if (!q) {
      return staticCommands.slice(0, 12).map((c) => ({ ...c, score: 100 }));
    }

    for (const cmd of staticCommands) {
      const res = fuzzyScoreFields(query, [
        { text: cmd.title, weight: 1.2 },
        { text: cmd.subtitle, weight: 0.9 },
        { text: cmd.category, weight: 0.8 },
        { text: cmd.keywords, weight: 0.85 },
      ]);
      if (res.score > 0) {
        items.push({
          title: cmd.title,
          subtitle: cmd.subtitle,
          category: cmd.category,
          score: res.score,
          isFuzzy: res.isFuzzy,
          action: cmd.action,
        });
      }
    }

    // Vouchers
    vouchers.forEach((v) => {
      const res = fuzzyScoreFields(query, [
        { text: String(v.voucherNumber), weight: 1.45 },
        { text: v.description, weight: 1.2 },
        { text: v.date, weight: 1.0 },
        {
          text: v.lines.map((l) => `${l.accountCode} ${l.accountTitle} ${l.partyName || ''}`).join(' '),
          weight: 0.95,
        },
      ]);
      if (res.score > 0) {
        items.push({
          title: `سند #${toPersianDigits(v.voucherNumber)} — ${v.description}`,
          subtitle: `${toPersianDigits(v.date)} · ${
            v.status === 'permanent' ? 'دائم' : 'موقت'
          } · ${formatMoney(v.totalDebit, profile.currencyUnit)}`,
          category: 'سند',
          score: res.score,
          isFuzzy: res.isFuzzy,
          action: () => onNavigate('vouchers'),
        });
      }
    });

    // Cheques
    cheques.forEach((c) => {
      const res = fuzzyScoreFields(query, [
        { text: c.sayadiId, weight: 1.45 },
        { text: c.serial, weight: 1.3 },
        { text: c.partyName, weight: 1.2 },
        { text: c.bankName, weight: 0.95 },
        { text: c.dueDate, weight: 1.0 },
        { text: String(c.amount), weight: 0.85 },
      ]);
      if (res.score > 0) {
        items.push({
          title: `چک صیادی ${c.sayadiId} — ${c.partyName}`,
          subtitle: `سررسید ${toPersianDigits(c.dueDate)} · ${c.bankName} · ${formatMoney(
            c.amount,
            profile.currencyUnit
          )}`,
          category: 'چک صیادی',
          score: res.score,
          isFuzzy: res.isFuzzy,
          action: () => onNavigate('treasury', 'cheques'),
        });
      }
    });

    // Invoices
    invoices.forEach((inv) => {
      const res = fuzzyScoreFields(query, [
        { text: inv.invoiceNumber, weight: 1.45 },
        { text: inv.partyName, weight: 1.25 },
        { text: inv.taxSerial, weight: 1.1 },
        { text: inv.date, weight: 1.0 },
        {
          text: inv.items.map((it) => `${it.sku} ${it.productName} ${it.lotNumber || ''}`).join(' '),
          weight: 0.95,
        },
      ]);
      if (res.score > 0) {
        items.push({
          title: `فاکتور ${inv.invoiceNumber} — ${inv.partyName}`,
          subtitle: `${toPersianDigits(inv.date)} · ${formatMoney(
            inv.grandTotal,
            profile.currencyUnit
          )}`,
          category: 'فاکتور',
          score: res.score,
          isFuzzy: res.isFuzzy,
          action: () => onNavigate('invoices'),
        });
      }
    });

    // Parties
    parties.forEach((p) => {
      const res = fuzzyScoreFields(query, [
        { text: p.code, weight: 1.3 },
        { text: p.name, weight: 1.25 },
        { text: p.nationalId, weight: 1.05 },
        { text: p.phone, weight: 1.0 },
      ]);
      if (res.score > 0) {
        items.push({
          title: `${toPersianDigits(p.code)} — ${p.name}`,
          subtitle: `${p.nationalId ? `شناسه: ${p.nationalId} · ` : ''}${p.phone || 'بدون تلفن'}`,
          category: 'طرف‌حساب',
          score: res.score,
          isFuzzy: res.isFuzzy,
          action: () => onNavigate('parties'),
        });
      }
    });

    // Textile Yarn Products
    products.forEach((pr) => {
      const res = fuzzyScoreFields(query, [
        { text: pr.sku, weight: 1.35 },
        { text: pr.name, weight: 1.25 },
        { text: pr.yarnCount, weight: 1.15 },
        { text: pr.lotNumber, weight: 1.15 },
        { text: pr.originCountry, weight: 1.0 },
        { text: pr.category, weight: 0.9 },
        { text: pr.warehouse, weight: 0.85 },
      ]);
      if (res.score > 0) {
        items.push({
          title: `${pr.sku} — ${pr.name}`,
          subtitle: `${pr.warehouse}${pr.lotNumber ? ` · لات ${pr.lotNumber}` : ''} · موجودی: ${formatWeight(pr.stock)} ${pr.unit}`,
          category: 'نخ / انبار',
          score: res.score,
          isFuzzy: res.isFuzzy,
          action: () => onNavigate('inventory'),
        });
      }
    });

    // Accounts
    accounts.forEach((a) => {
      const res = fuzzyScoreFields(query, [
        { text: a.code, weight: 1.4 },
        { text: a.title, weight: 1.2 },
      ]);
      if (res.score > 0) {
        items.push({
          title: `${a.code} — ${a.title}`,
          subtitle: `سطح: ${a.level}`,
          category: 'کدینگ',
          score: res.score,
          isFuzzy: res.isFuzzy,
          action: () => onNavigate('accounts'),
        });
      }
    });

    // Currencies
    currencies.forEach((cur) => {
      const res = fuzzyScoreFields(query, [
        { text: cur.code, weight: 1.45 },
        { text: cur.name, weight: 1.3 },
        { text: cur.symbol, weight: 0.9 },
      ]);
      if (res.score > 0) {
        items.push({
          title: `${cur.code} (${cur.symbol}) — ${cur.name}`,
          subtitle: cur.isBase
            ? 'ارز پایه دفاتر قانونی (نرخ برابری ۱)'
            : `نرخ پیش‌فرض: ${toPersianDigits(cur.defaultRateToIrr.toLocaleString('en-US'))} ریال`,
          category: 'ارز',
          score: res.score,
          isFuzzy: res.isFuzzy,
          action: () => onNavigate('currencies', 'rates'),
        });
      }
    });

    return items.sort((a, b) => b.score - a.score).slice(0, 14);
  }, [
    query,
    accounts,
    parties,
    products,
    vouchers,
    cheques,
    invoices,
    currencies,
    profile.currencyUnit,
    onNavigate,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-slate-950/60 p-4 no-print">
      <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-teal-600 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((prev) =>
                  results.length > 0 ? (prev - 1 + results.length) % results.length : 0
                );
              } else if (e.key === 'Enter' && results[activeIndex]) {
                e.preventDefault();
                results[activeIndex].action();
                onClose();
                setQuery('');
              }
            }}
            placeholder="دنبال کدوم سند، چک صیادی، فاکتور، کالا، طرف‌حساب یا منو می‌گردی؟ (اعداد فارسی و انگلیسی)"
            className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {results.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">موردی مطابق جستجو یافت نشد.</div>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  r.action();
                  onClose();
                  setQuery('');
                }}
                className={`w-full flex items-center justify-between gap-4 px-4 py-3 text-right transition-colors ${
                  i === activeIndex
                    ? 'bg-teal-50 dark:bg-teal-950/50'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    <HighlightedText text={r.title} query={query} />
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    <HighlightedText text={r.subtitle} query={query} />
                  </div>
                </div>
                <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 whitespace-nowrap shrink-0">
                  {r.category}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Command className="w-3.5 h-3.5" />
            جستجوی سراسری هوشمند هلو Apex (اسناد، چک‌ها، فاکتورها، انبار و کدینگ)
          </span>
          <span className="font-code">↑ ↓ Enter · Esc</span>
        </div>
      </div>
    </div>
  );
};

export const QuickCalculatorModal: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState<string>('0');

  if (!open) return null;

  const evalExpr = (input: string) => {
    try {
      const cleaned = input.replace(/[^0-9+\-*/().% ]/g, '');
      if (!cleaned.trim()) {
        setResult('0');
        return;
      }
      // Safe arithmetic evaluation using Function on strictly whitelisted math characters
      const val = Function(`"use strict"; return (${cleaned});`)();
      if (typeof val === 'number' && Number.isFinite(val)) {
        setResult(Math.round(val * 100) / 100 + '');
      }
    } catch {
      setResult('خطا');
    }
  };

  const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '000', '.', '+'];

  return (
    <div className="fixed bottom-6 left-6 z-50 w-72 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden no-print">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 text-white">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Calculator className="w-4 h-4 text-teal-400" />
          <span>ماشین‌حساب حسابداری (Alt+C)</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded" aria-label="بستن">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-2.5">
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-left font-code" dir="ltr">
          <input
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') evalExpr(expr);
            }}
            placeholder="0"
            className="w-full bg-transparent text-xs text-slate-500 dark:text-slate-400 focus:outline-none text-right"
          />
          <div className="text-xl font-bold text-slate-900 dark:text-white text-right tabular-nums mt-1">
            {Number(result).toLocaleString('en-US')}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5" dir="ltr">
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => setExpr((prev) => prev + k)}
              className="py-2 rounded-md text-xs font-code font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {k}
            </button>
          ))}
          <button
            onClick={() => {
              setExpr('');
              setResult('0');
            }}
            className="col-span-2 py-2 rounded-md text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
          >
            پاک کردن (C)
          </button>
          <button
            onClick={() => evalExpr(expr)}
            className="col-span-2 py-2 rounded-md text-xs font-semibold bg-teal-700 text-white hover:bg-teal-800"
          >
            محاسبه (=)
          </button>
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          <button
            onClick={() => {
              const num = Number(result);
              if (Number.isFinite(num)) setResult(String(Math.round(num * 1.1)));
            }}
            className="flex-1 py-1.5 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            +۱۰٪ ارزش افزوده
          </button>
          <button
            onClick={() => {
              const num = Number(result);
              if (Number.isFinite(num)) setResult(String(Math.round(num / 1.1)));
            }}
            className="flex-1 py-1.5 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            کسر ۱۰٪ VAT
          </button>
        </div>
      </div>
    </div>
  );
};
