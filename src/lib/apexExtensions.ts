import { Cheque, CurrencyUnit, Invoice, Party, Product } from '../types/accounting';
import { formatCompactMoney, formatMoney, formatNumber, getTodayShamsi, toPersianDigits } from './format';

// ---------------- HOLOO APEX 9.6 EXTENDED OPERATIONAL ENTITIES ----------------

export interface PettyCashItem {
  id: string;
  date: string;
  title: string;
  categoryAccountCode: string; // e.g., 80105, 80103, 80102
  categoryTitle: string;
  amountIrr: number;
  vendorName?: string;
  receiptNo?: string;
  status: 'pending' | 'settled';
  settlementVoucherId?: string;
}

export interface RecurringVoucherLineTemplate {
  accountCode: string;
  accountTitle: string;
  partyId?: string;
  partyName?: string;
  description: string;
  debit: number;
  credit: number;
}

export interface RecurringVoucherTemplate {
  id: string;
  title: string;
  dayOfMonth: number; // 1..30
  description: string;
  active: boolean;
  lastIssuedPeriod?: string; // e.g. '1405/03'
  lines: RecurringVoucherLineTemplate[];
}

export interface BankLoanInstallment {
  index: number;
  dueDate: string;
  principalIrr: number;
  interestIrr: number;
  totalIrr: number;
  paid: boolean;
  paidDate?: string;
  voucherId?: string;
}

export interface BankLoan {
  id: string;
  title: string;
  bankName: string;
  bankAccountCode: string; // e.g. 10201
  loanNumber: string;
  startDate: string;
  principalIrr: number;
  annualInterestPct: number;
  installmentCount: number;
  installments: BankLoanInstallment[];
}

export interface YarnDyeLot {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  lotCode: string; // e.g. LOT-2026-A14
  shadeCode: string; // شید رنگ مثلاً RAW-WHITE / NAVY-402
  originCountry?: string;
  warehouse: string;
  arrivalDate: string;
  initialWeightKg: number;
  remainingWeightKg: number;
  cartonCount: number;
  notes?: string;
}

export type WarehouseSlipType =
  | 'receipt'
  | 'dispatch'
  | 'consignment_out'
  | 'consignment_in';

export interface WarehouseSlipItem {
  productId: string;
  sku: string;
  productName: string;
  lotCode?: string;
  weightKg: number;
  cartonCount: number;
}

export interface WarehouseSlip {
  id: string;
  slipNumber: string;
  slipType: WarehouseSlipType;
  date: string;
  warehouse: string;
  partyId?: string;
  partyName: string;
  driverName?: string;
  plateNumber?: string;
  status: 'draft' | 'confirmed';
  items: WarehouseSlipItem[];
  notes?: string;
}

export interface BomIngredient {
  productId: string;
  sku: string;
  productName: string;
  kgPerOutputKg: number; // e.g. 1.04 kg raw per 1 kg finished
}

export interface BomFormula {
  id: string;
  code: string;
  title: string;
  finishedProductId: string;
  finishedProductName: string;
  wastePct: number;
  laborOverheadPerKgIrr: number;
  ingredients: BomIngredient[];
  notes?: string;
}

export interface InstallmentItem {
  index: number;
  dueDate: string;
  amountIrr: number;
  paid: boolean;
  paidDate?: string;
  voucherId?: string;
}

export interface InstallmentPlan {
  id: string;
  planNumber: string;
  invoiceId?: string;
  invoiceNumber?: string;
  partyId: string;
  partyName: string;
  partyPhone?: string;
  startDate: string;
  totalAmountIrr: number;
  downPaymentIrr: number;
  monthlyRatePct: number;
  installments: InstallmentItem[];
  notes?: string;
}

export interface VolumeDiscountRule {
  id: string;
  title: string;
  minWeightKg: number;
  discountPct: number;
  partyId?: string; // Optional specific customer; empty = all customers
  partyName?: string;
  active: boolean;
}

