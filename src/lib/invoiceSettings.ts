import { useEffect, useState } from 'react';

export type InvoiceTemplateStyle =
  | 'modern_textile'
  | 'official_tax'
  | 'holoo_classic'
  | 'compact_a5';

export type InvoicePaperSize = 'A4' | 'A5' | 'thermal_80mm';

/**
 * Holoo Multi-Unit Display Mode for Textile Yarn Trade:
 * - 1_unit: فقط وزن (کیلوگرم)
 * - 2_units: وزن (کیلوگرم) + کارتن / عدل
 * - 3_units: وزن (کیلوگرم) + کارتن / عدل + دوک / بوبین
 */
export type InvoiceUnitMode = '1_unit' | '2_units' | '3_units';

export type InvoiceAccentColor = 'teal' | 'navy' | 'emerald' | 'slate' | 'rose';

export interface InvoicePrintSettings {
  template: InvoiceTemplateStyle;
  paperSize: InvoicePaperSize;
  unitDisplayMode: InvoiceUnitMode;
  accentColor: InvoiceAccentColor;
  customTitle: string;
  sellerAddress: string;
  sellerPhone: string;
  bankInfo: string;
  footerTerms: string;
  showSku: boolean;
  showLotAndOrigin: boolean;
  showDiscountColumn: boolean;
  showVatColumn: boolean;
  showPartyBalance: boolean;
  showAmountInWords: boolean;
  showSignatures: boolean;
  showTaxQrBox: boolean;
}

export const DEFAULT_INVOICE_SETTINGS: InvoicePrintSettings = {
  template: 'modern_textile',
  paperSize: 'A4',
  unitDisplayMode: '3_units',
  accentColor: 'teal',
  customTitle: 'صورتحساب رسمی فروش و حواله خروج نخ نساجی',
  sellerAddress: 'تهران، بازار بزرگ، سرای امید و انبار مرکزی نخ شادآباد، بلوک ۳، پلاک ۱۴',
  sellerPhone: '۰۲۱-۶۶۸۴۲۹۱۰ · ۰۹۱۲۳۸۴۷۲۱۰',
  bankInfo: 'بانک ملت (حساب جاری شرکتی) — شبا: IR420120000000001849203112 — به نام شرکت بازرگانی نخ اطلس‌ریس',
  footerTerms:
    'تحویل بار از انبار مرکزی شادآباد با قبض باسکول رسمی انجام می‌شود. اختلاف وزن باسکول تا ۰.۲٪ مطابق عرف بازار نخ مجاز است. خواهشمند است پیش از رنگرزی، نمره و لات روی کارتن‌ها تطبیق داده شود.',
  showSku: true,
  showLotAndOrigin: true,
  showDiscountColumn: true,
  showVatColumn: true,
  showPartyBalance: true,
  showAmountInWords: true,
  showSignatures: true,
  showTaxQrBox: true,
};

const STORAGE_KEY = 'holoo_apex_invoice_settings_v1';
const SYNC_EVENT = 'holoo-invoice-settings-changed';

export function loadInvoiceSettings(): InvoicePrintSettings {
  if (typeof window === 'undefined') return DEFAULT_INVOICE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_INVOICE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<InvoicePrintSettings>;
    return {
      ...DEFAULT_INVOICE_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_INVOICE_SETTINGS;
  }
}

export function saveInvoiceSettings(patch: Partial<InvoicePrintSettings>): InvoicePrintSettings {
  const next = { ...loadInvoiceSettings(), ...patch };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(SYNC_EVENT));
    } catch {
      // Ignore storage quota errors
    }
  }
  return next;
}

export function resetInvoiceSettings(): InvoicePrintSettings {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_INVOICE_SETTINGS));
      window.dispatchEvent(new Event(SYNC_EVENT));
    } catch {
      // Ignore
    }
  }
  return DEFAULT_INVOICE_SETTINGS;
}

