import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Briefcase,
  Coins,
  FileText,
  FolderTree,
  Landmark,
  Package,
  Search,
  Settings,
  ShieldCheck,
  Ship,
  X,
} from 'lucide-react';
import { ActiveModule } from '../types/accounting';
import { fuzzyScoreFields, normalizeFuzzyText } from '../lib/fuzzySearch';
import { HighlightedText } from './FuzzyTableSearch';
import { toPersianDigits } from '../lib/format';

type ActionCategory = 'all' | 'invoices' | 'accounting' | 'treasury_fx' | 'inventory' | 'reports' | 'corporate';

interface DashboardActionItem {
  id: string;
  title: string;
  description: string;
  category: Exclude<ActionCategory, 'all'>;
  categoryLabel: string;
  module: ActiveModule;
  intent?: string;
  subKey?: string;
  shortcut?: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
}

const RECENT_ACTIONS_STORAGE_KEY = 'holoo_apex_recent_dashboard_actions_v1';

const CATEGORY_TABS: { id: ActionCategory; label: string }[] = [
  { id: 'all', label: 'همه عملکردها' },
  { id: 'invoices', label: 'فاکتور و فروش' },
  { id: 'accounting', label: 'حسابداری و حسابرسی' },
  { id: 'treasury_fx', label: 'خزانه و ارز' },
  { id: 'inventory', label: 'انبار و نخ' },
  { id: 'reports', label: 'گزارش‌های مالی' },
  { id: 'corporate', label: 'امور شرکتی و پایه' },
];

