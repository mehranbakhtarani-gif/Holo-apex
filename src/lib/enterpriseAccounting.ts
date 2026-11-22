import {
  CompanyProfile,
  CurrencyDefinition,
  Employee,
  ExchangeRateEntry,
  ImportCostAllocationMethod,
  ImportDossierItem,
  ImportLandedCost,
  Invoice,
  Party,
  PartyPricingTier,
  RbacPermissions,
  RbacRoleKey,
  Voucher,
} from '../types/accounting';
import { calculateEmployeePayroll } from './accountingEngine';
import {
  BASE_CURRENCY_CODE,
  convertForeignToIrr,
  getEffectiveExchangeRate,
  isForeignCurrency,
  normalizeCurrencyCode,
  roundCurrency,
} from './currency';
import { getTodayShamsi } from './format';
import { diffShamsiDays } from './chequeAlerts';

export const PRICING_TIER_LABELS: Record<PartyPricingTier, { label: string; defaultDiscountPct: number }> = {
  standard: { label: 'تیپ ۱ — نرخ پایه بازار', defaultDiscountPct: 0 },
  wholesale: { label: 'تیپ ۲ — بنکدار و عمده‌فروش (۲٪ تخفیف)', defaultDiscountPct: 2 },
  factory: { label: 'تیپ ۳ — کارخانه‌دار و بافندگی (۳.۵٪ تخفیف)', defaultDiscountPct: 3.5 },
  cash_vip: { label: 'تیپ ۴ — خرید نقدی ویژه (۵٪ تخفیف)', defaultDiscountPct: 5 },
};

export const RBAC_ROLE_LABELS: Record<RbacRoleKey, string> = {
  finance_manager: 'مدیر مالی (دسترسی کامل)',
  accountant: 'حسابدار ارشد',
  warehouse_keeper: 'انباردار و باسکول',
  sales_officer: 'کارشناس فروش و فاکتور',
  treasurer: 'خزانه‌دار و چک صیادی',
  auditor_readonly: 'حسابرس (فقط مشاهده و گزارش)',
};

export const RBAC_ROLE_PRESETS: Record<RbacRoleKey, RbacPermissions> = {
  finance_manager: {
    canCreateVoucher: true,
    canFinalizeVoucher: true,
    canIssueInvoice: true,
    canEditInventory: true,
    canManageTreasury: true,
    canManageCurrencies: true,
    canManageSettings: true,
    canDeleteRecords: true,
  },
  accountant: {
    canCreateVoucher: true,
    canFinalizeVoucher: true,
    canIssueInvoice: true,
    canEditInventory: false,
    canManageTreasury: true,
    canManageCurrencies: true,
    canManageSettings: false,
    canDeleteRecords: false,
  },
  warehouse_keeper: {
    canCreateVoucher: false,
    canFinalizeVoucher: false,
    canIssueInvoice: false,
    canEditInventory: true,
    canManageTreasury: false,
    canManageCurrencies: false,
    canManageSettings: false,
    canDeleteRecords: false,
  },
  sales_officer: {
    canCreateVoucher: false,
    canFinalizeVoucher: false,
    canIssueInvoice: true,
    canEditInventory: false,
    canManageTreasury: false,
    canManageCurrencies: false,
    canManageSettings: false,
    canDeleteRecords: false,
  },
  treasurer: {
    canCreateVoucher: true,
    canFinalizeVoucher: false,
    canIssueInvoice: false,
    canEditInventory: false,
    canManageTreasury: true,
    canManageCurrencies: true,
    canManageSettings: false,
    canDeleteRecords: false,
  },
  auditor_readonly: {
    canCreateVoucher: false,
    canFinalizeVoucher: false,
    canIssueInvoice: false,
    canEditInventory: false,
    canManageTreasury: false,
    canManageCurrencies: false,
    canManageSettings: false,
    canDeleteRecords: false,
  },
};

