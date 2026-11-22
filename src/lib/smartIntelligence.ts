import {
  Account,
  ActiveModule,
  Cheque,
  Invoice,
  InvoiceType,
  Party,
  Product,
  TrialBalanceRow,
  Voucher,
  VoucherLine,
} from '../types/accounting';
import { getTodayShamsi } from './format';

// ---------------- HOLOO APEX 9.6 LOCAL EXTENSION TYPES ----------------

export type DashboardViewMode = 'fast' | 'integrated' | 'classic' | 'favorites';

export type MoadianInvoiceType = 'type1' | 'type2';
export type MoadianPatternCode =
  | 'sales_goods'
  | 'fx_export'
  | 'contracting'
  | 'brokerage'
  | 'service';

export const MOADIAN_PATTERN_LABELS: Record<
  MoadianPatternCode,
  { code: string; label: string; hint: string }
> = {
  sales_goods: {
    code: 'الگوی ۱',
    label: 'فروش کالا و خدمات (عمومی)',
    hint: 'صورتحساب استاندارد فروش داخلی نخ و کالا',
  },
  fx_export: {
    code: 'الگوی ۲',
    label: 'فروش ارزی / صادراتی',
    hint: 'صدور صورتحساب با ارز خارجی و نرخ تسعیر روز',
  },
  contracting: {
    code: 'الگوی ۴',
    label: 'قرارداد پیمانکاری و کارمزدی',
    hint: 'خدمات رنگرزی، بافندگی و پیمانکاری نساجی',
  },
  brokerage: {
    code: 'الگوی ۶',
    label: 'حق‌العملکاری و فروش واسطه‌ای',
    hint: 'فاکتور فروش از طریق حق‌العملکار / کارگزار',
  },
  service: {
    code: 'الگوی ۷',
    label: 'صادرات کالا با کوتاژ گمرکی',
    hint: 'معاف از مالیات ارزش افزوده با کد کوتاژ',
  },
};

export interface ProductApexMeta {
  barcode?: string;
  maxStock?: number;
  wholesalePrice?: number;
  partnerPrice?: number;
  factoryPrice?: number;
  binLocation?: string;
}

export type PriceTierColumn = 'sellPrice' | 'wholesalePrice' | 'partnerPrice' | 'factoryPrice';

export const PRICE_TIER_COLUMN_LABELS: Record<PriceTierColumn, string> = {
  sellPrice: 'نرخ پایه (نقدی)',
  wholesalePrice: 'نرخ عمده‌فروشی',
  partnerPrice: 'نرخ همکار',
  factoryPrice: 'نرخ کارخانه / تیراژ',
};

export interface ReservedInvoiceRow {
  productId: string;
  quantity: number;
  cartonCount: number;
  bobbinCount: number;
  unitPrice: number;
  discount: number;
}

export interface ReservedInvoice {
  id: string;
  label: string;
  savedAt: string;
  invoiceType: InvoiceType;
  date: string;
  partyId: string;
  partyName: string;
  warehouse: string;
  costCenterId: string;
  intermediaryId: string;
  currencyCode: string;
  exchangeRate: number;
  applyVat: boolean;
  moadianType: MoadianInvoiceType;
  moadianPattern: MoadianPatternCode;
  draftItems: ReservedInvoiceRow[];
  paidCash: number;
  paidBank: number;
  paidCheque: number;
  estimatedTotalIrr: number;
  note?: string;
}

// ---------------- LOCALSTORAGE KEYS & HELPERS ----------------

const KEY_VIEW_MODE = 'holoo_apex96_dashboard_mode';
const KEY_FAVORITES = 'holoo_apex96_favorite_menus';
const KEY_PRODUCT_META = 'holoo_apex96_product_meta_v1';
const KEY_RESERVED_INVOICES = 'holoo_apex96_reserved_invoices_v1';

export const DEFAULT_FAVORITE_KEYS: string[] = [
  'inv-sale',
  'inv-purchase',
  'voucher-new',
  'voucher-cartable',
  'tr-cheques',
  'tr-quick',
  'inv-kardex',
  'comm-imports',
  'rep-moroor',
  'rep-vat',
];

export function loadDashboardViewMode(): DashboardViewMode {
  try {
    const raw = localStorage.getItem(KEY_VIEW_MODE);
    if (raw === 'fast' || raw === 'integrated' || raw === 'classic' || raw === 'favorites') {
      return raw;
    }
  } catch {
    // ignore
  }
  return 'integrated';
}