const DASHBOARD_ACTIONS: DashboardActionItem[] = [
  // Invoices & Commerce
  {
    id: 'inv-sale',
    title: 'صدور فاکتور فروش رسمی و ارزی',
    description: 'ثبت فاکتور چندواحدی (کیلوگرم، کارتن، بوبین) ریالی یا ارزی با سند خودکار و ارسال واتساپ/تلگرام',
    category: 'invoices',
    categoryLabel: 'فاکتور و فروش',
    module: 'invoices',
    intent: 'new-sale',
    subKey: 'inv-sale',
    shortcut: 'F2',
    keywords: 'فروش فاکتور جدید رسمی مودیان ارزی دلار کارتن کیلوگرم بوبین نخ واتساپ تلگرام',
    icon: FileText,
  },
  {
    id: 'inv-purchase',
    title: 'صدور فاکتور خرید و واردات نخ',
    description: 'ورود محموله نخ به انبار با نرخ ریالی یا ارزی و ثبت خودکار سند خرید و انبار',
    category: 'invoices',
    categoryLabel: 'فاکتور و فروش',
    module: 'invoices',
    intent: 'new-purchase',
    subKey: 'inv-purchase',
    shortcut: 'F4',
    keywords: 'خرید واردات فاکتور ورود کالا نخ محموله ارزی یوان دلار درهم',
    icon: FileText,
  },
  {
    id: 'inv-proforma',
    title: 'صدور پیش‌فاکتور و تبدیل به فروش',
    description: 'ایجاد پیش‌فاکتور برای مشتری و تبدیل یک‌کلیک به فاکتور فروش رسمی',
    category: 'invoices',
    categoryLabel: 'فاکتور و فروش',
    module: 'invoices',
    intent: 'new-proforma',
    subKey: 'inv-proforma',
    keywords: 'پیش فاکتور پیشفاکتور استعلام قیمت تبدیل فروش proforma',
    icon: FileText,
  },
  {
    id: 'inv-sale-ret',
    title: 'ثبت فاکتور برگشت از فروش',
    description: 'برگشت کالا به انبار و صدور سند برگشت از فروش و تعدیل بهای تمام‌شده',
    category: 'invoices',
    categoryLabel: 'فاکتور و فروش',
    module: 'invoices',
    intent: 'new-sale-return',
    subKey: 'inv-sale-ret',
    keywords: 'برگشت فروش مرجوعی عودت کالا فاکتور برگشتی',
    icon: FileText,
  },
  {
    id: 'inv-pur-ret',
    title: 'ثبت فاکتور برگشت از خرید',
    description: 'عودت کالا به تأمین‌کننده و اصلاح خودکار موجودی انبار و حساب بستانکاران',
    category: 'invoices',
    categoryLabel: 'فاکتور و فروش',
    module: 'invoices',
    intent: 'new-purchase-return',
    subKey: 'inv-pur-ret',
    keywords: 'برگشت خرید مرجوعی تامین کننده عودت فاکتور',
    icon: FileText,
  },
  {
    id: 'inv-waste',
    title: 'ثبت فاکتور ضایعات و کسری انبار',
    description: 'خروج ضایعات نخ از انبار و ثبت سند هزینه ضایعات',
    category: 'invoices',
    categoryLabel: 'فاکتور و فروش',
    module: 'invoices',
    intent: 'new-waste',
    subKey: 'inv-waste',
    keywords: 'ضایعات افت انبار نخ خسارت خراب کسری',
    icon: FileText,
  },
  {
    id: 'inv-list',
    title: 'آرشیو و جستجوی فاکتورها',
    description: 'مشاهده، چاپ رسمی، فیلتر فازی، ابطال و اشتراک‌گذاری تمام فاکتورها',
    category: 'invoices',
    categoryLabel: 'فاکتور و فروش',
    module: 'invoices',
    subKey: 'inv-list',
    keywords: 'لیست آرشیو مدیریت فاکتورها چاپ ارسال ابطال',
    icon: FileText,
  },
  {
    id: 'inv-designer',
    title: 'طراحی و سفارشی‌سازی قالب فاکتور',
    description: 'تنظیم تعداد واحد فاکتور (۱/۲/۳ واحدی)، انتخاب قالب هلو/مودیان/مدرن و متن پاورقی',
    category: 'invoices',
    categoryLabel: 'فاکتور و فروش',
    module: 'settings',
    intent: 'invoice-designer',
    subKey: 'inv-designer',
    keywords: 'طراحی قالب فاکتور سفارشی سازی لوگو رنگ پاورقی واحد چاپ هلو',
    icon: Settings,
  },
  {
    id: 'comm-imports',
    title: 'پرونده واردات نخ و تسهیم قیمت تمام‌شده (کوتاژ و گمرک)',
    description: 'ثبت پرفورما، تسهیم کرایه حمل، بیمه و حقوق گمرکی بر اساس وزن یا ارزش و سند ترخیص انبار',
    category: 'invoices',
    categoryLabel: 'بازرگانی واردات',
    module: 'commercial',
    intent: 'imports',
    subKey: 'comm-imports',
    keywords: 'واردات پرونده کوتاژ گمرک ترخیص کرایه حمل بیمه قیمت تمام شده landed cost پرفورما چین هند',
    icon: Ship,
  },
  {
    id: 'comm-orders',
    title: 'سفارش فروش، حواله باسکول (±کیلوگرم) و چاپ بارکد کارتن',
    description: 'چرخه ۳ مرحله‌ای سفارش فروش ← توزین باسکول انبار ← تبدیل یک‌کلیک به فاکتور و برچسب بارکد لات',
    category: 'invoices',
    categoryLabel: 'بازرگانی واردات',
    module: 'commercial',
    intent: 'orders',
    subKey: 'comm-orders',
    keywords: 'سفارش فروش حواله خروج انبار باسکول وزن واقعی بارکد برچسب کارتن لات پلاک راننده',
    icon: Ship,
  },
  {
    id: 'comm-subcontract',
    title: 'پیمانکاری رنگرزی و بافندگی (کارمزدی / BOM)',
    description: 'ارسال نخ خام به کارخانه رنگرزی، ثبت افت مجاز، اجرت کارمزد و صدور سند و لات نخ رنگی نهایی',
    category: 'inventory',
    categoryLabel: 'انبار و نخ',
    module: 'commercial',
    intent: 'subcontract',
    subKey: 'comm-subcontract',
    keywords: 'پیمانکاری رنگرزی بافندگی دولاتابی کارمزدی نخ خام افت مجاز اجرت bom',
    icon: Ship,
  },

  // Accounting & Audit
  {
    id: 'voucher-new',
    title: 'صدور سند حسابداری دوبل (ریالی و ارزی)',
    description: 'ثبت سند جدید در سطح کل، معین، تفصیلی و مرکز هزینه با پشتیبانی نرخ برابری ارز',
    category: 'accounting',
    categoryLabel: 'حسابداری و حسابرسی',
    module: 'vouchers',
    intent: 'new-voucher',
    subKey: 'voucher-new',
    shortcut: 'F3',
    keywords: 'سند حسابداری جدید دوبل آرتیکل بدهکار بستانکار ارزی ویرایشگر voucher',
    icon: BookOpen,
  },
  {
    id: 'voucher-list',
    title: 'دفتر روزنامه، اصلاح و مدیریت اسناد',
    description: 'جستجوی فازی اسناد، ویرایش اسناد موقت، سند معکوس و مرتب‌سازی شماره سند',
    category: 'accounting',
    categoryLabel: 'حسابداری و حسابرسی',
    module: 'vouchers',
    subKey: 'voucher-list',
    keywords: 'دفتر روزنامه لیست اسناد اصلاح ویرایش سند معکوس مرتب سازی شماره',
    icon: BookOpen,
  },
  {
    id: 'voucher-drafts',
    title: 'اسناد موقت (نیاز به قطعی‌سازی)',
    description: 'مشاهده و قطعی‌سازی اسناد موقت پیش از بستن دوره و گزارش‌گیری قانونی',
    category: 'accounting',
    categoryLabel: 'حسابداری و حسابرسی',
    module: 'vouchers',
    intent: 'drafts',
    subKey: 'voucher-drafts',
    keywords: 'سند موقت قطعی سازی دائم نهایی کردن پیش نویس',
    icon: BookOpen,
  },
  {
    id: 'opening-voucher',
    title: 'ثبت سند افتتاحیه اول دوره',
    description: 'نقل مانده‌های اول دوره حساب‌ها، صندوق، بانک، موجودی انبار و سرمایه',
    category: 'accounting',
    categoryLabel: 'حسابداری و حسابرسی',
    module: 'vouchers',
    intent: 'new-opening',
    subKey: 'opening-voucher',
    keywords: 'افتتاحیه اول دوره شروع سال مالی نقل مانده',
    icon: BookOpen,
  },
  {
    id: 'audit-center',
    title: 'مرکز حسابرسی هوشمند و کنترل اسناد',
    description: 'اجرای ۹ کنترل حسابرسی، تطبیق کل و تفصیلی، توازن تراز و بررسی ارزش افزوده',
    category: 'accounting',
    categoryLabel: 'حسابداری و حسابرسی',
    module: 'audit',
    subKey: 'audit-center',
    keywords: 'حسابرسی ممیزی کنترل سلامت دفاتر خطا مغایرت audit',
    icon: ShieldCheck,
  },
  {
    id: 'year-closing',
    title: 'بستن حساب‌های موقت و پایان سال مالی',
    description: 'صدور خودکار سند بستن درآمد و هزینه، سود و زیان و انتقال به سود انباشته',
    category: 'accounting',
    categoryLabel: 'حسابداری و حسابرسی',
    module: 'corporate',
    intent: 'closing',
    subKey: 'year-closing',
    keywords: 'بستن حساب پایان سال اختتامیه سود انباشته سال مالی جدید',
    icon: ShieldCheck,
  },

  // Treasury & Multi-Currency
  {
    id: 'tr-cheques',
    title: 'مدیریت چک صیادی و گردش چک',
    description: 'ثبت، واگذاری به بانک، وصول، خرج چک، برگشتی و پیگیری هشدار سررسید چک',
    category: 'treasury_fx',
    categoryLabel: 'خزانه و ارز',
    module: 'treasury',
    intent: 'cheques',
    subKey: 'tr-cheques',
    shortcut: 'F7',
    keywords: 'چک صیادی دریافتی پرداختی وصول خرج برگشتی سررسید خزانه',
    icon: Landmark,
  },
  {
    id: 'tr-quick',
    title: 'دریافت و پرداخت سریع نقد و بانکی',
    description: 'ثبت فوری رسید دریافت از مشتری یا پرداخت به تأمین‌کننده با سند خودکار',
    category: 'treasury_fx',
    categoryLabel: 'خزانه و ارز',
    module: 'treasury',
    intent: 'quick',
    subKey: 'tr-quick',
    keywords: 'دریافت پرداخت سریع نقدی واریز کارتخوان فیش خزانه تسویه',
    icon: Landmark,
  },
  {
    id: 'tr-transfer',
    title: 'انتقال وجه بین صندوق و بانک‌ها',
    description: 'جابه‌جایی موجودی بین حساب‌های بانکی، صندوق مرکزی و شارژ تنخواه‌گردان',
    category: 'treasury_fx',
    categoryLabel: 'خزانه و ارز',
    module: 'treasury',
    intent: 'transfer',
    subKey: 'tr-transfer',
    keywords: 'انتقال وجه بین بانکی صندوق تنخواه جابجایی حساب',
    icon: Landmark,
  },
  {
    id: 'tr-rasgiri',
    title: 'ماشین‌حساب راس‌گیری چک‌ها',
    description: 'محاسبه دقیق تاریخ راس میانگین وزنی چک‌های دریافتی و پرداختی',
    category: 'treasury_fx',
    categoryLabel: 'خزانه و ارز',
    module: 'treasury',
    intent: 'rasgiri',
    subKey: 'tr-rasgiri',
    keywords: 'راس گیری راسگیری چک میانگین تاریخ سررسید محاسبه راس',
    icon: Landmark,
  },
  {
    id: 'currencies-def',
    title: 'تعریف ارزهای پایه و نرخ برابری روزانه',
    description: 'مدیریت ارزها (دلار، یورو، درهم، یوان) و ثبت نرخ برابری روزانه در تابلوی ارز',
    category: 'treasury_fx',
    categoryLabel: 'خزانه و ارز',
    module: 'currencies',
    intent: 'rates',
    subKey: 'currencies-def',
    keywords: 'ارز پایه نرخ برابری روزانه دلار یورو درهم یوان لیر usd eur aed cny نیما مرکز مبادله',
    icon: Coins,
  },
  {
    id: 'tr-fx-rates',
    title: 'مبدل سریع ارزی بر اساس نرخ روز',
    description: 'تبدیل دوطرفه مبلغ ارزی به ریال/تومان مطابق نرخ مؤثر تاریخ شمسی انتخابی',
    category: 'treasury_fx',
    categoryLabel: 'خزانه و ارز',
    module: 'currencies',
    intent: 'converter',
    subKey: 'tr-fx-rates',
    keywords: 'مبدل ارز تبدیل دلار به ریال تومان محاسبه ارز نرخ روز',
    icon: Coins,
  },
  {
    id: 'tr-fx-reval',
    title: 'تسعیر ارز پایان دوره و صورت‌حساب دو ستونه (ارزی/ریالی)',
    description: 'محاسبه سود و زیان تسعیر دارایی‌ها و بدهی‌های ارزی با صدور خودکار سند به حساب ۶۰۹۰۱/۸۰۹۰۱',
    category: 'treasury_fx',
    categoryLabel: 'خزانه و ارز',
    module: 'currencies',
    intent: 'revaluation',
    subKey: 'tr-fx-reval',
    keywords: 'تسعیر ارز سود زیان تسعیر پایان دوره صورتحساب دو ستونه ارزی ریالی ۶۰۹۰۱ ۸۰۹۰۱',
    icon: Coins,
  },
  {
    id: 'tr-reconciliation',
    title: 'مغایرت‌گیری خودکار صورتحساب بانکی (CSV)',
    description: 'بارگذاری فایل بانک، تطبیق خودکار با اسناد دفتر بانک و ثبت یک‌کلیک سند کارمزد یا سود بانکی',
    category: 'treasury_fx',
    categoryLabel: 'خزانه و ارز',
    module: 'treasury',
    intent: 'reconciliation',
    subKey: 'tr-reconciliation',
    keywords: 'مغایرت بانکی مغایرت گیری صورتحساب بانک csv تطبیق کارمزد بانکی',
    icon: Landmark,
  },
  {
    id: 'tr-cheque-print',
    title: 'چاپ کالیبره برگه چک صیادی (مختصات میلی‌متری)',
    description: 'چاپ مستقیم روی برگه فیزیکی چک صیادی با تبدیل مبلغ به حروف فارسی و تنظیم دقیق محور X/Y',
    category: 'treasury_fx',
    categoryLabel: 'خزانه و ارز',
    module: 'treasury',
    intent: 'cheque-print',
    subKey: 'tr-cheque-print',
    keywords: 'چاپ چک برگه چک صیادی کالیبراسیون میلی متر حروف فارسی پرینت چک',
    icon: Landmark,
  },

  // Inventory & Yarn Warehouse
  {
    id: 'inv-products',
    title: 'مدیریت کالاها، نخ‌ها و موجودی انبار',
    description: 'تعریف نخ چندواحدی (کیلوگرم، کارتن، بوبین)، شماره لات، نمره نخ و کشور مبدأ',
    category: 'inventory',
    categoryLabel: 'انبار و نخ',
    module: 'inventory',
    subKey: 'inv-products',
    shortcut: 'F6',
    keywords: 'کالا نخ انبار موجودی کارتن بوبین لات نمره دنیر ویسکوز پلی استر پنبه',
    icon: Package,
  },
  {
    id: 'inv-kardex',
    title: 'کاردکس ریالی و تعدادی کالا',
    description: 'ریز گردش ورود و خروج هر نوع نخ به تفکیک تاریخ، فاکتور و مانده موجودی',
    category: 'inventory',
    categoryLabel: 'انبار و نخ',
    module: 'inventory',
    intent: 'kardex',
    subKey: 'inv-kardex',
    keywords: 'کاردکس گردش کالا ورود خروج انبار ریالی تعدادی تاریخچه نخ',
    icon: Package,
  },
  {
    id: 'inv-stocktaking',
    title: 'انبارگردانی گروهی و سند تعدیل موجودی',
    description: 'ثبت شمارش واقعی باسکول و کارتن انبار با صدور خودکار سند کسری و اضافی',
    category: 'inventory',
    categoryLabel: 'انبار و نخ',
    module: 'inventory',
    intent: 'stocktaking',
    subKey: 'inv-stocktaking',
    keywords: 'انبارگردانی شمارش باسکول تعدیل کسری اضافی اصلاح موجودی',
    icon: Package,
  },
  {
    id: 'inv-bulk-price',
    title: 'تغییر گروهی نرخ خرید و فروش کالاها',
    description: 'افزایش یا کاهش درصدی همزمان قیمت هر کیلوگرم نخ‌ها بر اساس نوسان بازار',
    category: 'inventory',
    categoryLabel: 'انبار و نخ',
    module: 'inventory',
    intent: 'bulk-price',
    subKey: 'inv-bulk-price',
    keywords: 'تغییر گروهی قیمت نرخ فروش خرید افزایش درصدی اپدیت قیمت نخ',
    icon: Package,
  },
  {
    id: 'inv-transfer',
    title: 'حواله انتقال کالا بین انبارها',
    description: 'انتقال محموله نخ بین انبار مرکزی شادآباد، انبار بندرعباس و یزد',
    category: 'inventory',
    categoryLabel: 'انبار و نخ',
    module: 'inventory',
    intent: 'transfer',
    subKey: 'inv-transfer',
    keywords: 'حواله انتقال بین انبارها جابجایی انبار شاداباد بندرعباس یزد',
    icon: Package,
  },

  // Financial Reports
  {
    id: 'rep-trial',
    title: 'تراز آزمایشی ۲ / ۴ / ۶ / ۸ ستونی',
    description: 'مشاهده تراز در سطوح کل و معین با قابلیت جستجو و خروجی CSV و چاپ',
    category: 'reports',
    categoryLabel: 'گزارش‌های مالی',
    module: 'reports',
    intent: 'trial',
    subKey: 'rep-trial',
    shortcut: 'F9',
    keywords: 'تراز آزمایشی دو چهار شش هشت ستونی کل معین گزارش',
    icon: BarChart3,
  },
  {
    id: 'rep-moroor',
    title: 'مرور حساب‌ها (دریل‌داون گروه ← کل ← معین)',
    description: 'پیمایش سلسله‌مراتبی گردش و مانده حساب‌ها با فیلتر بازه تاریخ شمسی',
    category: 'reports',
    categoryLabel: 'گزارش‌های مالی',
    module: 'reports',
    intent: 'moroor',
    subKey: 'rep-moroor',
    keywords: 'مرور حسابها دریل داون سلسله مراتبی گروه کل معین تفصیلی',
    icon: BarChart3,
  },
  {
    id: 'rep-pnl',
    title: 'صورت سود و زیان جامع',
    description: 'محاسبه فروش خالص، بهای تمام‌شده، سود ناخالص، هزینه‌ها و حاشیه سود خالص',
    category: 'reports',
    categoryLabel: 'گزارش‌های مالی',
    module: 'reports',
    intent: 'pnl',
    subKey: 'rep-pnl',
    keywords: 'صورت سود و زیان درآمد هزینه بهای تمام شده حاشیه سود pnl',
    icon: BarChart3,
  },
  {
    id: 'rep-balance',
    title: 'ترازنامه استاندارد حسابداری',
    description: 'نمایش دارایی‌های جاری و غیرجاری، بدهی‌ها، حقوق صاحبان سهام و کنترل توازن',
    category: 'reports',
    categoryLabel: 'گزارش‌های مالی',
    module: 'reports',
    intent: 'balance',
    subKey: 'rep-balance',
    keywords: 'ترازنامه دارایی بدهی سرمایه حقوق صاحبان سهام balance sheet',
    icon: BarChart3,
  },
  {
    id: 'rep-ledger',
    title: 'دفتر کل و معین حساب‌ها',
    description: 'ریز گردش بدهکار، بستانکار و مانده تجمعی هر سرفصل حسابداری',
    category: 'reports',
    categoryLabel: 'گزارش‌های مالی',
    module: 'reports',
    intent: 'ledger',
    subKey: 'rep-ledger',
    keywords: 'دفتر کل معین گردش حساب ریز سند قانونی',
    icon: BarChart3,
  },
  {
    id: 'rep-party',
    title: 'صورتحساب تفصیلی طرف‌حساب (ارسال واتساپ/تلگرام)',
    description: 'مشاهده کامل گردش مشتری/تأمین‌کننده، مانده بدهکار/بستانکار و ارسال مستقیم',
    category: 'reports',
    categoryLabel: 'گزارش‌های مالی',
    module: 'reports',
    intent: 'party-ledger',
    subKey: 'rep-party',
    keywords: 'صورتحساب تفصیلی طرف حساب مشتری تامین کننده واتساپ تلگرام مانده حساب',
    icon: BarChart3,
  },
  {
    id: 'rep-vat',
    title: 'گزارش مالیات بر ارزش افزوده و سامانه مودیان',
    description: 'تفکیک مالیات فروش، مالیات خرید و مانده پرداختنی/بستانکاری ارزش افزوده',
    category: 'reports',
    categoryLabel: 'گزارش‌های مالی',
    module: 'reports',
    intent: 'vat',
    subKey: 'rep-vat',
    keywords: 'ارزش افزوده مالیات مودیان اظهارنامه فصلی vat',
    icon: BarChart3,
  },
  {
    id: 'rep-169',
    title: 'گزارش معاملات فصلی (ماده ۱۶۹)',
    description: 'تجمیع خرید و فروش هر طرف‌حساب با شناسه ملی و کد اقتصادی برای ارسال مالیاتی',
    category: 'reports',
    categoryLabel: 'گزارش‌های مالی',
    module: 'reports',
    intent: 'seasonal-169',
    subKey: 'rep-169',
    keywords: 'معاملات فصلی ماده 169 ۱۶۹ خرید فروش شناسه ملی کد اقتصادی مالیاتی',
    icon: BarChart3,
  },
  {
    id: 'rep-prod-profit',
    title: 'گزارش سود ناخالص کالا و فاکتور',
    description: 'تحلیل سودآوری هر نوع نخ و هر فاکتور فروش به تفکیک وزن و حاشیه سود',
    category: 'reports',
    categoryLabel: 'گزارش‌های مالی',
    module: 'reports',
    intent: 'product-profit',
    subKey: 'rep-prod-profit',
    keywords: 'سود کالا سود فاکتور سودآوری نخ ناخالص تحلیل فروش',
    icon: BarChart3,
  },
  {
    id: 'rep-aging',
    title: 'گزارش سنی مطالبات (۰-۳۰، ۳۱-۶۰، ۶۱-۹۰ و بالای ۹۰ روز)',
    description: 'تفکیک بدهکاران معوق و ارسال مستقیم یادآوری تسویه در واتساپ و تلگرام',
    category: 'reports',
    categoryLabel: 'گزارش‌های مالی',
    module: 'reports',
    intent: 'aging',
    subKey: 'rep-aging',
    keywords: 'گزارش سنی مطالبات بدهکاران معوق پیگیری وصول واتساپ تلگرام aging',
    icon: BarChart3,
  },
  {
    id: 'rep-commissions',
    title: 'محاسبه و ثبت سند پورسانت واسطه‌ها و بازاریابان',
    description: 'گزارش فروش منتسب به هر واسطه نخ و صدور یک‌کلیک سند هزینه پورسانت',
    category: 'reports',
    categoryLabel: 'گزارش‌های مالی',
    module: 'reports',
    intent: 'commissions',
    subKey: 'rep-commissions',
    keywords: 'پورسانت واسطه بازاریاب کارمزد فروش سند پورسانت commission',
    icon: BarChart3,
  },
  {
    id: 'rep-statutory',
    title: 'خروجی‌های رسمی بیمه DSK، مالیات حقوق TTMS و JSON مودیان',
    description: 'تولید استاندارد فایل‌های DSKKAR00/DSKWOR00 تأمین اجتماعی، دیسکت مالیات حقوق و مودیان',
    category: 'reports',
    categoryLabel: 'گزارش‌های مالی',
    module: 'reports',
    intent: 'statutory',
    subKey: 'rep-statutory',
    keywords: 'خروجی بیمه تامین اجتماعی dsk dskkar dskwor مالیات حقوق ttms مودیان json دیسکت',
    icon: BarChart3,
  },

  // Corporate, Base Data & Tools
  {
    id: 'parties',
    title: 'طرف‌حساب‌ها، مشتریان و تأمین‌کنندگان',
    description: 'تعریف و ویرایش اشخاص، سقف اعتبار، شناسه ملی، کد اقتصادی و مانده حساب',
    category: 'corporate',
    categoryLabel: 'امور شرکتی و پایه',
    module: 'parties',
    subKey: 'parties',
    shortcut: 'F5',
    keywords: 'طرف حساب اشخاص مشتری تامین کننده واسطه بازاریاب سقف اعتبار تلفن',
    icon: FolderTree,
  },
  {
    id: 'accounts-all',
    title: 'کدینگ حساب‌ها (گروه، کل، معین)',
    description: 'مشاهده و توسعه درخت حساب‌های هلو، تعریف حساب جدید و بررسی ماهیت حساب',
    category: 'corporate',
    categoryLabel: 'امور شرکتی و پایه',
    module: 'accounts',
    subKey: 'accounts-all',
    keywords: 'کدینگ حساب سرفصل درخت کل معین تعریف حساب',
    icon: FolderTree,
  },
  {
    id: 'accounts-banks',
    title: 'معرفی صندوق، تنخواه و حساب‌های بانکی',
    description: 'مدیریت صندوق مرکزی، تنخواه‌گردان و حساب‌های بانکی شرکت',
    category: 'corporate',
    categoryLabel: 'امور شرکتی و پایه',
    module: 'accounts',
    intent: 'banks-cash',
    subKey: 'accounts-banks',
    keywords: 'صندوق بانک تنخواه حساب بانکی معرفی',
    icon: FolderTree,
  },
  {
    id: 'corp-payroll',
    title: 'حقوق و دستمزد، بیمه ۳۰٪ و فیش حقوقی',
    description: 'محاسبه حقوق پرسنل، لیست بیمه و مالیات حقوق، چاپ فیش و سند پرداخت بانکی',
    category: 'corporate',
    categoryLabel: 'امور شرکتی و پایه',
    module: 'corporate',
    intent: 'payroll',
    subKey: 'corp-payroll',
    shortcut: 'F8',
    keywords: 'حقوق دستمزد پرسنل کارمند فیش حقوقی بیمه مالیات پرداخت حقوق',
    icon: Briefcase,
  },
  {
    id: 'corp-assets',
    title: 'اموال، دارایی ثابت و محاسبه استهلاک',
    description: 'پلاک اموال، محاسبه استهلاک ماهانه و ثبت خودکار سند هزینه استهلاک',
    category: 'corporate',
    categoryLabel: 'امور شرکتی و پایه',
    module: 'corporate',
    intent: 'assets',
    subKey: 'corp-assets',
    keywords: 'اموال دارایی ثابت استهلاک پلاک ماشین آلات تجهیزات',
    icon: Briefcase,
  },
  {
    id: 'corp-cc',
    title: 'مراکز هزینه و تحلیل سود پروژه‌ها',
    description: 'تعریف مراکز هزینه و ردیابی درآمد و هزینه هر واحد عملیاتی یا پروژه',
    category: 'corporate',
    categoryLabel: 'امور شرکتی و پایه',
    module: 'corporate',
    intent: 'costcenters',
    subKey: 'corp-cc',
    keywords: 'مرکز هزینه پروژه واحد عملیاتی تفکیک هزینه',
    icon: Briefcase,
  },
  {
    id: 'tool-studio',
    title: 'استودیو اسناد و کاتالوگ محصولات',
    description: 'نمای بصری کاتالوگ و ابزار اسناد شرکتی',
    category: 'corporate',
    categoryLabel: 'امور شرکتی و پایه',
    module: 'studio',
    subKey: 'tool-studio',
    keywords: 'استودیو کاتالوگ برند اسناد',
    icon: Settings,
  },
  {
    id: 'tool-settings',
    title: 'پشتیبان‌گیری JSON، تنظیمات شرکتی و PWA',
    description: 'تهیه و بازیابی نسخه پشتیبان، ویرایش مشخصات شرکت، سال مالی و نصب اپلیکیشن',
    category: 'corporate',
    categoryLabel: 'امور شرکتی و پایه',
    module: 'settings',
    subKey: 'tool-settings',
    keywords: 'تنظیمات پشتیبان بک آپ بکاپ بازیابی سال مالی مشخصات شرکت pwa',
    icon: Settings,
  },
  {
    id: 'tool-rbac',
    title: 'مدیریت کاربران، نقش‌های دسترسی (RBAC) و تعویض اپراتور',
    description: 'تعریف حسابدار، انباردار، فروش و حسابرس با ماتریس ۸ سطح دسترسی مجزا',
    category: 'corporate',
    categoryLabel: 'امور شرکتی و پایه',
    module: 'settings',
    intent: 'rbac',
    subKey: 'tool-rbac',
    keywords: 'کاربران سطوح دسترسی نقش اپراتور rbac انباردار حسابدار مدیر مالی مجوز',
    icon: ShieldCheck,
  },
  {
    id: 'tool-audit-log',
    title: 'گزارش ممیزی و تاریخچه عملیات کاربران (Audit Log)',
    description: 'مشاهده و خروجی اکسل تمام رویدادها، اسناد و تغییرات ثبت‌شده توسط هر اپراتور',
    category: 'corporate',
    categoryLabel: 'امور شرکتی و پایه',
    module: 'settings',
    intent: 'audit-log',
    subKey: 'tool-audit-log',
    keywords: 'گزارش ممیزی تاریخچه عملیات لاگ کاربران فعالیت اپراتور audit log',
    icon: ShieldCheck,
  },
];