/**
 * Exact integer Rial Landed Cost allocation across yarn import items by weight (kg) or foreign value.
 * Guarantees sum(item.allocatedLandedCostIrr) === totalLandedCostsIrr with zero rounding drift.
 */
export function calculateLandedCostAllocation(
  items: Omit<
    ImportDossierItem,
    'foreignTotal' | 'allocatedLandedCostIrr' | 'finalUnitCostIrr' | 'totalItemLandedIrr'
  >[],
  costs: ImportLandedCost[],
  exchangeRate: number,
  method: ImportCostAllocationMethod
): {
  computedItems: ImportDossierItem[];
  totalForeignAmount: number;
  totalFobIrr: number;
  totalLandedCostsIrr: number;
  totalRecoverableVatIrr: number;
  grandTotalLandedIrr: number;
} {
  // Under IAS 2 / Iranian Standard 8, recoverable 10% customs VAT is debited to 30302 and NOT capitalized into inventory cost
  const totalRecoverableVatIrr = Math.round(
    costs
      .filter((c) => c.isRecoverableVat)
      .reduce((s, c) => s + Math.max(0, Math.round(Number(c.amountIrr) || 0)), 0)
  );
  const totalLandedCostsIrr = Math.round(
    costs
      .filter((c) => !c.isRecoverableVat)
      .reduce((s, c) => s + Math.max(0, Math.round(Number(c.amountIrr) || 0)), 0)
  );

  const enriched = items.map((it) => {
    const weight = Math.max(0, Number(it.weightKg) || 0);
    const fxUnit = Math.max(0, Number(it.foreignUnitPrice) || 0);
    const foreignTotal = roundCurrency(weight * fxUnit, 2);
    const fobIrr = convertForeignToIrr(foreignTotal, exchangeRate);
    return { ...it, weightKg: weight, foreignUnitPrice: fxUnit, foreignTotal, fobIrr };
  });

  const totalForeignAmount = roundCurrency(
    enriched.reduce((s, i) => s + i.foreignTotal, 0),
    2
  );
  const totalFobIrr = enriched.reduce((s, i) => s + i.fobIrr, 0);
  const basisTotal =
    method === 'weight'
      ? enriched.reduce((s, i) => s + i.weightKg, 0)
      : enriched.reduce((s, i) => s + i.foreignTotal, 0);

  let allocatedRunning = 0;
  const computedItems: ImportDossierItem[] = enriched.map((item, idx) => {
    const isLast = idx === enriched.length - 1;
    const share =
      basisTotal > 0
        ? isLast
          ? totalLandedCostsIrr - allocatedRunning
          : Math.round(
              totalLandedCostsIrr *
                ((method === 'weight' ? item.weightKg : item.foreignTotal) / basisTotal)
            )
        : 0;
    allocatedRunning += share;
    const totalItemLandedIrr = item.fobIrr + share;
    const finalUnitCostIrr =
      item.weightKg > 0 ? Math.round(totalItemLandedIrr / item.weightKg) : 0;

    return {
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      lotNumber: item.lotNumber,
      weightKg: item.weightKg,
      cartonCount: item.cartonCount,
      foreignUnitPrice: item.foreignUnitPrice,
      foreignTotal: item.foreignTotal,
      allocatedLandedCostIrr: share,
      totalItemLandedIrr,
      finalUnitCostIrr,
    };
  });

  return {
    computedItems,
    totalForeignAmount,
    totalFobIrr,
    totalLandedCostsIrr,
    totalRecoverableVatIrr,
    grandTotalLandedIrr: totalFobIrr + totalLandedCostsIrr,
  };
}