export function saveDashboardViewMode(mode: DashboardViewMode): void {
  try {
    localStorage.setItem(KEY_VIEW_MODE, mode);
  } catch {
    // ignore
  }
}

export function loadFavoriteMenus(): string[] {
  try {
    const raw = localStorage.getItem(KEY_FAVORITES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((x): x is string => typeof x === 'string');
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_FAVORITE_KEYS;
}

export function saveFavoriteMenus(keys: string[]): void {
  try {
    localStorage.setItem(KEY_FAVORITES, JSON.stringify(keys));
  } catch {
    // ignore
  }
}

export function loadProductApexMetaMap(): Record<string, ProductApexMeta> {
  try {
    const raw = localStorage.getItem(KEY_PRODUCT_META);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, ProductApexMeta>;
    }
  } catch {
    // ignore
  }
  return {};
}

export function saveProductApexMeta(productKey: string, meta: ProductApexMeta): Record<string, ProductApexMeta> {
  const current = loadProductApexMetaMap();
  const next = {
    ...current,
    [productKey]: {
      ...current[productKey],
      ...meta,
    },
  };
  try {
    localStorage.setItem(KEY_PRODUCT_META, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function loadReservedInvoices(): ReservedInvoice[] {
  try {
    const raw = localStorage.getItem(KEY_RESERVED_INVOICES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ReservedInvoice[];
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveReservedInvoices(items: ReservedInvoice[]): void {
  try {
    localStorage.setItem(KEY_RESERVED_INVOICES, JSON.stringify(items));
  } catch {
    // ignore
  }
}

// ---------------- SMART DETERMINISTIC INTELLIGENCE ENGINE ----------------

/**
 * Generates an EAN-13 style numeric barcode seeded from SKU or timestamp.
 */
export function generateSmartBarcode(sku: string): string {
  const digits = sku
    .toUpperCase()
    .split('')
    .map((ch) => (ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) % 10)))
    .join('');
  const body = `626${digits}${Date.now().toString().slice(-6)}`.slice(0, 12).padEnd(12, '0');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(body[i]) || 0;
    sum += i % 2 === 0 ? n : n * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${body}${check}`;
}

export function generateSmartSku(category: string, existingProducts: Product[]): string {
  const prefix = category.includes('DTY')
    ? 'DTY'
    : category.includes('پنبه')
      ? 'CTN'
      : category.includes('اسپاندکس')
        ? 'SPX'
        : category.includes('ویسکوز')
          ? 'VIS'
          : category.includes('FDY')
            ? 'FDY'
            : 'YRN';
  const maxSeq = existingProducts.reduce((max, p) => {
    const m = p.sku.match(/(\d+)$/);
    const n = m ? Number(m[1]) : 0;
    return n > max ? n : max;
  }, 100);
  return `YRN-${prefix}-${maxSeq + 1}`;
}

/**
 * Converts Shamsi YYYY/MM/DD to approximate day index for fast horizon projection.
 */
function shamsiToRoughDayIndex(shamsi: string): number {
  const parts = shamsi.split('/').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0;
  const [y, m, d] = parts;
  const monthDays = m <= 6 ? (m - 1) * 31 : 6 * 31 + (m - 7) * 30;
  return y * 365 + monthDays + d;
}

export interface LiquidityHorizonPoint {
  horizonDays: 7 | 14 | 30;
  label: string;
  receivableInflow: number;
  payableOutflow: number;
  projectedBalance: number;
  hasDeficit: boolean;
  deficitAmount: number;
}

export interface CashFlowRadarReport {
  currentLiquidity: number;
  horizons: LiquidityHorizonPoint[];
  earliestDeficitDate: string | null;
  earliestDeficitAmount: number;
  upcomingPayableCount: number;
  upcomingReceivableCount: number;
  bouncedChequesTotal: number;
  riskLevel: 'safe' | 'watch' | 'critical';
}

export function computeCashFlowLiquidityRadar(params: {
  currentLiquidity: number;
  cheques: Cheque[];
  todayShamsi?: string;
}): CashFlowRadarReport {
  const today = params.todayShamsi || getTodayShamsi();
  const todayIdx = shamsiToRoughDayIndex(today);
  const activeCheques = params.cheques.filter(
    (c) => c.status === 'in_box' || c.status === 'deposited'
  );
  const bouncedChequesTotal = params.cheques
    .filter((c) => c.status === 'bounced')
    .reduce((s, c) => s + c.amount, 0);

  const makeHorizon = (days: 7 | 14 | 30, label: string): LiquidityHorizonPoint => {
    let inflow = 0;
    let outflow = 0;
    for (const c of activeCheques) {
      const diff = shamsiToRoughDayIndex(c.dueDate) - todayIdx;
      if (diff <= days) {
        if (c.direction === 'receivable') inflow += c.amount;
        else outflow += c.amount;
      }
    }
    const projectedBalance = params.currentLiquidity + inflow - outflow;
    return {
      horizonDays: days,
      label,
      receivableInflow: inflow,
      payableOutflow: outflow,
      projectedBalance,
      hasDeficit: projectedBalance < 0,
      deficitAmount: projectedBalance < 0 ? Math.abs(projectedBalance) : 0,
    };
  };

  const horizons: LiquidityHorizonPoint[] = [
    makeHorizon(7, '۷ روز آینده'),
    makeHorizon(14, '۱۴ روز آینده'),
    makeHorizon(30, '۳۰ روز آینده'),
  ];

  // Chronological daily running check for earliest liquidity gap
  const sortedCheques = [...activeCheques]
    .filter((c) => shamsiToRoughDayIndex(c.dueDate) - todayIdx <= 30)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  let running = params.currentLiquidity;
  let earliestDeficitDate: string | null = null;
  let earliestDeficitAmount = 0;

  for (const ch of sortedCheques) {
    running += ch.direction === 'receivable' ? ch.amount : -ch.amount;
    if (running < 0 && !earliestDeficitDate) {
      earliestDeficitDate = ch.dueDate;
      earliestDeficitAmount = Math.abs(running);
    }
  }

  const upcomingPayableCount = sortedCheques.filter((c) => c.direction === 'payable').length;
  const upcomingReceivableCount = sortedCheques.filter((c) => c.direction === 'receivable').length;

  const riskLevel: 'safe' | 'watch' | 'critical' =
    earliestDeficitDate || bouncedChequesTotal > 0
      ? 'critical'
      : horizons[2].projectedBalance < params.currentLiquidity * 0.35
        ? 'watch'
        : 'safe';

  return {
    currentLiquidity: params.currentLiquidity,
    horizons,
    earliestDeficitDate,
    earliestDeficitAmount,
    upcomingPayableCount,
    upcomingReceivableCount,
    bouncedChequesTotal,
    riskLevel,
  };
}

export interface ProductSmartForecast {
  productId: string;
  soldKgTotal: number;
  avgDailyVelocityKg: number;
  daysUntilStockout: number | null; // null if no sales velocity
  suggestedReorderKg: number;
  grossMarginPct: number;
  status: 'critical' | 'reorder' | 'healthy' | 'slow_moving';
}

export function computeInventoryIntelligence(
  products: Product[],
  invoices: Invoice[]
): Map<string, ProductSmartForecast> {
  const soldByProduct = new Map<string, number>();
  const validSales = invoices.filter(
    (inv) => inv.invoiceType === 'sale' && inv.status !== 'cancelled'
  );
  for (const inv of validSales) {
    for (const item of inv.items) {
      soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + item.quantity);
    }
  }

  const map = new Map<string, ProductSmartForecast>();
  for (const p of products) {
    const soldKgTotal = Math.round((soldByProduct.get(p.id) ?? 0) * 100) / 100;
    // Assume active sales window of ~60 days for realistic yarn turnover
    const avgDailyVelocityKg = soldKgTotal > 0 ? soldKgTotal / 60 : 0;
    const daysUntilStockout =
      avgDailyVelocityKg > 0 ? Math.max(0, Math.round(p.stock / avgDailyVelocityKg)) : null;
    const targetBufferKg = Math.max(p.reorderPoint * 2.2, Math.round(avgDailyVelocityKg * 45));
    const suggestedReorderKg =
      p.stock <= p.reorderPoint || (daysUntilStockout !== null && daysUntilStockout <= 14)
        ? Math.max(0, Math.round(targetBufferKg - p.stock))
        : 0;
    const grossMarginPct =
      p.sellPrice > 0 ? Math.round(((p.sellPrice - p.buyPrice) / p.sellPrice) * 1000) / 10 : 0;

    let status: ProductSmartForecast['status'] = 'healthy';
    if (p.stock <= 0 || (daysUntilStockout !== null && daysUntilStockout <= 7)) {
      status = 'critical';
    } else if (p.stock <= p.reorderPoint || (daysUntilStockout !== null && daysUntilStockout <= 20)) {
      status = 'reorder';
    } else if (soldKgTotal === 0 && p.stock > p.reorderPoint * 3) {
      status = 'slow_moving';
    }

    map.set(p.id, {
      productId: p.id,
      soldKgTotal,
      avgDailyVelocityKg,
      daysUntilStockout,
      suggestedReorderKg,
      grossMarginPct,
      status,
    });
  }
  return map;
}

export interface PartyRiskProfile {
  balance: number;
  creditUtilizationPct: number;
  bouncedChequesCount: number;
  bouncedChequesTotal: number;
  openCreditInvoices: number;
  riskLevel: 'low' | 'medium' | 'high';
  warnings: string[];
}

export function computePartyInvoiceIntelligence(params: {
  party: Party | undefined;
  partyBalance: number;
  invoices: Invoice[];
  cheques: Cheque[];
  pendingCreditAmount?: number;
}): PartyRiskProfile {
  const { party, partyBalance, invoices, cheques, pendingCreditAmount = 0 } = params;
  if (!party) {
    return {
      balance: 0,
      creditUtilizationPct: 0,
      bouncedChequesCount: 0,
      bouncedChequesTotal: 0,
      openCreditInvoices: 0,
      riskLevel: 'low',
      warnings: [],
    };
  }

  const projected = partyBalance + pendingCreditAmount;
  const creditUtilizationPct =
    party.creditLimit > 0 ? Math.round((Math.max(0, projected) / party.creditLimit) * 100) : 0;

  const bounced = cheques.filter((c) => c.partyId === party.id && c.status === 'bounced');
  const bouncedChequesTotal = bounced.reduce((s, c) => s + c.amount, 0);
  const openCreditInvoices = invoices.filter(
    (inv) =>
      inv.partyId === party.id &&
      inv.invoiceType === 'sale' &&
      inv.status === 'issued' &&
      inv.creditAmount > 0
  ).length;

  const warnings: string[] = [];
  if (bounced.length > 0) {
    warnings.push(`${bounced.length} فقره چک برگشتی تسویه‌نشده دارد.`);
  }
  if (party.creditLimit > 0 && projected > party.creditLimit) {
    warnings.push(`مانده جدید از سقف اعتبار (${creditUtilizationPct}٪) فراتر می‌رود.`);
  } else if (party.creditLimit > 0 && creditUtilizationPct >= 80) {
    warnings.push(`مصرف سقف اعتبار مشتری به ${creditUtilizationPct}٪ رسیده است.`);
  }

  const riskLevel: 'low' | 'medium' | 'high' =
    bounced.length > 0 || (party.creditLimit > 0 && projected > party.creditLimit)
      ? 'high'
      : creditUtilizationPct >= 80 || openCreditInvoices >= 4
        ? 'medium'
        : 'low';

  return {
    balance: partyBalance,
    creditUtilizationPct,
    bouncedChequesCount: bounced.length,
    bouncedChequesTotal,
    openCreditInvoices,
    riskLevel,
    warnings,
  };
}

/**
 * Returns the last unit price (IRR) sold to (or bought from) a specific party for a specific product.
 */
export function getLastPriceForPartyProduct(
  partyId: string,
  productId: string,
  invoiceType: InvoiceType,
  invoices: Invoice[]
): { unitPrice: number; date: string; invoiceNumber: string } | null {
  const targetType: InvoiceType =
    invoiceType === 'purchase' || invoiceType === 'purchase_return' ? 'purchase' : 'sale';

  const matching = invoices
    .filter(
      (inv) =>
        inv.partyId === partyId &&
        inv.invoiceType === targetType &&
        inv.status !== 'cancelled' &&
        inv.items.some((it) => it.productId === productId)
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const inv of matching) {
    const it = inv.items.find((x) => x.productId === productId);
    if (it && it.unitPrice > 0) {
      return { unitPrice: it.unitPrice, date: inv.date, invoiceNumber: inv.invoiceNumber };
    }
  }
  return null;
}

export interface VoucherSmartWarning {
  severity: 'warning' | 'info';
  message: string;
}

export function detectVoucherAnomalies(params: {
  date: string;
  lines: VoucherLine[];
  totalDebit: number;
  vouchers: Voucher[];
  accounts: Account[];
  editingVoucherId: string | null;
}): VoucherSmartWarning[] {
  const warnings: VoucherSmartWarning[] = [];
  const { date, lines, totalDebit, vouchers, accounts, editingVoucherId } = params;

  if (totalDebit > 0) {
    const possibleDup = vouchers.find(
      (v) =>
        v.id !== editingVoucherId &&
        v.date === date &&
        v.totalDebit === totalDebit &&
        v.lines.length === lines.length
    );
    if (possibleDup) {
      warnings.push({
        severity: 'warning',
        message: `هشدار تکراری احتمالی: سند شماره #${possibleDup.voucherNumber} در همین تاریخ با مبلغ مشابه ثبت شده است.`,
      });
    }
  }

  // Check AR/AP lines missing party
  const missingPartyLines = lines.filter(
    (l) =>
      (l.accountCode.startsWith('103') || l.accountCode.startsWith('301')) &&
      !l.partyId &&
      (l.debit > 0 || l.credit > 0)
  );
  if (missingPartyLines.length > 0) {
    warnings.push({
      severity: 'warning',
      message: `${missingPartyLines.length} آرتیکل روی حساب‌های دریافتنی/پرداختنی (۱۰۳ یا ۳۰۱) بدون انتخاب تفصیلی طرف‌حساب است.`,
    });
  }

  // Check contra-nature unusual postings
  const accMap = new Map(accounts.map((a) => [a.code, a]));
  for (const l of lines) {
    const acc = accMap.get(l.accountCode);
    if (!acc) continue;
    if (acc.category === 'expense' && l.credit > 0) {
      warnings.push({
        severity: 'info',
        message: `حساب هزینه «${acc.title}» بستانکار شده است (فقط در اسناد اصلاحی یا برگشت هزینه مجاز است).`,
      });
      break;
    }
    if (acc.category === 'revenue' && l.debit > 0 && !l.accountCode.startsWith('602')) {
      warnings.push({
        severity: 'info',
        message: `حساب درآمد «${acc.title}» بدهکار شده است (اطمینان حاصل کنید سند اصلاحی یا اختتامیه است).`,
      });
      break;
    }
  }

  return warnings;
}

export interface BulkParsedProductRow {
  sku: string;
  name: string;
  category: string;
  warehouse: string;
  yarnCount: string;
  kgPerCarton: number;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  reorderPoint: number;
  barcode?: string;
}

export function parseBulkProductsCsv(rawText: string): BulkParsedProductRow[] {
  const lines = rawText
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];
  const rows: BulkParsedProductRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const sep = lines[i].includes('\t') ? '\t' : lines[i].includes(';') ? ';' : ',';
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2) continue;
    // Skip header row
    if (
      i === 0 &&
      (cols[0].toLowerCase().includes('sku') ||
        cols[0].includes('کد') ||
        cols[1].includes('نام'))
    ) {
      continue;
    }
    const cleanNum = (s?: string, def = 0) => {
      if (!s) return def;
      const persian = '۰۱۲۳۴۵۶۷۸۹';
      const norm = s
        .split('')
        .map((ch) => {
          const idx = persian.indexOf(ch);
          return idx >= 0 ? String(idx) : ch;
        })
        .join('')
        .replace(/[^0-9.]/g, '');
      const n = Number(norm);
      return Number.isFinite(n) && n >= 0 ? n : def;
    };

    const sku = (cols[0] || `YRN-IMP-${100 + i}`).toUpperCase();
    const name = cols[1] || `کالای واردشده ${i + 1}`;
    const category = cols[2] || 'نخ پلی‌استر DTY';
    const warehouse = cols[3] || 'انبار مرکزی نخ شادآباد';
    const yarnCount = cols[4] || '150/48';
    const kgPerCarton = cleanNum(cols[5], 30) || 30;
    const buyPrice = Math.round(cleanNum(cols[6], 1_800_000));
    const sellPrice = Math.round(cleanNum(cols[7], Math.round(buyPrice * 1.18)));
    const stock = cleanNum(cols[8], 0);
    const reorderPoint = cleanNum(cols[9], 500);
    const barcode = cols[10] || generateSmartBarcode(sku);

    rows.push({
      sku,
      name,
      category,
      warehouse,
      yarnCount,
      kgPerCarton,
      buyPrice,
      sellPrice,
      stock,
      reorderPoint,
      barcode,
    });
  }
  return rows;
}