export interface MoadianInvoiceMeta {
  taxId22: string; // 22-character Iranian Moadian Tax ID
  submissionStatus: 'ready' | 'sent' | 'corrected' | 'cancelled';
  subject: 'original' | 'corrective' | 'cancellation' | 'return';
  referenceInvoiceId?: string;
  referenceTaxId22?: string;
  submittedAt?: string;
}

export interface FiscalYearArchive {
  id: string;
  fiscalYear: string;
  archivedAt: string;
  totalSalesIrr: number;
  netProfitIrr: number;
  totalAssetsIrr: number;
  totalLiabilitiesIrr: number;
  totalEquityIrr: number;
  voucherCount: number;
  invoiceCount: number;
  openingVoucherNumber?: number;
  nextFiscalYear: string;
}

export interface DevicePresenceRecord {
  id: string;
  ownerId: string;
  deviceId: string;
  deviceLabel: string;
  operatorName: string;
  activeModule: string;
  editingRecordKey?: string;
  editingRecordLabel?: string;
  lastSeenMs: number;
}

// ---------------- MOADIAN 22-CHAR TAX ID GENERATOR ----------------

export function generateMoadianTaxId22(invoiceNumber: string, dateStr: string, economicCode?: string): string {
  // Authentic 22-character structure: 6-char MemoryID + 5-char HexDate + 10-char HexSerial + 1 check char
  const memRaw = (economicCode || 'A1B2C3').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const memoryId = `A${memRaw}HOLOO`.slice(0, 6);
  const dateDigits = dateStr.replace(/[^0-9]/g, '') || '14050101';
  const dateHex = (parseInt(dateDigits, 10) % 0xfffff).toString(16).toUpperCase().padStart(5, '0');
  let hash = 0;
  const seed = `${invoiceNumber}-${dateStr}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const serialHex = hash.toString(16).toUpperCase().padStart(10, '0').slice(0, 10);
  const body = `${memoryId}${dateHex}${serialHex}`;
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum = (sum + body.charCodeAt(i) * (i + 1)) % 10;
  }
  return `${body}${sum}`;
}

// ---------------- AMORTIZATION & INSTALLMENT HELPERS ----------------

export function addShamsiMonths(shamsiDate: string, monthsToAdd: number): string {
  const parts = shamsiDate.split('/').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return getTodayShamsi();
  }
  let [y, m, d] = parts;
  const totalMonths = (m - 1) + monthsToAdd;
  y += Math.floor(totalMonths / 12);
  m = (totalMonths % 12) + 1;
  const maxDay = m <= 6 ? 31 : m <= 11 ? 30 : 29;
  d = Math.min(d, maxDay);
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
}

export function buildBankLoanSchedule(params: {
  principalIrr: number;
  annualInterestPct: number;
  installmentCount: number;
  startDate: string;
}): BankLoanInstallment[] {
  const count = Math.max(1, Math.min(120, Math.round(params.installmentCount)));
  const monthlyRate = Math.max(0, params.annualInterestPct) / 100 / 12;
  const principal = Math.max(0, Math.round(params.principalIrr));
  let remaining = principal;

  const monthlyPayment =
    monthlyRate > 0
      ? Math.round(
          (principal * monthlyRate * Math.pow(1 + monthlyRate, count)) /
            (Math.pow(1 + monthlyRate, count) - 1)
        )
      : Math.round(principal / count);

  const list: BankLoanInstallment[] = [];
  for (let i = 1; i <= count; i++) {
    const interest = Math.round(remaining * monthlyRate);
    let prin = i === count ? remaining : Math.max(0, monthlyPayment - interest);
    if (prin > remaining) prin = remaining;
    remaining = Math.max(0, remaining - prin);
    list.push({
      index: i,
      dueDate: addShamsiMonths(params.startDate, i),
      principalIrr: prin,
      interestIrr: interest,
      totalIrr: prin + interest,
      paid: false,
    });
  }
  return list;
}

export function buildInstallmentSchedule(params: {
  totalAmountIrr: number;
  downPaymentIrr: number;
  installmentCount: number;
  monthlyRatePct: number;
  startDate: string;
}): InstallmentItem[] {
  const count = Math.max(1, Math.min(60, Math.round(params.installmentCount)));
  const financed = Math.max(0, Math.round(params.totalAmountIrr - params.downPaymentIrr));
  const totalWithFee = Math.round(
    financed * (1 + (Math.max(0, params.monthlyRatePct) / 100) * count)
  );
  const baseAmt = Math.floor(totalWithFee / count);
  const remainder = totalWithFee - baseAmt * count;

  return Array.from({ length: count }, (_, idx) => ({
    index: idx + 1,
    dueDate: addShamsiMonths(params.startDate, idx + 1),
    amountIrr: idx === count - 1 ? baseAmt + remainder : baseAmt,
    paid: false,
  }));
}

// ---------------- WHATSAPP / TELEGRAM / SMS SHARING HELPERS ----------------

export function normalizeIranPhoneForWhatsApp(phone?: string): string {
  if (!phone) return '';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  let digits = '';
  for (const ch of phone) {
    const idx = persian.indexOf(ch);
    if (idx !== -1) digits += String(idx);
    else if (ch >= '0' && ch <= '9') digits += ch;
  }
  if (digits.startsWith('0098')) return digits.slice(2);
  if (digits.startsWith('98')) return digits;
  if (digits.startsWith('0') && digits.length >= 10) return `98${digits.slice(1)}`;
  return digits;
}

export function buildWhatsAppUrl(phone: string | undefined, message: string): string {
  const cleaned = normalizeIranPhoneForWhatsApp(phone);
  const encoded = encodeURIComponent(message);
  return cleaned ? `https://wa.me/${cleaned}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function buildTelegramShareUrl(message: string): string {
  return `https://t.me/share/url?url=&text=${encodeURIComponent(message)}`;
}