// ---------------- END-OF-PERIOD FX REVALUATION (تسعیر ارز) ----------------
export interface FxRevaluationRow {
  key: string;
  accountCode: string;
  accountTitle: string;
  partyId?: string;
  partyName?: string;
  currencyCode: string;
  netForeignBalance: number; // Positive = Debit foreign balance, Negative = Credit foreign balance
  historicalIrrBalance: number; // Positive = Debit IRR balance, Negative = Credit IRR balance
  currentRateToIrr: number;
  revaluedIrrBalance: number;
  revaluationDiffIrr: number; // Positive = FX Gain (سود تسعیر), Negative = FX Loss (زیان تسعیر)
}

export function computeFxRevaluationReport(
  vouchers: Voucher[],
  exchangeRates: ExchangeRateEntry[],
  currencies: CurrencyDefinition[],
  asOfDate: string = getTodayShamsi()
): FxRevaluationRow[] {
  // Only monetary asset/liability accounts (101xx, 102xx, 103xx, 104xx, 301xx, 302xx) are revalued under IAS 21 / Iranian Accounting Standard 16
  const isMonetaryFxAccount = (code: string) =>
    code.startsWith('101') ||
    code.startsWith('102') ||
    code.startsWith('103') ||
    code.startsWith('104') ||
    code.startsWith('301') ||
    code.startsWith('302');

  const buckets = new Map<
    string,
    {
      accountCode: string;
      accountTitle: string;
      partyId?: string;
      partyName?: string;
      currencyCode: string;
      netForeign: number;
      netIrr: number;
    }
  >();

  for (const v of vouchers) {
    if (asOfDate && v.date > asOfDate) continue;
    const voucherIsFx = isForeignCurrency(v.currencyCode);
    const voucherCode = voucherIsFx ? normalizeCurrencyCode(v.currencyCode) : '';
    const rate = v.exchangeRate && v.exchangeRate > 0 ? v.exchangeRate : 1;

    for (const line of v.lines) {
      if (!isMonetaryFxAccount(line.accountCode)) continue;

      const lineFxCode = line.fxCurrencyCode && isForeignCurrency(line.fxCurrencyCode)
        ? normalizeCurrencyCode(line.fxCurrencyCode)
        : undefined;
      const effectiveCode = lineFxCode || (voucherIsFx ? voucherCode : undefined);
      if (!effectiveCode) continue;

      const hasExplicitFx = line.foreignDebit !== undefined || line.foreignCredit !== undefined;
      // If a mixed-currency voucher (like import clearance) explicitly marks a Rial line with 0/0 and no fxCurrencyCode, skip it!
      if (
        hasExplicitFx &&
        !lineFxCode &&
        (line.foreignDebit ?? 0) === 0 &&
        (line.foreignCredit ?? 0) === 0
      ) {
        continue;
      }

      const fxDr = hasExplicitFx
        ? Number(line.foreignDebit) || 0
        : line.debit > 0
          ? roundCurrency(line.debit / rate, 2)
          : 0;
      const fxCr = hasExplicitFx
        ? Number(line.foreignCredit) || 0
        : line.credit > 0
          ? roundCurrency(line.credit / rate, 2)
          : 0;

      const key = `${line.accountCode}__${line.partyId || '_'}__${effectiveCode}`;
      const existing = buckets.get(key) || {
        accountCode: line.accountCode,
        accountTitle: line.accountTitle,
        partyId: line.partyId,
        partyName: line.partyName,
        currencyCode: effectiveCode,
        netForeign: 0,
        netIrr: 0,
      };

      existing.netForeign = roundCurrency(existing.netForeign + fxDr - fxCr, 2);
      existing.netIrr += (line.debit || 0) - (line.credit || 0);
      buckets.set(key, existing);
    }
  }

  const rows: FxRevaluationRow[] = [];
  for (const [key, b] of buckets.entries()) {
    if (Math.abs(b.netForeign) < 0.01 && Math.abs(b.netIrr) < 1) continue;
    const eff = getEffectiveExchangeRate(b.currencyCode, asOfDate, exchangeRates, currencies);
    const revaluedIrr = Math.round(b.netForeign * eff.rateToIrr);
    // For net debit (asset > 0): higher revalued IRR = FX Gain (+).
    // For net credit (liability < 0): less negative revalued IRR = FX Gain (+), more negative = FX Loss (-).
    // In both signed cases: diff = revaluedIrr - b.netIrr!
    const revaluationDiffIrr = revaluedIrr - b.netIrr;
    rows.push({
      key,
      accountCode: b.accountCode,
      accountTitle: b.accountTitle,
      partyId: b.partyId,
      partyName: b.partyName,
      currencyCode: b.currencyCode,
      netForeignBalance: b.netForeign,
      historicalIrrBalance: b.netIrr,
      currentRateToIrr: eff.rateToIrr,
      revaluedIrrBalance: revaluedIrr,
      revaluationDiffIrr,
    });
  }

  return rows.sort((a, b) => Math.abs(b.revaluationDiffIrr) - Math.abs(a.revaluationDiffIrr));
}