export function buildCopilotFinancialSnapshot(params: {
  companyName: string;
  fiscalYear: string;
  currencyUnit: 'IRR' | 'IRT';
  liquidity: number;
  netSales: number;
  grossProfit: number;
  netProfit: number;
  grossMarginPct: number;
  netMarginPct: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  trialBalance: TrialBalanceRow[];
  products: Product[];
  parties: Party[];
  partyBalances: Map<string, number>;
  cheques: Cheque[];
  vouchers: Voucher[];
  invoices: Invoice[];
  auditScore: number;
  auditErrors: number;
  auditWarnings: number;
}): Record<string, unknown> {
  const {
    companyName,
    fiscalYear,
    currencyUnit,
    liquidity,
    netSales,
    grossProfit,
    netProfit,
    grossMarginPct,
    netMarginPct,
    totalAssets,
    totalLiabilities,
    totalEquity,
    trialBalance,
    products,
    parties,
    partyBalances,
    cheques,
    vouchers,
    invoices,
    auditScore,
    auditErrors,
    auditWarnings,
  } = params;

  const radar = computeCashFlowLiquidityRadar({ currentLiquidity: liquidity, cheques });
  const lowStock = products
    .filter((p) => p.stock <= p.reorderPoint)
    .slice(0, 8)
    .map((p) => ({ sku: p.sku, name: p.name, stockKg: p.stock, reorderPointKg: p.reorderPoint }));

  const topDebtors = parties
    .map((p) => ({
      name: p.name,
      balanceIrr: partyBalances.get(p.id) ?? 0,
      creditLimitIrr: p.creditLimit,
    }))
    .filter((x) => x.balanceIrr > 0)
    .sort((a, b) => b.balanceIrr - a.balanceIrr)
    .slice(0, 6);

  const topCreditors = parties
    .map((p) => ({
      name: p.name,
      payableIrr: Math.abs(partyBalances.get(p.id) ?? 0),
    }))
    .filter((x) => (partyBalances.get(parties.find((p) => p.name === x.name)?.id ?? '') ?? 0) < 0)
    .sort((a, b) => b.payableIrr - a.payableIrr)
    .slice(0, 5);

  const vatPayableRow = trialBalance.find((r) => r.accountCode === '30301');
  const vatCreditRow = trialBalance.find((r) => r.accountCode === '30302');
  const netVatPayableIrr =
    (vatPayableRow ? vatPayableRow.balanceCredit - vatPayableRow.balanceDebit : 0) -
    (vatCreditRow ? vatCreditRow.balanceDebit - vatCreditRow.balanceCredit : 0);

  return {
    companyName,
    fiscalYear,
    displayUnit: currencyUnit === 'IRT' ? 'تومان (همه اعداد زیر به ریال است؛ هنگام پاسخ به تومان یا ریال شفاف بیان کن)' : 'ریال',
    todayShamsi: getTodayShamsi(),
    financialSummaryIrr: {
      currentCashAndBankIrr: liquidity,
      netSalesIrr: netSales,
      grossProfitIrr: grossProfit,
      netProfitIrr: netProfit,
      grossMarginPct,
      netMarginPct,
      totalAssetsIrr: totalAssets,
      totalLiabilitiesIrr: totalLiabilities,
      totalEquityIrr: totalEquity,
      netVatPayableIrr,
    },
    cashFlowRadar30Days: {
      riskLevel: radar.riskLevel,
      earliestDeficitDate: radar.earliestDeficitDate,
      earliestDeficitAmountIrr: radar.earliestDeficitAmount,
      bouncedChequesTotalIrr: radar.bouncedChequesTotal,
      horizons: radar.horizons.map((h) => ({
        days: h.horizonDays,
        inflowIrr: h.receivableInflow,
        outflowIrr: h.payableOutflow,
        projectedBalanceIrr: h.projectedBalance,
      })),
    },
    counts: {
      vouchersTotal: vouchers.length,
      draftVouchers: vouchers.filter((v) => v.status === 'draft').length,
      invoicesTotal: invoices.length,
      productsTotal: products.length,
      activeCheques: cheques.filter((c) => c.status === 'in_box' || c.status === 'deposited').length,
      bouncedCheques: cheques.filter((c) => c.status === 'bounced').length,
    },
    auditHealth: {
      score: auditScore,
      errors: auditErrors,
      warnings: auditWarnings,
    },
    lowStockProducts: lowStock,
    topDebtors,
    topCreditors,
  };
}

export interface SmartCopilotSuggestedAction {
  label: string;
  module: ActiveModule;
  intent?: string;
}