export function useInvoiceSettings() {
  const [settings, setSettings] = useState<InvoicePrintSettings>(() => loadInvoiceSettings());

  useEffect(() => {
    const handleSync = () => setSettings(loadInvoiceSettings());
    window.addEventListener(SYNC_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(SYNC_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const updateSettings = (patch: Partial<InvoicePrintSettings>) => {
    const updated = saveInvoiceSettings(patch);
    setSettings(updated);
    return updated;
  };

  const reset = () => {
    const next = resetInvoiceSettings();
    setSettings(next);
    return next;
  };

  return { settings, updateSettings, reset };
}

export const TEMPLATE_LABELS: Record<InvoiceTemplateStyle, { title: string; desc: string }> = {
  modern_textile: {
    title: 'مدرن بازرگانی نخ',
    desc: 'طراحی خوانا با تفکیک وزن/کارتن/بوبین، شماره لات و باکس بانکی',
  },
  official_tax: {
    title: 'رسمی سامانه مودیان',
    desc: 'فرمت استاندارد کادردار سازمان امور مالیاتی با شناسه یکتای مالیاتی',
  },
  holoo_classic: {
    title: 'کلاسیک هلو شرکتی',
    desc: 'چیدمان سنتی و آشنا برای کاربران هلو با مانده قبل و بعد از فاکتور',
  },
  compact_a5: {
    title: 'نیم‌برگ سریع (A5)',
    desc: 'طراحی فشرده و سریع برای چاپ تحویل بار انبار و قبض فروش',
  },
};

export const UNIT_MODE_LABELS: Record<InvoiceUnitMode, { title: string; desc: string }> = {
  '1_unit': {
    title: '۱ واحدی (فقط کیلوگرم)',
    desc: 'نمایش وزن خالص (کیلوگرم) و فی هر کیلو',
  },
  '2_units': {
    title: '۲ واحدی (کارتن/عدل + کیلوگرم)',
    desc: 'نمایش تعداد کارتن/عدل و وزن کل باسکول',
  },
  '3_units': {
    title: '۳ واحدی (کارتن + دوک/بوبین + کیلوگرم)',
    desc: 'کامل‌ترین حالت صنف نخ: کارتن/عدل، تعداد دوک/بوبین و وزن کل',
  },
};

export const PAPER_SIZE_LABELS: Record<InvoicePaperSize, string> = {
  A4: 'برگه کامل A4',
  A5: 'نیم‌برگ A5',
  thermal_80mm: 'فیش پرینتر ۸ سانتی',
};

export const ACCENT_THEMES: Record<
  InvoiceAccentColor,
  { label: string; headerBg: string; border: string; text: string; softBg: string; swatch: string }
> = {
  teal: {
    label: 'سبز فیروزه‌ای',
    headerBg: 'bg-teal-800 text-white',
    border: 'border-teal-700',
    text: 'text-teal-800',
    softBg: 'bg-teal-50',
    swatch: 'bg-teal-700',
  },
  navy: {
    label: 'سرمه‌ای رسمی',
    headerBg: 'bg-blue-950 text-white',
    border: 'border-blue-900',
    text: 'text-blue-900',
    softBg: 'bg-blue-50',
    swatch: 'bg-blue-900',
  },
  emerald: {
    label: 'زمردی بازرگانی',
    headerBg: 'bg-emerald-800 text-white',
    border: 'border-emerald-700',
    text: 'text-emerald-800',
    softBg: 'bg-emerald-50',
    swatch: 'bg-emerald-700',
  },
  slate: {
    label: 'ذغالی مودیان',
    headerBg: 'bg-slate-900 text-white',
    border: 'border-slate-900',
    text: 'text-slate-900',
    softBg: 'bg-slate-100',
    swatch: 'bg-slate-800',
  },
  rose: {
    label: 'زرشکی کلاسیک',
    headerBg: 'bg-rose-900 text-white',
    border: 'border-rose-800',
    text: 'text-rose-900',
    softBg: 'bg-rose-50',
    swatch: 'bg-rose-800',
  },
};