// ---------------- RECEIVABLES AGING REPORT (گزارش سنی مطالبات) ----------------
export interface AgingBucketRow {
  partyId: string;
  partyCode: string;
  partyName: string;
  phone?: string;
  totalReceivable: number;
  bucket0to30: number;
  bucket31to60: number;
  bucket61to90: number;
  bucketOver90: number;
  oldestInvoiceDate?: string;
  maxOverdueDays: number;
}

export function computeReceivablesAging(
  parties: Party[],
  invoices: Invoice[],
  partyBalances: Map<string, number>,
  todayShamsi: string = getTodayShamsi()
): AgingBucketRow[] {
  const rows: AgingBucketRow[] = [];

  for (const p of parties) {
    const balance = partyBalances.get(p.id) ?? 0;
    if (balance <= 0) continue; // Only positive debtors (مطالبات)

    // Match open receivable balance against most recent credit sales invoices (FIFO settlement)
    const salesInvs = invoices
      .filter((inv) => inv.partyId === p.id && inv.invoiceType === 'sale' && inv.status !== 'cancelled')
      .sort((a, b) => b.date.localeCompare(a.date));

    let remaining = balance;
    let b0 = 0;
    let b31 = 0;
    let b61 = 0;
    let b90 = 0;
    let maxDays = 0;
    let oldestDate: string | undefined;

    for (const inv of salesInvs) {
      if (remaining <= 0) break;
      const portion = Math.min(remaining, Math.max(inv.creditAmount, inv.grandTotal));
      if (portion <= 0) continue;
      const age = Math.max(0, diffShamsiDays(inv.date, todayShamsi) ?? 0);
      if (age > maxDays) {
        maxDays = age;
        oldestDate = inv.date;
      }
      if (age <= 30) b0 += portion;
      else if (age <= 60) b31 += portion;
      else if (age <= 90) b61 += portion;
      else b90 += portion;
      remaining -= portion;
    }

    // Any residual opening balance older than listed invoices goes to >90 days
    if (remaining > 0) {
      b90 += remaining;
      maxDays = Math.max(maxDays, 95);
    }

    rows.push({
      partyId: p.id,
      partyCode: p.code,
      partyName: p.name,
      phone: p.phone,
      totalReceivable: balance,
      bucket0to30: b0,
      bucket31to60: b31,
      bucket61to90: b61,
      bucketOver90: b90,
      oldestInvoiceDate: oldestDate,
      maxOverdueDays: maxDays,
    });
  }

  return rows.sort((a, b) => b.totalReceivable - a.totalReceivable);
}

// ---------------- BROKER / INTERMEDIARY COMMISSIONS ----------------
export interface BrokerCommissionRow {
  partyId: string;
  partyCode: string;
  partyName: string;
  commissionRate: number;
  invoiceCount: number;
  totalSalesIrr: number;
  totalWeightKg: number;
  commissionAmountIrr: number;
}