export function buildSmsUrl(phone: string | undefined, message: string): string {
  const cleaned = (phone || '').replace(/[^0-9+]/g, '');
  return `sms:${cleaned}?body=${encodeURIComponent(message)}`;
}

export function formatInvoiceShareMessage(
  inv: Invoice,
  companyName: string,
  unit: CurrencyUnit,
  taxId22?: string
): string {
  const itemsText = inv.items
    .map(
      (it, i) =>
        `${toPersianDigits(i + 1)}. ${it.productName} — ${formatNumber(it.quantity)} ${it.unit} × ${formatMoney(it.unitPrice, unit, false)} = ${formatMoney(it.lineTotal, unit)}`
    )
    .join('\n');

  return [
    `📄 صورتحساب رسمی — ${companyName}`,
    `شماره فاکتور: ${inv.invoiceNumber} | تاریخ: ${toPersianDigits(inv.date)}`,
    taxId22 ? `شماره مالیاتی مودیان: ${taxId22}` : '',
    `مشتری گرامی: ${inv.partyName}`,
    `────────────────`,
    itemsText,
    `────────────────`,
    `جمع کل قابل پرداخت: ${formatMoney(inv.grandTotal, unit)}`,
    inv.creditAmount > 0 ? `مانده نسیه/حساب: ${formatMoney(inv.creditAmount, unit)}` : 'وضعیت تسویه: تسویه کامل',
    `با سپاس از همکاری شما — ${companyName}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatPartyStatementShareMessage(params: {
  partyName: string;
  balanceIrr: number;
  companyName: string;
  unit: CurrencyUnit;
}): string {
  const abs = Math.abs(params.balanceIrr);
  const side =
    params.balanceIrr > 0
      ? 'بدهکار (قابل پرداخت به شرکت)'
      : params.balanceIrr < 0
        ? 'بستانکار (طلب شما از شرکت)'
        : 'تسویه (صفر)';
  return [
    `📊 خلاصه مانده حساب — ${params.companyName}`,
    `طرف‌حساب گرامی: ${params.partyName}`,
    `تاریخ استعلام: ${toPersianDigits(getTodayShamsi())}`,
    `مانده فعلی حساب: ${formatMoney(abs, params.unit)} (${side})`,
    `لطفاً در صورت هرگونه مغایرت با واحد مالی تماس حاصل فرمایید.`,
  ].join('\n');
}

export function formatChequeReminderShareMessage(params: {
  cheque: Cheque;
  companyName: string;
  unit: CurrencyUnit;
}): string {
  const ch = params.cheque;
  return [
    `🏦 یادآور سررسید چک صیادی — ${params.companyName}`,
    `طرف‌حساب گرامی: ${ch.partyName}`,
    `شماره صیادی: ${toPersianDigits(ch.sayadiId)}`,
    `بانک: ${ch.bankName} | تاریخ سررسید: ${toPersianDigits(ch.dueDate)}`,
    `مبلغ چک: ${formatMoney(ch.amount, params.unit)}`,
    ch.direction === 'receivable'
      ? `خواهشمند است جهت تامین موجودی و ثبت در سامانه صیاد اقدام فرمایید.`
      : `یادآوری جهت پیگیری وصول چک پرداختی.`,
  ].join('\n');
}

// ---------------- SMART ABC INTELLIGENCE (PRODUCTS & CUSTOMERS) ----------------

export type AbcGrade = 'A' | 'B' | 'C';
export type CustomerTierBadge = 'gold' | 'silver' | 'standard' | 'risk';

export interface ProductAbcRow {
  productId: string;
  sku: string;
  name: string;
  category: string;
  soldKg: number;
  revenueIrr: number;
  grossProfitIrr: number;
  marginPct: number;
  stockValueIrr: number;
  revenueSharePct: number;
  cumulativeSharePct: number;
  grade: AbcGrade;
  isStagnant: boolean;
}

export interface CustomerAbcRow {
  partyId: string;
  code: string;
  name: string;
  phone?: string;
  invoiceCount: number;
  totalSalesIrr: number;
  grossProfitIrr: number;
  currentBalanceIrr: number;
  creditLimitIrr: number;
  bouncedChequesCount: number;
  grade: AbcGrade;
  tier: CustomerTierBadge;
  tierLabel: string;
}

export interface AbcIntelligenceReport {
  products: ProductAbcRow[];
  customers: CustomerAbcRow[];
  stagnantProductsCount: number;
  stagnantStockValueIrr: number;
  riskCustomersCount: number;
  goldCustomersCount: number;
}

export function computeAbcIntelligence(params: {
  products: Product[];
  parties: Party[];
  invoices: Invoice[];
  cheques: Cheque[];
  partyBalances: Map<string, number>;
}): AbcIntelligenceReport {
  const validSales = params.invoices.filter(
    (inv) => inv.invoiceType === 'sale' && inv.status !== 'cancelled'
  );

  // 1. Product ABC
  const prodStats = new Map<string, { soldKg: number; revenue: number; profit: number }>();
  for (const inv of validSales) {
    for (const item of inv.items) {
      const cur = prodStats.get(item.productId) || { soldKg: 0, revenue: 0, profit: 0 };
      const prod = params.products.find((p) => p.id === item.productId);
      const unitCost = item.unitCostSnapshot ?? prod?.buyPrice ?? 0;
      const netLine = Math.max(0, item.lineTotal - item.vatAmount);
      cur.soldKg += item.quantity;
      cur.revenue += netLine;
      cur.profit += netLine - unitCost * item.quantity;
      prodStats.set(item.productId, cur);
    }
  }

  const totalProdRevenue = Array.from(prodStats.values()).reduce((s, x) => s + x.revenue, 0);
  const rawProdRows = params.products
    .map((p) => {
      const st = prodStats.get(p.id) || { soldKg: 0, revenue: 0, profit: 0 };
      const stockValueIrr = Math.round(p.stock * p.buyPrice);
      const marginPct = st.revenue > 0 ? Math.round((st.profit / st.revenue) * 1000) / 10 : 0;
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        soldKg: Math.round(st.soldKg * 100) / 100,
        revenueIrr: Math.round(st.revenue),
        grossProfitIrr: Math.round(st.profit),
        marginPct,
        stockValueIrr,
        isStagnant: st.soldKg === 0 && p.stock > 0,
      };
    })
    .sort((a, b) => b.revenueIrr - a.revenueIrr);

  let cumPct = 0;
  const products: ProductAbcRow[] = rawProdRows.map((row) => {
    const share = totalProdRevenue > 0 ? (row.revenueIrr / totalProdRevenue) * 100 : 0;
    const prevCum = cumPct;
    cumPct = Math.min(100, cumPct + share);
    const grade: AbcGrade =
      row.revenueIrr === 0 ? 'C' : prevCum < 70 ? 'A' : prevCum < 90 ? 'B' : 'C';
    return {
      ...row,
      revenueSharePct: Math.round(share * 10) / 10,
      cumulativeSharePct: Math.round(cumPct * 10) / 10,
      grade,
    };
  });

  // 2. Customer ABC
  const custStats = new Map<string, { count: number; sales: number; profit: number }>();
  for (const inv of validSales) {
    const cur = custStats.get(inv.partyId) || { count: 0, sales: 0, profit: 0 };
    cur.count += 1;
    cur.sales += inv.grandTotal;
    const invProfit = inv.items.reduce((s, it) => {
      const prod = params.products.find((p) => p.id === it.productId);
      const cost = (it.unitCostSnapshot ?? prod?.buyPrice ?? 0) * it.quantity;
      return s + Math.max(0, it.lineTotal - it.vatAmount) - cost;
    }, 0);
    cur.profit += invProfit;
    custStats.set(inv.partyId, cur);
  }

  const bouncedByParty = new Map<string, number>();
  for (const ch of params.cheques) {
    if (ch.status === 'bounced') {
      bouncedByParty.set(ch.partyId, (bouncedByParty.get(ch.partyId) ?? 0) + 1);
    }
  }

  const customerParties = params.parties.filter(
    (p) => p.partyType === 'customer' || p.partyType === 'both'
  );
  const totalCustSales = Array.from(custStats.values()).reduce((s, x) => s + x.sales, 0);

  const rawCustRows = customerParties
    .map((p) => {
      const st = custStats.get(p.id) || { count: 0, sales: 0, profit: 0 };
      const bal = params.partyBalances.get(p.id) ?? p.openingBalance ?? 0;
      const bounced = bouncedByParty.get(p.id) ?? 0;
      return {
        partyId: p.id,
        code: p.code,
        name: p.name,
        phone: p.phone,
        invoiceCount: st.count,
        totalSalesIrr: Math.round(st.sales),
        grossProfitIrr: Math.round(st.profit),
        currentBalanceIrr: Math.round(bal),
        creditLimitIrr: p.creditLimit,
        bouncedChequesCount: bounced,
      };
    })
    .sort((a, b) => b.totalSalesIrr - a.totalSalesIrr);

  let custCum = 0;
  const customers: CustomerAbcRow[] = rawCustRows.map((row) => {
    const share = totalCustSales > 0 ? (row.totalSalesIrr / totalCustSales) * 100 : 0;
    const prevCum = custCum;
    custCum = Math.min(100, custCum + share);
    const grade: AbcGrade =
      row.totalSalesIrr === 0 ? 'C' : prevCum < 70 ? 'A' : prevCum < 90 ? 'B' : 'C';
    const overCredit = row.creditLimitIrr > 0 && row.currentBalanceIrr > row.creditLimitIrr;
    let tier: CustomerTierBadge = 'standard';
    let tierLabel = 'عادی (C)';
    if (row.bouncedChequesCount > 0 || overCredit) {
      tier = 'risk';
      tierLabel = 'پرریسک';
    } else if (grade === 'A') {
      tier = 'gold';
      tierLabel = 'طلایی (A)';
    } else if (grade === 'B') {
      tier = 'silver';
      tierLabel = 'نقره‌ای (B)';
    }
    return { ...row, grade, tier, tierLabel };
  });

  const stagnant = products.filter((p) => p.isStagnant);
  return {
    products,
    customers,
    stagnantProductsCount: stagnant.length,
    stagnantStockValueIrr: stagnant.reduce((s, p) => s + p.stockValueIrr, 0),
    riskCustomersCount: customers.filter((c) => c.tier === 'risk').length,
    goldCustomersCount: customers.filter((c) => c.tier === 'gold').length,
  };
}

// ---------------- DEFAULT SEED DATA FOR EXTENSIONS ----------------

export const DEFAULT_VOLUME_DISCOUNT_RULES: VolumeDiscountRule[] = [
  {
    id: 'vol-rule-500',
    title: 'تخفیف پلکانی خرید بالای ۵۰۰ کیلوگرم',
    minWeightKg: 500,
    discountPct: 2,
    active: true,
  },
  {
    id: 'vol-rule-2000',
    title: 'تخفیف پلکانی عمده بالای ۲ تن',
    minWeightKg: 2000,
    discountPct: 4.5,
    active: true,
  },
];

export const DEFAULT_RECURRING_TEMPLATES: RecurringVoucherTemplate[] = [
  {
    id: 'rec-rent',
    title: 'اجاره ماهانه دفتر و انبار مرکزی',
    dayOfMonth: 1,
    description: 'ثبت هزینه اجاره ماهانه انبار و دفتر بازرگانی',
    active: true,
    lines: [
      {
        accountCode: '80102',
        accountTitle: 'هزینه اجاره دفتر و انبار',
        description: 'اجاره ماهانه دفتر و انبار مرکزی',
        debit: 450_000_000,
        credit: 0,
      },
      {
        accountCode: '10201',
        accountTitle: 'بانک ملت — جاری ریالی',
        description: 'پرداخت اجاره ماهانه از بانک ملت',
        debit: 0,
        credit: 450_000_000,
      },
    ],
  },
  {
    id: 'rec-utilities',
    title: 'قبوض آب، برق، گاز و اینترنت ماهانه',
    dayOfMonth: 25,
    description: 'ثبت هزینه آب، برق، گاز و مخابرات دوره',
    active: true,
    lines: [
      {
        accountCode: '80103',
        accountTitle: 'هزینه آب، برق، گاز و تلفن',
        description: 'قبوض مصرفی ماهانه انبار و دفتر',
        debit: 85_000_000,
        credit: 0,
      },
      {
        accountCode: '10101',
        accountTitle: 'صندوق مرکزی',
        description: 'پرداخت قبوض ماهانه از صندوق',
        debit: 0,
        credit: 85_000_000,
      },
    ],
  },
];

export const SLIP_TYPE_LABELS: Record<WarehouseSlipType, { label: string; sign: 1 | -1; badgeClass: string }> = {
  receipt: {
    label: 'رسید ورود موقت انبار',
    sign: 1,
    badgeClass: 'text-emerald-700 dark:text-emerald-400',
  },
  dispatch: {
    label: 'حواله خروج مستقل از فاکتور',
    sign: -1,
    badgeClass: 'text-rose-700 dark:text-rose-400',
  },
  consignment_out: {
    label: 'ارسال کالای امانی (نزد دیگران)',
    sign: -1,
    badgeClass: 'text-amber-700 dark:text-amber-400',
  },
  consignment_in: {
    label: 'دریافت کالای امانی (برگشت/نزد ما)',
    sign: 1,
    badgeClass: 'text-sky-700 dark:text-sky-400',
  },
};

export function formatMoneyBadge(amountIrr: number, unit: CurrencyUnit): string {
  return formatCompactMoney(amountIrr, unit);
}