const DEFAULT_PINNED_IDS = [
  'inv-sale',
  'currencies-def',
  'tr-cheques',
  'inv-kardex',
  'rep-trial',
  'audit-center',
];

function loadRecentIds(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_ACTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecentId(id: string): string[] {
  const prev = loadRecentIds();
  const next = [id, ...prev.filter((x) => x !== id)].slice(0, 6);
  try {
    window.localStorage.setItem(RECENT_ACTIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota / private mode failures
  }
  return next;
}

export const DashboardActionSearch: React.FC<{
  onNavigate: (mod: ActiveModule, intent?: string, subKey?: string) => void;
}> = ({ onNavigate }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ActionCategory>('all');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    typeof window !== 'undefined' ? loadRecentIds() : []
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normQuery = normalizeFuzzyText(query);

  const rankedActions = useMemo(() => {
    const pool =
      category === 'all'
        ? DASHBOARD_ACTIONS
        : DASHBOARD_ACTIONS.filter((a) => a.category === category);

    if (!normQuery) {
      return pool.map((item) => ({ item, score: 100, isFuzzy: false }));
    }

    const scored: { item: DashboardActionItem; score: number; isFuzzy: boolean }[] = [];
    for (const item of pool) {
      const res = fuzzyScoreFields(query, [
        { text: item.title, weight: 1.4 },
        { text: item.keywords, weight: 1.15 },
        { text: item.description, weight: 0.9 },
        { text: item.categoryLabel, weight: 0.8 },
        { text: item.shortcut, weight: 1.35 },
      ]);
      if (res.score > 0) {
        scored.push({ item, score: res.score, isFuzzy: res.isFuzzy });
      }
    }

    return scored.sort((a, b) => b.score - a.score);
  }, [query, normQuery, category]);

  const displayedResults = useMemo(() => rankedActions.slice(0, 9), [rankedActions]);

  const quickAccessItems = useMemo(() => {
    const orderedIds = [...recentIds, ...DEFAULT_PINNED_IDS.filter((id) => !recentIds.includes(id))];
    const map = new Map(DASHBOARD_ACTIONS.map((a) => [a.id, a]));
    return orderedIds
      .map((id) => map.get(id))
      .filter((a): a is DashboardActionItem => Boolean(a))
      .slice(0, 6);
  }, [recentIds]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, category, isOpen]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const executeAction = (action: DashboardActionItem) => {
    setRecentIds(saveRecentId(action.id));
    setIsOpen(false);
    setQuery('');
    onNavigate(action.module, action.intent, action.subKey);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((prev) =>
        displayedResults.length > 0 ? (prev + 1) % displayedResults.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((prev) =>
        displayedResults.length > 0
          ? (prev - 1 + displayedResults.length) % displayedResults.length
          : 0
      );
    } else if (e.key === 'Enter' && displayedResults[activeIndex]) {
      e.preventDefault();
      executeAction(displayedResults[activeIndex].item);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <section
      ref={containerRef}
      aria-label="جستجوی فازی عملکردهای نرم‌افزار در داشبورد"
      className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            دسترسی سریع و جستجوی هوشمند عملکردها
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            نام هر ماژول، عملیات حسابداری، کلید میانبر یا حتی بخشی از عبارت را با غلط املایی تایپ کنید تا مستقیماً اجرا شود
          </p>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-code tabular-nums shrink-0">
          {toPersianDigits(DASHBOARD_ACTIONS.length)} عملکرد فعال
        </div>
      </div>

      {/* Main Fuzzy Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-teal-700 dark:text-teal-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="جستجوی فازی عملکردها... (مثلاً: فاکتور ارزی، راسگیری چک، نرخ دلار، کاردکس نخ، ماده ۱۶۹، انبارگردانی، F2)"
          className="w-full pr-10 pl-24 py-2.5 text-sm bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 dark:focus:border-teal-500 transition-colors"
        />
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="پاک کردن جستجو"
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="hidden sm:inline font-code text-[11px] text-slate-400 dark:text-slate-500">
            ↑ ↓ Enter
          </span>
        </div>
      </div>

      {/* Interactive Category Filter Tabs */}
      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {CATEGORY_TABS.map((tab) => {
          const active = category === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setCategory(tab.id);
                setIsOpen(true);
                inputRef.current?.focus();
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100/80 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Quick Recent / Frequent Strip when Dropdown is Closed */}
      {!isOpen && !normQuery && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="text-slate-400 dark:text-slate-500 shrink-0">
            {recentIds.length > 0 ? 'پرکاربرد و اخیر:' : 'دسترسی فوری:'}
          </span>
          {quickAccessItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => executeAction(item)}
              className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-400 font-medium transition-colors whitespace-nowrap"
            >
              <span>{item.title}</span>
              {item.shortcut && (
                <span className="font-code text-[10px] text-slate-400 dark:text-slate-500">
                  ({item.shortcut})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Live Fuzzy Results Panel */}
      {isOpen && (
        <div className="mt-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 overflow-hidden">
          <div className="px-3.5 py-2 bg-slate-50/90 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {normQuery
                ? `${toPersianDigits(rankedActions.length)} عملکرد مطابق «${query.trim()}»`
                : `فهرست عملکردها (${toPersianDigits(rankedActions.length)} مورد)`}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-500 hover:text-slate-900 dark:hover:text-white font-medium"
            >
              بستن فهرست
            </button>
          </div>

          {displayedResults.length === 0 ? (
            <div className="px-4 py-7 text-center text-xs text-slate-500 dark:text-slate-400">
              عملکردی مطابق «{query}» در این دسته یافت نشد. می‌توانید دسته «همه عملکردها» را انتخاب کنید.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
              {displayedResults.map(({ item, isFuzzy }, idx) => {
                const Icon = item.icon;
                const isSelected = idx === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => executeAction(item)}
                    className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-right transition-colors ${
                      isSelected
                        ? 'bg-teal-50/90 dark:bg-teal-950/50'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          isSelected
                            ? 'text-teal-700 dark:text-teal-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-xs sm:text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                          <HighlightedText text={item.title} query={query} />
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          <HighlightedText text={item.description} query={query} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="hidden sm:inline">{item.categoryLabel}</span>
                      {isFuzzy && normQuery && (
                        <>
                          <span className="hidden sm:inline" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-teal-700 dark:text-teal-400 font-medium">
                            پیشنهاد فازی
                          </span>
                        </>
                      )}
                      {item.shortcut && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-code tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                            {item.shortcut}
                          </span>
                        </>
                      )}
                      <ArrowLeft
                        className={`w-3.5 h-3.5 transition-transform ${
                          isSelected
                            ? 'text-teal-700 dark:text-teal-400 -translate-x-0.5'
                            : 'text-slate-400'
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