export function computeBrokerCommissions(
  parties: Party[],
  invoices: Invoice[]
): BrokerCommissionRow[] {
  const brokers = parties.filter((p) => p.partyType === 'intermediary' || (p.commissionRate ?? 0) > 0);
  const validSales = invoices.filter((i) => i.invoiceType === 'sale' && i.status !== 'cancelled');

  return brokers.map((b) => {
    const matched = validSales.filter((inv) => inv.intermediaryId === b.id);
    const totalSalesIrr = matched.reduce((s, i) => s + Math.max(0, i.subtotal - i.discount), 0);
    const totalWeightKg = matched.reduce(
      (s, i) => s + i.items.reduce((is, it) => is + (it.quantity || 0), 0),
      0
    );
    const rate = b.commissionRate ?? 1.5;
    const commissionAmountIrr = Math.round((totalSalesIrr * rate) / 100);
    return {
      partyId: b.id,
      partyCode: b.code,
      partyName: b.name,
      commissionRate: rate,
      invoiceCount: matched.length,
      totalSalesIrr,
      totalWeightKg,
      commissionAmountIrr,
    };
  });
}

// ---------------- PERSIAN NUMBER TO WORDS (FOR SAYADI CHEQUE PRINT) ----------------
const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد'];

function threeDigitsToPersian(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (rem >= 10 && rem < 20) {
    parts.push(TEENS[rem - 10]);
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t > 0) parts.push(TENS[t]);
    if (o > 0) parts.push(ONES[o]);
  }
  return parts.join(' و ');
}

export function numberToPersianWords(amount: number, suffix = 'ریال تمام'): string {
  const abs = Math.round(Math.abs(Number(amount) || 0));
  if (abs === 0) return `صفر ${suffix}`;
  const groups: string[] = [];
  let n = abs;
  let scaleIdx = 0;
  while (n > 0 && scaleIdx < SCALES.length) {
    const chunk = n % 1000;
    if (chunk > 0) {
      const words = threeDigitsToPersian(chunk);
      groups.unshift(SCALES[scaleIdx] ? `${words} ${SCALES[scaleIdx]}` : words);
    }
    n = Math.floor(n / 1000);
    scaleIdx += 1;
  }
  return `${groups.join(' و ')} ${suffix}`.trim();
}

// ---------------- OFFICIAL STATUTORY EXPORTS (TAMIN DSK / TTMS / MOADIAN JSON) ----------------
export function buildTaminDskFiles(
  employees: Employee[],
  profile: CompanyProfile,
  monthLabel: string
): { karFile: string; worFile: string } {
  const active = employees.filter((e) => e.active);
  let totalGross = 0;
  let totalEmpIns = 0;
  let totalCompIns = 0;

  const worLines = active.map((emp, idx) => {
    const calc = calculateEmployeePayroll(emp);
    totalGross += calc.grossPay;
    totalEmpIns += calc.employeeInsurance;
    totalCompIns += calc.employerInsurance;
    return [
      idx + 1,
      emp.personnelCode,
      emp.fullName,
      emp.department,
      30, // کارکرد ماهانه
      calc.grossPay,
      calc.employeeInsurance,
      calc.employerInsurance,
      calc.employeeInsurance + calc.employerInsurance,
    ].join(',');
  });

  const karHeader = 'WORKSHOP_NAME,NATIONAL_ID,FISCAL_YEAR,PERIOD,EMPLOYEE_COUNT,TOTAL_GROSS_IRR,EMP_INS_7PCT,COMP_INS_23PCT,TOTAL_TAMIN_30PCT';
  const karRow = [
    `"${profile.companyName}"`,
    profile.nationalId || '14007892134',
    profile.fiscalYear,
    `"${monthLabel}"`,
    active.length,
    totalGross,
    totalEmpIns,
    totalCompIns,
    totalEmpIns + totalCompIns,
  ].join(',');

  const worHeader = 'ROW,PERSONNEL_CODE,FULL_NAME,DEPARTMENT,WORK_DAYS,INSURABLE_WAGE_IRR,EMP_SHARE_7PCT,EMPLOYER_SHARE_23PCT,TOTAL_INSURANCE_IRR';
  return {
    karFile: '\uFEFF' + [karHeader, karRow].join('\n'),
    worFile: '\uFEFF' + [worHeader, ...worLines].join('\n'),
  };
}

export function buildTtmsSalaryCsv(
  employees: Employee[],
  profile: CompanyProfile,
  monthLabel: string
): string {
  const active = employees.filter((e) => e.active);
  const header = 'COMPANY,ECONOMIC_CODE,PERIOD,PERSONNEL_CODE,FULL_NAME,GROSS_SALARY_IRR,INSURANCE_DEDUCTION_IRR,TAXABLE_INCOME_IRR,SALARY_TAX_IRR,NET_PAYABLE_IRR';
  const lines = active.map((emp) => {
    const calc = calculateEmployeePayroll(emp);
    return [
      `"${profile.companyName}"`,
      profile.economicCode || '',
      `"${monthLabel}"`,
      emp.personnelCode,
      `"${emp.fullName}"`,
      calc.grossPay,
      calc.employeeInsurance,
      Math.max(0, calc.grossPay - calc.employeeInsurance),
      calc.incomeTax,
      calc.netPay,
    ].join(',');
  });
  return '\uFEFF' + [header, ...lines].join('\n');
}

export function buildMoadianInvoiceJson(
  invoice: Invoice,
  profile: CompanyProfile,
  party?: Party
): string {
  const payload = {
    schema: 'IR-MOADIAN-TPIS-V2',
    generatedAt: new Date().toISOString(),
    header: {
      taxid: invoice.taxSerial || `A1B2C3${invoice.invoiceNumber.replace(/\D/g, '').padStart(16, '0')}`,
      indatim: invoice.date,
      inty: 1, // نوع اول (بنگاه به بنگاه B2B)
      inno: invoice.invoiceNumber,
      inp: 1, // الگوی فروش کالا
      ins: invoice.status === 'cancelled' ? 3 : 1, // 1=اصلی، 3=ابطالی
      tins: profile.economicCode || profile.nationalId || '411589203411',
      sellerName: profile.companyName,
      tinb: party?.economicCode || party?.nationalId || '',
      buyerName: invoice.partyName,
      tob: party?.nationalId && party.nationalId.length === 11 ? 2 : 1,
      setm: invoice.creditAmount > 0 && invoice.paidCash + invoice.paidBank + invoice.paidCheque > 0 ? 3 : invoice.creditAmount > 0 ? 2 : 1,
      tprdis: invoice.subtotal,
      tdis: invoice.discount,
      tadis: Math.max(0, invoice.subtotal - invoice.discount),
      tvam: invoice.vatAmount,
      tbill: invoice.grandTotal,
      ...(isForeignCurrency(invoice.currencyCode)
        ? {
            cut: normalizeCurrencyCode(invoice.currencyCode),
            exr: invoice.exchangeRate || 1,
            foreignGrandTotal: invoice.foreignGrandTotal ?? 0,
          }
        : { cut: BASE_CURRENCY_CODE }),
    },
    body: invoice.items.map((it, idx) => ({
      row: idx + 1,
      sstid: it.sku,
      sstt: it.productName,
      mu: it.unit,
      am: it.quantity,
      cartonCount: it.cartonCount ?? 0,
      lotNumber: it.lotNumber ?? '',
      fee: it.unitPrice,
      prdis: Math.round(it.quantity * it.unitPrice),
      dis: it.discount,
      adis: Math.max(0, Math.round(it.quantity * it.unitPrice) - it.discount),
      vra: it.vatAmount > 0 ? 10 : 0,
      vam: it.vatAmount,
      tsstam: it.lineTotal,
    })),
  };
  return JSON.stringify(payload, null, 2);
}
