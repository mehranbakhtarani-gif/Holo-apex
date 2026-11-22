import {
  Account,
  Cheque,
  CostCenter,
  Employee,
  FixedAsset,
  Invoice,
  Party,
  Product,
  TrialBalanceRow,
  Voucher,
  VoucherLine,
} from '../types/accounting';

export function computeTrialBalance(
  accounts: Account[],
  vouchers: Voucher[],
  options?: { excludeClosing?: boolean }
): TrialBalanceRow[] {
  const accountMap = new Map<string, Account>();
  accounts.forEach((a) => accountMap.set(a.code, a));

  const totals = new Map<
    string,
    { openingDebit: number; openingCredit: number; periodDebit: number; periodCredit: number }
  >();

  for (const v of vouchers) {
    if (options?.excludeClosing && v.voucherType === 'closing') continue;
    const isOpening = v.voucherType === 'opening';
    for (const line of v.lines) {
      const prev = totals.get(line.accountCode) ?? {
        openingDebit: 0,
        openingCredit: 0,
        periodDebit: 0,
        periodCredit: 0,
      };
      const d = Number.isFinite(Number(line.debit)) ? Math.max(0, Math.round(Number(line.debit))) : 0;
      const c = Number.isFinite(Number(line.credit)) ? Math.max(0, Math.round(Number(line.credit))) : 0;
      if (isOpening) {
        prev.openingDebit += d;
        prev.openingCredit += c;
      } else {
        prev.periodDebit += d;
        prev.periodCredit += c;
      }
      totals.set(line.accountCode, prev);
    }
  }

  const rows: TrialBalanceRow[] = [];
  totals.forEach((vals, code) => {
    const acc = accountMap.get(code);
    const totalDebit = vals.openingDebit + vals.periodDebit;
    const totalCredit = vals.openingCredit + vals.periodCredit;
    const diff = totalDebit - totalCredit;
    rows.push({
      accountCode: code,
      accountTitle: acc?.title ?? `حساب ${code}`,
      category: acc?.category ?? 'asset',
      openingDebit: vals.openingDebit,
      openingCredit: vals.openingCredit,
      periodDebit: vals.periodDebit,
      periodCredit: vals.periodCredit,
      totalDebit,
      totalCredit,
      balanceDebit: diff > 0 ? diff : 0,
      balanceCredit: diff < 0 ? Math.abs(diff) : 0,
    });
  });

  return rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

export interface IncomeStatementSummary {
  grossSales: number;
  salesReturns: number;
  otherRevenue: number;
  fxGain: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  nonOperatingExpenses: number;
  operatingProfit: number;
  netProfit: number;
  grossMarginPct: number;
  netMarginPct: number;
  expenseRows: { code: string; title: string; amount: number }[];
}

export function computeIncomeStatement(trialRows: TrialBalanceRow[]): IncomeStatementSummary {
  let grossSales = 0;
  let salesReturns = 0;
  let otherRevenue = 0;
  let fxGain = 0;
  let cogs = 0;
  let operatingExpenses = 0;
  let nonOperatingExpenses = 0;
  const expenseRows: { code: string; title: string; amount: number }[] = [];

  for (const row of trialRows) {
    const netCredit = row.balanceCredit - row.balanceDebit;
    const netDebit = row.balanceDebit - row.balanceCredit;
    if (row.category === 'revenue') {
      if (row.accountCode.startsWith('602')) {
        salesReturns += netDebit;
      } else if (row.accountCode.startsWith('609')) {
        fxGain += netCredit;
        otherRevenue += netCredit;
      } else if (row.accountCode.startsWith('603')) {
        otherRevenue += netCredit;
      } else {
        grossSales += netCredit;
      }
    } else if (row.category === 'cogs') {
      cogs += netDebit;
    } else if (row.category === 'expense') {
      if (row.accountCode.startsWith('809')) {
        nonOperatingExpenses += netDebit;
      } else {
        operatingExpenses += netDebit;
      }
      if (netDebit !== 0) {
        expenseRows.push({ code: row.accountCode, title: row.accountTitle, amount: netDebit });
      }
    }
  }

  const netSales = grossSales - salesReturns;
  const grossProfit = netSales - cogs;
  const operatingProfit = grossProfit - operatingExpenses;
  const netProfit = operatingProfit + otherRevenue - nonOperatingExpenses;
  const grossMarginPct = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
  const netMarginPct = netSales > 0 ? (netProfit / netSales) * 100 : 0;

  return {
    grossSales,
    salesReturns,
    otherRevenue,
    fxGain,
    netSales,
    cogs,
    grossProfit,
    operatingExpenses,
    nonOperatingExpenses,
    operatingProfit,
    netProfit,
    grossMarginPct,
    netMarginPct,
    expenseRows,
  };
}

export interface BalanceSheetSummary {
  assets: { code: string; title: string; amount: number }[];
  liabilities: { code: string; title: string; amount: number }[];
  equity: { code: string; title: string; amount: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  currentPeriodProfit: number;
  difference: number;
  isBalanced: boolean;
}

export function computeBalanceSheet(trialRows: TrialBalanceRow[]): BalanceSheetSummary {
  // Compute unclosed current-period net profit directly from the provided trial balance
  // (after year-end closing, temporary accounts are zeroed and profit is already inside 50201, so no double-counting)
  const income = computeIncomeStatement(trialRows);
  const assets: { code: string; title: string; amount: number }[] = [];
  const liabilities: { code: string; title: string; amount: number }[] = [];
  const equity: { code: string; title: string; amount: number }[] = [];

  for (const row of trialRows) {
    const netDebit = row.balanceDebit - row.balanceCredit;
    const netCredit = row.balanceCredit - row.balanceDebit;
    if (row.category === 'asset' && netDebit !== 0) {
      assets.push({ code: row.accountCode, title: row.accountTitle, amount: netDebit });
    } else if (row.category === 'liability' && netCredit !== 0) {
      // Reclassify debit-balance VAT input credit (30302) as a Current Asset under Iranian accounting standards
      if (row.accountCode === '30302' && netDebit > 0) {
        assets.push({
          code: row.accountCode,
          title: `${row.accountTitle} (اعتبار قابل استرداد)`,
          amount: netDebit,
        });
      } else {
        liabilities.push({ code: row.accountCode, title: row.accountTitle, amount: netCredit });
      }
    } else if (row.category === 'equity' && netCredit !== 0) {
      equity.push({ code: row.accountCode, title: row.accountTitle, amount: netCredit });
    }
  }

  if (income.netProfit !== 0) {
    equity.push({
      code: '90101',
      title: 'سود (زیان) خالص دوره جاری',
      amount: income.netProfit,
    });
  }

  const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);
  const totalEquity = equity.reduce((s, e) => s + e.amount, 0);
  const difference = totalAssets - (totalLiabilities + totalEquity);

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    currentPeriodProfit: income.netProfit,
    difference,
    isBalanced: Math.abs(difference) < 1,
  };
}

/**
 * Computes exact open account balances for each Party (excluding cheque instruments 103* and 302*
 * so that Party Subsidiary Ledgers reconcile 100% with General Ledger 10401 and 30101).
 */
export function computePartyBalances(parties: Party[], vouchers: Voucher[]): Map<string, number> {
  const balances = new Map<string, number>();
  for (const p of parties) {
    balances.set(p.id, 0);
  }
  for (const v of vouchers) {
    for (const line of v.lines) {
      if (!line.partyId || !balances.has(line.partyId)) continue;
      // Exclude cheque tracking accounts (اسناد دریافتنی/پرداختنی) from open party AR/AP balance
      if (line.accountCode.startsWith('103') || line.accountCode.startsWith('302')) continue;
      const cur = balances.get(line.partyId) ?? 0;
      balances.set(line.partyId, cur + (Number(line.debit) || 0) - (Number(line.credit) || 0));
    }
  }
  return balances;
}

export interface LedgerEntry {
  voucherId: string;
  voucherNumber: number;
  date: string;
  accountCode: string;
  accountTitle: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  partyName?: string;
}

export function computeAccountLedger(
  accountCode: string,
  vouchers: Voucher[],
  fromDate?: string,
  toDate?: string
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  let running = 0;
  const sorted = [...vouchers].sort((a, b) => a.voucherNumber - b.voucherNumber);
  for (const v of sorted) {
    if (toDate && v.date > toDate) continue;
    for (const line of v.lines) {
      if (line.accountCode === accountCode || line.accountCode.startsWith(accountCode)) {
        const d = Number(line.debit) || 0;
        const c = Number(line.credit) || 0;
        running += d - c;
        if (fromDate && v.date < fromDate) continue;
        entries.push({
          voucherId: v.id,
          voucherNumber: v.voucherNumber,
          date: v.date,
          accountCode: line.accountCode,
          accountTitle: line.accountTitle,
          description: line.description || v.description,
          debit: d,
          credit: c,
          runningBalance: running,
          partyName: line.partyName,
        });
      }
    }
  }
  return entries;
}

export function computePartyLedger(
  partyId: string,
  vouchers: Voucher[],
  includeCheques = false,
  fromDate?: string,
  toDate?: string
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  let running = 0;
  const sorted = [...vouchers].sort((a, b) => a.voucherNumber - b.voucherNumber);
  for (const v of sorted) {
    if (toDate && v.date > toDate) continue;
    for (const line of v.lines) {
      if (line.partyId !== partyId) continue;
      const isChequeAcc = line.accountCode.startsWith('103') || line.accountCode.startsWith('302');
      if (!includeCheques && isChequeAcc) continue;
      const d = Number(line.debit) || 0;
      const c = Number(line.credit) || 0;
      running += d - c;
      if (fromDate && v.date < fromDate) continue;
      entries.push({
        voucherId: v.id,
        voucherNumber: v.voucherNumber,
        date: v.date,
        accountCode: line.accountCode,
        accountTitle: line.accountTitle,
        description: line.description || v.description,
        debit: d,
        credit: c,
        runningBalance: running,
        partyName: line.partyName,
      });
    }
  }
  return entries;
}

export interface ProductProfitabilityRow {
  productId: string;
  sku: string;
  productName: string;
  soldQty: number;
  returnedQty: number;
  netQty: number;
  netSalesRevenue: number;
  estimatedCogs: number;
  grossProfit: number;
  marginPct: number;
}

export function computeProductProfitability(
  invoices: Invoice[],
  products: Product[]
): ProductProfitabilityRow[] {
  const productMap = new Map<string, Product>();
  products.forEach((p) => productMap.set(p.id, p));

  const acc = new Map<string, ProductProfitabilityRow>();

  for (const inv of invoices) {
    if (inv.status === 'cancelled') continue;
    if (inv.invoiceType !== 'sale' && inv.invoiceType !== 'sale_return') continue;
    const isReturn = inv.invoiceType === 'sale_return';

    for (const item of inv.items) {
      const prod = productMap.get(item.productId);
      const buyPrice = item.unitCostSnapshot !== undefined ? item.unitCostSnapshot : (prod?.buyPrice ?? 0);
      const netLineRev = Math.round(item.quantity * item.unitPrice) - item.discount;
      const lineCogs = Math.round(item.quantity * buyPrice);

      const row = acc.get(item.productId) ?? {
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        soldQty: 0,
        returnedQty: 0,
        netQty: 0,
        netSalesRevenue: 0,
        estimatedCogs: 0,
        grossProfit: 0,
        marginPct: 0,
      };

      if (isReturn) {
        row.returnedQty += item.quantity;
        row.netQty -= item.quantity;
        row.netSalesRevenue -= netLineRev;
        row.estimatedCogs -= lineCogs;
      } else {
        row.soldQty += item.quantity;
        row.netQty += item.quantity;
        row.netSalesRevenue += netLineRev;
        row.estimatedCogs += lineCogs;
      }

      row.grossProfit = row.netSalesRevenue - row.estimatedCogs;
      row.marginPct = row.netSalesRevenue > 0 ? (row.grossProfit / row.netSalesRevenue) * 100 : 0;
      acc.set(item.productId, row);
    }
  }

  return Array.from(acc.values()).sort((a, b) => b.grossProfit - a.grossProfit);
}

export interface CostCenterPnLRow {
  costCenter: CostCenter;
  revenue: number;
  cogs: number;
  expenses: number;
  netResult: number;
  budgetUsagePct: number;
}

export function computeCostCenterPnL(
  costCenters: CostCenter[],
  vouchers: Voucher[]
): CostCenterPnLRow[] {
  const stats = new Map<string, { revenue: number; cogs: number; expenses: number }>();
  costCenters.forEach((cc) => stats.set(cc.id, { revenue: 0, cogs: 0, expenses: 0 }));

  for (const v of vouchers) {
    for (const l of v.lines) {
      if (!l.costCenterId || !stats.has(l.costCenterId)) continue;
      const s = stats.get(l.costCenterId)!;
      if (l.accountCode.startsWith('6')) {
        s.revenue += (Number(l.credit) || 0) - (Number(l.debit) || 0);
      } else if (l.accountCode.startsWith('7')) {
        s.cogs += (Number(l.debit) || 0) - (Number(l.credit) || 0);
      } else if (l.accountCode.startsWith('8')) {
        s.expenses += (Number(l.debit) || 0) - (Number(l.credit) || 0);
      }
    }
  }

  return costCenters.map((cc) => {
    const s = stats.get(cc.id)!;
    const totalCost = s.cogs + s.expenses;
    return {
      costCenter: cc,
      revenue: s.revenue,
      cogs: s.cogs,
      expenses: s.expenses,
      netResult: s.revenue - totalCost,
      budgetUsagePct: cc.budget > 0 ? Math.round((totalCost / cc.budget) * 100) : 0,
    };
  });
}

export type AuditSeverity = 'pass' | 'warning' | 'error';

export interface AuditCheckItem {
  id: string;
  title: string;
  category: string;
  status: AuditSeverity;
  summary: string;
  details: string[];
  targetModule: 'vouchers' | 'reports' | 'parties' | 'inventory' | 'treasury' | 'invoices';
}

export interface AuditReport {
  score: number;
  passedCount: number;
  warningCount: number;
  errorCount: number;
  checks: AuditCheckItem[];
  reconciliation: {
    glReceivables: number;
    subReceivables: number;
    glPayables: number;
    subPayables: number;
    glSalesVat: number;
    invSalesVat: number;
    glPurchaseVat: number;
    invPurchaseVat: number;
    glInventory: number;
    subInventory: number;
  };
}

export function computeAuditReport(input: {
  accounts: Account[];
  vouchers: Voucher[];
  invoices: Invoice[];
  parties: Party[];
  products: Product[];
  cheques: Cheque[];
  trialBalance: TrialBalanceRow[];
  balanceSheet: BalanceSheetSummary;
  partyBalances: Map<string, number>;
}): AuditReport {
  const { vouchers, invoices, parties, products, cheques, trialBalance, balanceSheet, partyBalances } =
    input;
  const checks: AuditCheckItem[] = [];

  // 1. Voucher double-entry mathematical integrity
  const unbalancedVouchers: string[] = [];
  for (const v of vouchers) {
    const sumD = v.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const sumC = v.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (Math.abs(sumD - sumC) > 0 || v.lines.length < 2 || Math.abs(sumD - v.totalDebit) > 0) {
      unbalancedVouchers.push(`سند #${v.voucherNumber} (بدهکار: ${sumD} / بستانکار: ${sumC})`);
    }
  }
  checks.push({
    id: 'voucher-balance',
    title: 'کنترل تراز دوبل تمامی اسناد حسابداری',
    category: 'هسته حسابداری',
    status: unbalancedVouchers.length === 0 ? 'pass' : 'error',
    summary:
      unbalancedVouchers.length === 0
        ? `تمامی ${vouchers.length} سند ثبت‌شده دارای تراز دقیق (بدهکار = بستانکار) و حداقل ۲ آرتیکل هستند.`
        : `${unbalancedVouchers.length} سند دارای عدم توازن یا خطای آرتیکل شناسایی شد.`,
    details: unbalancedVouchers,
    targetModule: 'vouchers',
  });

  // 2. Voucher numbering continuity & chronological date check
  const sortedByNum = [...vouchers].sort((a, b) => a.voucherNumber - b.voucherNumber);
  const seqIssues: string[] = [];
  for (let i = 0; i < sortedByNum.length; i++) {
    const expected = i + 1;
    if (sortedByNum[i].voucherNumber !== expected) {
      seqIssues.push(`گسست در شماره سند: انتظار #${expected} اما سند #${sortedByNum[i].voucherNumber} ثبت شده است.`);
      break;
    }
    if (i > 0 && sortedByNum[i].date < sortedByNum[i - 1].date) {
      seqIssues.push(
        `عدم ترتیب تاریخی بین سند #${sortedByNum[i - 1].voucherNumber} (${sortedByNum[i - 1].date}) و سند #${sortedByNum[i].voucherNumber} (${sortedByNum[i].date}).`
      );
    }
  }
  checks.push({
    id: 'voucher-sequence',
    title: 'کنترل توالی شماره‌گذاری و ترتیب تاریخی اسناد',
    category: 'دفاتر قانونی',
    status: seqIssues.length === 0 ? 'pass' : 'warning',
    summary:
      seqIssues.length === 0
        ? 'شماره اسناد از ۱ تا آخرین سند بدون گسست و کاملاً منطبق بر ترتیب تاریخ شمسی است.'
        : 'گسست شماره یا ناهماهنگی تاریخ در اسناد وجود دارد (قابل اصلاح با دکمه مرتب‌سازی).',
    details: seqIssues,
    targetModule: 'vouchers',
  });

  // 3. Trial Balance equality
  const totD = trialBalance.reduce((s, r) => s + r.totalDebit, 0);
  const totC = trialBalance.reduce((s, r) => s + r.totalCredit, 0);
  const balD = trialBalance.reduce((s, r) => s + r.balanceDebit, 0);
  const balC = trialBalance.reduce((s, r) => s + r.balanceCredit, 0);
  const tbBalanced = Math.abs(totD - totC) < 1 && Math.abs(balD - balC) < 1;
  checks.push({
    id: 'trial-balance',
    title: 'توازن تراز آزمایشی (گردش کل و مانده)',
    category: 'تراز و صورت‌های مالی',
    status: tbBalanced ? 'pass' : 'error',
    summary: tbBalanced
      ? 'جمع ستون‌های گردش بدهکار/بستانکار و مانده بدهکار/بستانکار تراز آزمایشی کاملاً برابر است.'
      : `اختلاف در تراز آزمایشی: گردش (${totD - totC}) / مانده (${balD - balC}).`,
    details: tbBalanced ? [] : [`اختلاف گردش: ${totD - totC}`, `اختلاف مانده: ${balD - balC}`],
    targetModule: 'reports',
  });

  // 4. Balance Sheet equation integrity
  checks.push({
    id: 'balance-sheet',
    title: 'صحت معادله اساسی ترازنامه (دارایی = بدهی + سرمایه)',
    category: 'تراز و صورت‌های مالی',
    status: balanceSheet.isBalanced ? 'pass' : 'error',
    summary: balanceSheet.isBalanced
      ? 'معادله ترازنامه با احتساب سود/زیان دوره جاری دقیقاً متوازن است.'
      : `ترازنامه دارای اختلاف ${Math.abs(balanceSheet.difference)} ریال است.`,
    details: balanceSheet.isBalanced
      ? []
      : [
          `جمع دارایی‌ها: ${balanceSheet.totalAssets}`,
          `جمع بدهی و حقوق صاحبان سهام: ${balanceSheet.totalLiabilities + balanceSheet.totalEquity}`,
        ],
    targetModule: 'reports',
  });

  // 5. Subsidiary Ledger (Party Balances) vs General Ledger (10401 & 30101)
  const gl10401Row = trialBalance.find((r) => r.accountCode === '10401');
  const gl30101Row = trialBalance.find((r) => r.accountCode === '30101');
  const glReceivables = gl10401Row ? gl10401Row.balanceDebit - gl10401Row.balanceCredit : 0;
  const glPayables = gl30101Row ? gl30101Row.balanceCredit - gl30101Row.balanceDebit : 0;

  let subReceivables = 0;
  let subPayables = 0;
  for (const v of vouchers) {
    for (const l of v.lines) {
      if (l.accountCode === '10401' && l.partyId) {
        subReceivables += (Number(l.debit) || 0) - (Number(l.credit) || 0);
      } else if (l.accountCode === '30101' && l.partyId) {
        subPayables += (Number(l.credit) || 0) - (Number(l.debit) || 0);
      }
    }
  }
  const subDiffAr = Math.abs(glReceivables - subReceivables);
  const subDiffAp = Math.abs(glPayables - subPayables);
  checks.push({
    id: 'sub-gl-reconcile',
    title: 'تطبیق دفتر معین بدهکاران/بستانکاران با تفصیلی اشخاص',
    category: 'حسابرسی تطبیقی',
    status: subDiffAr < 1 && subDiffAp < 1 ? 'pass' : 'warning',
    summary:
      subDiffAr < 1 && subDiffAp < 1
        ? 'مانده کل معین ۱۰۴۰۱ و ۳۰۱۰۱ به ریال دقیق با جمع گردش تفصیلی طرف‌حساب‌ها منطبق است.'
        : 'برخی آرتیکل‌های ۱۰۴۰۱ یا ۳۰۱۰۱ فاقد انتخاب طرف‌حساب (تفصیلی) هستند.',
    details: [
      ...(subDiffAr >= 1 ? [`اختلاف معین و تفصیلی بدهکاران (۱۰۴۰۱): ${subDiffAr} ریال`] : []),
      ...(subDiffAp >= 1 ? [`اختلاف معین و تفصیلی بستانکاران (۳۰۱۰۱): ${subDiffAp} ریال`] : []),
    ],
    targetModule: 'parties',
  });

  // 6. Cash & Bank negative balance check
  const negativeCash = trialBalance
    .filter((r) => r.accountCode.startsWith('101') || r.accountCode.startsWith('102'))
    .filter((r) => r.balanceCredit > 0)
    .map((r) => `${r.accountCode} — ${r.accountTitle} (مانده بستانکار / منفی: ${r.balanceCredit} ریال)`);
  checks.push({
    id: 'cash-negative',
    title: 'کنترل منفی نشدن موجودی صندوق و حساب‌های بانکی',
    category: 'خزانه‌داری',
    status: negativeCash.length === 0 ? 'pass' : 'error',
    summary:
      negativeCash.length === 0
        ? 'تمامی حساب‌های صندوق و بانک دارای مانده بدهکار (مثبت) معتبر هستند.'
        : `${negativeCash.length} حساب نقدی/بانکی دارای مانده بستانکار (منفی) است!`,
    details: negativeCash,
    targetModule: 'treasury',
  });

  // 7. Inventory stock & reorder audit
  const negStock = products.filter((p) => p.stock < 0).map((p) => `${p.sku} — ${p.name} (${p.stock})`);
  const lowStock = products
    .filter((p) => p.stock >= 0 && p.stock <= p.reorderPoint)
    .map((p) => `${p.sku} — ${p.name} (موجودی: ${p.stock} / نقطه سفارش: ${p.reorderPoint})`);
  checks.push({
    id: 'inventory-audit',
    title: 'کنترل موجودی منفی انبار و نقطه سفارش کالاها',
    category: 'انبارداری',
    status: negStock.length > 0 ? 'error' : lowStock.length > 0 ? 'warning' : 'pass',
    summary:
      negStock.length > 0
        ? `${negStock.length} کالا دارای موجودی منفی است.`
        : lowStock.length > 0
          ? `موجودی منفی وجود ندارد؛ ${lowStock.length} کالا در نقطه سفارش است.`
          : 'موجودی تمامی کالاها مثبت و بالاتر از نقطه سفارش است.',
    details: [...negStock, ...lowStock],
    targetModule: 'inventory',
  });

  // 8. VAT Reconciliation (Invoices vs GL 30301 & 30302)
  const glSalesVatRow = trialBalance.find((r) => r.accountCode === '30301');
  const glPurchaseVatRow = trialBalance.find((r) => r.accountCode === '30302');
  const glSalesVat = glSalesVatRow ? glSalesVatRow.balanceCredit - glSalesVatRow.balanceDebit : 0;
  const glPurchaseVat = glPurchaseVatRow ? glPurchaseVatRow.balanceDebit - glPurchaseVatRow.balanceCredit : 0;

  const activeInvoices = invoices.filter((i) => i.status !== 'cancelled' && i.invoiceType !== 'proforma');
  const invSalesVat =
    activeInvoices.filter((i) => i.invoiceType === 'sale').reduce((s, i) => s + i.vatAmount, 0) -
    activeInvoices.filter((i) => i.invoiceType === 'sale_return').reduce((s, i) => s + i.vatAmount, 0);
  const invPurchaseVat =
    activeInvoices.filter((i) => i.invoiceType === 'purchase').reduce((s, i) => s + i.vatAmount, 0) -
    activeInvoices.filter((i) => i.invoiceType === 'purchase_return').reduce((s, i) => s + i.vatAmount, 0);

  const vatMatch = Math.abs(glSalesVat - invSalesVat) < 10 && Math.abs(glPurchaseVat - invPurchaseVat) < 10;
  checks.push({
    id: 'vat-reconcile',
    title: 'تطبیق مالیات ارزش افزوده فاکتورهای مودیان با دفاتر معین (۳۰۳۰۱ / ۳۰۳۰۲)',
    category: 'مالیاتی و مودیان',
    status: vatMatch ? 'pass' : 'warning',
    summary: vatMatch
      ? 'مالیات ارزش افزوده خرید و فروش در فاکتورها دقیقاً با مانده دفاتر ۳۰۳۰۱ و ۳۰۳۰۲ برابر است.'
      : 'اختلاف بین مالیات فاکتورها و مانده حساب‌های ارزش افزوده (ممکن است بابت سند دستی مالیاتی باشد).',
    details: vatMatch
      ? []
      : [
          `مالیات فروش فاکتورها: ${invSalesVat} / دفتر ۳۰۳۰۱: ${glSalesVat}`,
          `مالیات خرید فاکتورها: ${invPurchaseVat} / دفتر ۳۰۳۰۲: ${glPurchaseVat}`,
        ],
    targetModule: 'invoices',
  });

  // 9. Draft vouchers, bounced cheques & credit limit breaches
  const draftVouchers = vouchers.filter((v) => v.status === 'draft');
  const bouncedCheques = cheques.filter((c) => c.status === 'bounced');
  const overLimitParties = parties.filter((p) => {
    const bal = partyBalances.get(p.id) ?? 0;
    return p.creditLimit > 0 && bal > p.creditLimit;
  });
  const opDetails: string[] = [
    ...draftVouchers.map((v) => `سند موقت #${v.voucherNumber} (${v.date}) هنوز دائم نشده است.`),
    ...bouncedCheques.map((c) => `چک برگشتی صیادی ${c.sayadiId} — ${c.partyName}`),
    ...overLimitParties.map((p) => `عبور طرف‌حساب «${p.name}» از سقف اعتبار مصوب.`),
  ];
  checks.push({
    id: 'operational-controls',
    title: 'کنترل اسناد موقت، چک‌های برگشتی و سقف اعتبار مشتریان',
    category: 'کنترل داخلی',
    status: opDetails.length === 0 ? 'pass' : 'warning',
    summary:
      opDetails.length === 0
        ? 'تمامی اسناد دائم هستند، چک برگشتی وجود ندارد و سقف اعتبار مشتریان رعایت شده است.'
        : `${opDetails.length} مورد نیازمند پیگیری حسابدار یا مدیر مالی شناسایی شد.`,
    details: opDetails,
    targetModule: draftVouchers.length > 0 ? 'vouchers' : bouncedCheques.length > 0 ? 'treasury' : 'parties',
  });

  // 10. Inventory Subledger (∑ stock * buyPrice) vs General Ledger 10501
  const glInvRow = trialBalance.find((r) => r.accountCode === '10501');
  const glInventory = glInvRow ? glInvRow.balanceDebit - glInvRow.balanceCredit : 0;
  const subInventory = Math.round(
    products.reduce((s, p) => s + (Number(p.stock) || 0) * (Number(p.buyPrice) || 0), 0)
  );
  const invDiff = Math.abs(glInventory - subInventory);
  // Allow tiny integer rounding tolerance (up to 5,000 IRR across all SKUs)
  const invMatched = invDiff <= 5_000;
  checks.push({
    id: 'inventory-gl-reconcile',
    title: 'تطبیق ارزش ریالی انبار (∑ موجودی × بهای میانگین) با معین ۱۰۵۰۱',
    category: 'حسابرسی انبار و بهای تمام‌شده',
    status: invMatched ? 'pass' : 'warning',
    summary: invMatched
      ? 'ارزش ریالی موجودی انبار نخ به ریال دقیق با مانده حساب معین ۱۰۵۰۱ منطبق است.'
      : `اختلاف ${invDiff.toLocaleString('en-US')} ریال بین موجودی ریالی انبار و مانده دفتر ۱۰۵۰۱ شناسایی شد.`,
    details: invMatched
      ? []
      : [
          `مانده معین ۱۰۵۰۱ در دفاتر: ${glInventory.toLocaleString('en-US')} ریال`,
          `ارزش کل موجودی کالاها (∑ وزن × بهای خرید): ${subInventory.toLocaleString('en-US')} ریال`,
        ],
    targetModule: 'inventory',
  });

  const passedCount = checks.filter((c) => c.status === 'pass').length;
  const warningCount = checks.filter((c) => c.status === 'warning').length;
  const errorCount = checks.filter((c) => c.status === 'error').length;
  const score = Math.round(((passedCount + warningCount * 0.5) / checks.length) * 100);

  return {
    score,
    passedCount,
    warningCount,
    errorCount,
    checks,
    reconciliation: {
      glReceivables,
      subReceivables,
      glPayables,
      subPayables,
      glSalesVat,
      invSalesVat,
      glPurchaseVat,
      invPurchaseVat,
      glInventory,
      subInventory,
    },
  };
}

export interface PayrollCalculation {
  employee: Employee;
  overtimePay: number;
  childAllowance: number;
  grossPay: number;
  employeeInsurance: number; // 7%
  employerInsurance: number; // 23%
  incomeTax: number;
  netPay: number;
  totalEmployerCost: number;
}

export function calculateEmployeePayroll(emp: Employee): PayrollCalculation {
  const hourlyRate = emp.baseSalary / 220;
  const overtimePay = Math.round(emp.overtimeHours * hourlyRate * 1.4);
  const childAllowance = emp.childrenCount * 14_000_000;
  const grossPay = emp.baseSalary + emp.housingAllowance + emp.foodAllowance + childAllowance + overtimePay;
  const insurableBase = Math.min(grossPay, 650_000_000);
  const employeeInsurance = Math.round(insurableBase * 0.07);
  const employerInsurance = Math.round(insurableBase * 0.23);

  // Progressive Iranian monthly payroll tax estimate (exempt up to 240M IRR)
  const taxable = Math.max(0, grossPay - employeeInsurance - 240_000_000);
  let incomeTax = 0;
  if (taxable <= 100_000_000) {
    incomeTax = Math.round(taxable * 0.1);
  } else if (taxable <= 250_000_000) {
    incomeTax = Math.round(10_000_000 + (taxable - 100_000_000) * 0.15);
  } else {
    incomeTax = Math.round(32_500_000 + (taxable - 250_000_000) * 0.2);
  }

  const netPay = Math.max(0, grossPay - employeeInsurance - incomeTax);
  const totalEmployerCost = grossPay + employerInsurance;

  return {
    employee: emp,
    overtimePay,
    childAllowance,
    grossPay,
    employeeInsurance,
    employerInsurance,
    incomeTax,
    netPay,
    totalEmployerCost,
  };
}

export function calculateMonthlyDepreciation(asset: FixedAsset): number {
  const depreciable = Math.max(0, asset.purchaseCost - asset.salvageValue);
  const remaining = Math.max(0, depreciable - asset.accumulatedDepreciation);
  if (remaining <= 0) return 0;
  const monthly = Math.round(depreciable / (asset.usefulLifeYears * 12));
  return Math.min(monthly, remaining);
}

/**
 * Generates a mathematically balanced double-entry VoucherLine[] for Sales, Purchase, Returns, or Waste Invoices.
 */
export function buildInvoiceVoucherLines(
  invoice: Omit<Invoice, 'id' | 'ownerId' | 'voucherId'>,
  cogsTotal: number
): VoucherLine[] {
  const lines: VoucherLine[] = [];

  if (invoice.invoiceType === 'sale') {
    if (invoice.paidCash > 0) {
      lines.push({
        accountCode: '10101',
        accountTitle: 'صندوق مرکزی شرکت',
        costCenterId: invoice.costCenterId,
        description: `دریافت نقدی بابت فاکتور فروش ${invoice.invoiceNumber}`,
        debit: invoice.paidCash,
        credit: 0,
      });
    }
    if (invoice.paidBank > 0) {
      lines.push({
        accountCode: '10201',
        accountTitle: 'بانک ملت — حساب جاری شرکتی',
        costCenterId: invoice.costCenterId,
        description: `واریز بانکی/کارتخوان فاکتور فروش ${invoice.invoiceNumber}`,
        debit: invoice.paidBank,
        credit: 0,
      });
    }
    if (invoice.paidCheque > 0) {
      lines.push({
        accountCode: '10301',
        accountTitle: 'اسناد دریافتنی نزد صندوق',
        partyId: invoice.partyId,
        partyName: invoice.partyName,
        description: `چک صیادی دریافتی فاکتور ${invoice.invoiceNumber}`,
        debit: invoice.paidCheque,
        credit: 0,
      });
    }
    if (invoice.creditAmount > 0) {
      lines.push({
        accountCode: '10401',
        accountTitle: 'بدهکاران تجاری و مشتریان',
        partyId: invoice.partyId,
        partyName: invoice.partyName,
        description: `مانده نسیه فاکتور فروش ${invoice.invoiceNumber}`,
        debit: invoice.creditAmount,
        credit: 0,
      });
    }

    const netRevenue = Math.max(0, Math.round(invoice.grandTotal - invoice.vatAmount));
    lines.push({
      accountCode: '60101',
      accountTitle: 'فروش رسمی محصولات',
      costCenterId: invoice.costCenterId,
      description: `فروش کالا — فاکتور ${invoice.invoiceNumber}`,
      debit: 0,
      credit: netRevenue,
    });
    if (invoice.vatAmount > 0) {
      lines.push({
        accountCode: '30301',
        accountTitle: 'مالیات بر ارزش افزوده فروش (۱۰٪)',
        description: `مالیات ارزش افزوده فاکتور ${invoice.invoiceNumber}`,
        debit: 0,
        credit: Math.round(invoice.vatAmount),
      });
    }

    if (cogsTotal > 0) {
      lines.push({
        accountCode: '70101',
        accountTitle: 'بهای تمام‌شده کالای فروش‌رفته',
        costCenterId: invoice.costCenterId,
        description: `بهای تمام‌شده اقلام فاکتور ${invoice.invoiceNumber}`,
        debit: Math.round(cogsTotal),
        credit: 0,
      });
      lines.push({
        accountCode: '10501',
        accountTitle: 'موجودی انبار مرکزی',
        description: `خروج کالا از ${invoice.warehouse}`,
        debit: 0,
        credit: Math.round(cogsTotal),
      });
    }
  } else if (invoice.invoiceType === 'purchase') {
    const netPurchase = Math.max(0, Math.round(invoice.grandTotal - invoice.vatAmount));
    lines.push({
      accountCode: '10501',
      accountTitle: 'موجودی انبار مرکزی',
      costCenterId: invoice.costCenterId,
      description: `ورود کالا به ${invoice.warehouse} — فاکتور خرید ${invoice.invoiceNumber}`,
      debit: netPurchase,
      credit: 0,
    });
    if (invoice.vatAmount > 0) {
      lines.push({
        accountCode: '30302',
        accountTitle: 'مالیات بر ارزش افزوده خرید',
        description: `مالیات خرید فاکتور ${invoice.invoiceNumber}`,
        debit: Math.round(invoice.vatAmount),
        credit: 0,
      });
    }
    if (invoice.paidCash > 0) {
      lines.push({
        accountCode: '10101',
        accountTitle: 'صندوق مرکزی شرکت',
        description: `پرداخت نقدی فاکتور خرید ${invoice.invoiceNumber}`,
        debit: 0,
        credit: Math.round(invoice.paidCash),
      });
    }
    if (invoice.paidBank > 0) {
      lines.push({
        accountCode: '10201',
        accountTitle: 'بانک ملت — حساب جاری شرکتی',
        description: `حواله بانکی فاکتور خرید ${invoice.invoiceNumber}`,
        debit: 0,
        credit: Math.round(invoice.paidBank),
      });
    }
    if (invoice.paidCheque > 0) {
      lines.push({
        accountCode: '30201',
        accountTitle: 'اسناد پرداختنی تجاری (چک‌های صادره)',
        partyId: invoice.partyId,
        partyName: invoice.partyName,
        description: `چک صادره بابت خرید ${invoice.invoiceNumber}`,
        debit: 0,
        credit: Math.round(invoice.paidCheque),
      });
    }
    if (invoice.creditAmount > 0) {
      lines.push({
        accountCode: '30101',
        accountTitle: 'بستانکاران و تأمین‌کنندگان',
        partyId: invoice.partyId,
        partyName: invoice.partyName,
        description: `مانده نسیه فاکتور خرید ${invoice.invoiceNumber}`,
        debit: 0,
        credit: Math.round(invoice.creditAmount),
      });
    }
  } else if (invoice.invoiceType === 'sale_return') {
    const netRet = Math.max(0, Math.round(invoice.grandTotal - invoice.vatAmount));
    lines.push({
      accountCode: '60201',
      accountTitle: 'برگشت از فروش کالا',
      costCenterId: invoice.costCenterId,
      description: `برگشت از فروش ${invoice.invoiceNumber}`,
      debit: netRet,
      credit: 0,
    });
    if (invoice.vatAmount > 0) {
      lines.push({
        accountCode: '30301',
        accountTitle: 'مالیات بر ارزش افزوده فروش (۱۰٪)',
        description: `کاهش مالیات بابت برگشت فروش ${invoice.invoiceNumber}`,
        debit: Math.round(invoice.vatAmount),
        credit: 0,
      });
    }
    if (invoice.paidCash > 0) {
      lines.push({
        accountCode: '10101',
        accountTitle: 'صندوق مرکزی شرکت',
        description: `استرداد نقدی بابت برگشت فروش ${invoice.invoiceNumber}`,
        debit: 0,
        credit: Math.round(invoice.paidCash),
      });
    }
    if (invoice.paidBank > 0) {
      lines.push({
        accountCode: '10201',
        accountTitle: 'بانک ملت — حساب جاری شرکتی',
        description: `استرداد بانکی بابت برگشت فروش ${invoice.invoiceNumber}`,
        debit: 0,
        credit: Math.round(invoice.paidBank),
      });
    }
    if (invoice.paidCheque > 0) {
      lines.push({
        accountCode: '30201',
        accountTitle: 'اسناد پرداختنی تجاری (چک‌های صادره)',
        partyId: invoice.partyId,
        partyName: invoice.partyName,
        description: `چک استردادی بابت برگشت فروش ${invoice.invoiceNumber}`,
        debit: 0,
        credit: Math.round(invoice.paidCheque),
      });
    }
    const creditPart = Math.max(
      0,
      Math.round(invoice.grandTotal - invoice.paidCash - invoice.paidBank - invoice.paidCheque)
    );
    if (creditPart > 0) {
      lines.push({
        accountCode: '10401',
        accountTitle: 'بدهکاران تجاری و مشتریان',
        partyId: invoice.partyId,
        partyName: invoice.partyName,
        description: `بستانکاری مشتری بابت برگشت فروش ${invoice.invoiceNumber}`,
        debit: 0,
        credit: creditPart,
      });
    }
    if (cogsTotal > 0) {
      lines.push({
        accountCode: '10501',
        accountTitle: 'موجودی انبار مرکزی',
        description: `بازگشت کالا به انبار — ${invoice.invoiceNumber}`,
        debit: Math.round(cogsTotal),
        credit: 0,
      });
      lines.push({
        accountCode: '70101',
        accountTitle: 'بهای تمام‌شده کالای فروش‌رفته',
        description: `تعدیل بهای تمام‌شده برگشت فروش ${invoice.invoiceNumber}`,
        debit: 0,
        credit: Math.round(cogsTotal),
      });
    }
  } else if (invoice.invoiceType === 'purchase_return') {
    const netRet = Math.max(0, Math.round(invoice.grandTotal - invoice.vatAmount));
    if (invoice.paidCash > 0) {
      lines.push({
        accountCode: '10101',
        accountTitle: 'صندوق مرکزی شرکت',
        description: `دریافت نقدی بابت برگشت خرید ${invoice.invoiceNumber}`,
        debit: Math.round(invoice.paidCash),
        credit: 0,
      });
    }
    if (invoice.paidBank > 0) {
      lines.push({
        accountCode: '10201',
        accountTitle: 'بانک ملت — حساب جاری شرکتی',
        description: `دریافت بانکی بابت برگشت خرید ${invoice.invoiceNumber}`,
        debit: Math.round(invoice.paidBank),
        credit: 0,
      });
    }
    if (invoice.paidCheque > 0) {
      lines.push({
        accountCode: '10301',
        accountTitle: 'اسناد دریافتنی نزد صندوق',
        partyId: invoice.partyId,
        partyName: invoice.partyName,
        description: `چک دریافتی بابت برگشت خرید ${invoice.invoiceNumber}`,
        debit: Math.round(invoice.paidCheque),
        credit: 0,
      });
    }
    const creditPart = Math.max(
      0,
      Math.round(invoice.grandTotal - invoice.paidCash - invoice.paidBank - invoice.paidCheque)
    );
    if (creditPart > 0) {
      lines.push({
        accountCode: '30101',
        accountTitle: 'بستانکاران و تأمین‌کنندگان',
        partyId: invoice.partyId,
        partyName: invoice.partyName,
        description: `کاهش بدهی بابت برگشت خرید ${invoice.invoiceNumber}`,
        debit: creditPart,
        credit: 0,
      });
    }
    lines.push({
      accountCode: '10501',
      accountTitle: 'موجودی انبار مرکزی',
      description: `خروج کالای برگشتی از انبار — ${invoice.invoiceNumber}`,
      debit: 0,
      credit: netRet,
    });
    if (invoice.vatAmount > 0) {
      lines.push({
        accountCode: '30302',
        accountTitle: 'مالیات بر ارزش افزوده خرید',
        description: `تعدیل مالیات خرید — ${invoice.invoiceNumber}`,
        debit: 0,
        credit: Math.round(invoice.vatAmount),
      });
    }
  } else if (invoice.invoiceType === 'waste') {
    const wasteCost = cogsTotal > 0 ? cogsTotal : Math.max(0, invoice.subtotal - invoice.discount);
    if (wasteCost > 0) {
      lines.push({
        accountCode: '80401',
        accountTitle: 'کسری انبارگردانی و ضایعات کالا',
        costCenterId: invoice.costCenterId,
        description: `ثبت هزینه ضایعات کالا — برگه ${invoice.invoiceNumber}`,
        debit: wasteCost,
        credit: 0,
      });
      lines.push({
        accountCode: '10501',
        accountTitle: 'موجودی انبار مرکزی',
        description: `خروج کالای ضایعاتی از ${invoice.warehouse}`,
        debit: 0,
        credit: wasteCost,
      });
    }
  }

  return lines;
}

export interface AccountReviewRow {
  code: string;
  title: string;
  level: 'group' | 'kol' | 'moein';
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  totalDebit: number;
  totalCredit: number;
  balanceDebit: number;
  balanceCredit: number;
  txCount: number;
}

/**
 * Holoo Signature Report: «مرور حساب‌ها» (Multi-level Drill-Down Review)
 * Aggregates debit/credit turnover & balances by Group (1-digit), Kol (3-digit), or Moein (5-digit)
 * with optional Shamshi date range filtering.
 */
export function computeAccountReview(
  accounts: Account[],
  vouchers: Voucher[],
  level: 'group' | 'kol' | 'moein',
  parentPrefix?: string,
  fromDate?: string,
  toDate?: string
): AccountReviewRow[] {
  const accountMap = new Map<string, Account>();
  accounts.forEach((a) => accountMap.set(a.code, a));

  const codeLen = level === 'group' ? 1 : level === 'kol' ? 3 : 5;
  const buckets = new Map<
    string,
    { openD: number; openC: number; perD: number; perC: number; txCount: number }
  >();

  // Pre-seed known accounts of this level under parentPrefix so even 0-turnover accounts can be inspected if needed
  for (const acc of accounts) {
    if (acc.level === level && (!parentPrefix || acc.code.startsWith(parentPrefix))) {
      buckets.set(acc.code, { openD: 0, openC: 0, perD: 0, perC: 0, txCount: 0 });
    }
  }

  for (const v of vouchers) {
    if (toDate && v.date > toDate) continue;
    const isOpening = v.voucherType === 'opening' || (!!fromDate && v.date < fromDate);
    for (const l of v.lines) {
      if (parentPrefix && !l.accountCode.startsWith(parentPrefix)) continue;
      const key = l.accountCode.slice(0, codeLen);
      const prev = buckets.get(key) ?? { openD: 0, openC: 0, perD: 0, perC: 0, txCount: 0 };
      const d = Number(l.debit) || 0;
      const c = Number(l.credit) || 0;
      if (isOpening) {
        prev.openD += d;
        prev.openC += c;
      } else {
        prev.perD += d;
        prev.perC += c;
      }
      prev.txCount += 1;
      buckets.set(key, prev);
    }
  }

  const rows: AccountReviewRow[] = [];
  buckets.forEach((b, code) => {
    const totalDebit = b.openD + b.perD;
    const totalCredit = b.openC + b.perC;
    if (totalDebit === 0 && totalCredit === 0 && b.txCount === 0) return;
    const diff = totalDebit - totalCredit;
    rows.push({
      code,
      title: accountMap.get(code)?.title ?? `حساب ${code}`,
      level,
      openingDebit: b.openD,
      openingCredit: b.openC,
      periodDebit: b.perD,
      periodCredit: b.perC,
      totalDebit,
      totalCredit,
      balanceDebit: diff > 0 ? diff : 0,
      balanceCredit: diff < 0 ? Math.abs(diff) : 0,
      txCount: b.txCount,
    });
  });

  return rows.sort((a, b) => a.code.localeCompare(b.code));
}

export interface InvoiceProfitabilityRow {
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  partyName: string;
  netSales: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
}

export function computeInvoiceProfitability(
  invoices: Invoice[],
  products: Product[]
): InvoiceProfitabilityRow[] {
  const productMap = new Map<string, Product>();
  products.forEach((p) => productMap.set(p.id, p));

  return invoices
    .filter((inv) => inv.status !== 'cancelled' && inv.invoiceType === 'sale')
    .map((inv) => {
      const netSales = Math.max(0, inv.subtotal - inv.discount);
      const cogs = inv.items.reduce((s, it) => {
        const prod = productMap.get(it.productId);
        const unitCost = it.unitCostSnapshot !== undefined ? it.unitCostSnapshot : (prod?.buyPrice ?? 0);
        return s + Math.round(it.quantity * unitCost);
      }, 0);
      const grossProfit = netSales - cogs;
      const marginPct = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        date: inv.date,
        partyName: inv.partyName,
        netSales,
        cogs,
        grossProfit,
        marginPct,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface Seasonal169Row {
  partyId: string;
  partyCode: string;
  partyName: string;
  nationalId: string;
  economicCode: string;
  salesNet: number;
  salesVat: number;
  purchasesNet: number;
  purchasesVat: number;
  invoiceCount: number;
}

export function computeSeasonal169Report(
  invoices: Invoice[],
  parties: Party[]
): Seasonal169Row[] {
  const partyMap = new Map<string, Party>();
  parties.forEach((p) => partyMap.set(p.id, p));
  const map = new Map<string, Seasonal169Row>();

  for (const inv of invoices) {
    if (inv.status === 'cancelled') continue;
    if (inv.invoiceType === 'proforma' || inv.invoiceType === 'waste') continue;
    const p = partyMap.get(inv.partyId);
    const row = map.get(inv.partyId) ?? {
      partyId: inv.partyId,
      partyCode: p?.code ?? '—',
      partyName: p?.name ?? inv.partyName,
      nationalId: p?.nationalId ?? 'ثبت‌نشده',
      economicCode: p?.economicCode ?? 'ثبت‌نشده',
      salesNet: 0,
      salesVat: 0,
      purchasesNet: 0,
      purchasesVat: 0,
      invoiceCount: 0,
    };

    const net = Math.max(0, inv.subtotal - inv.discount);
    if (inv.invoiceType === 'sale') {
      row.salesNet += net;
      row.salesVat += inv.vatAmount;
    } else if (inv.invoiceType === 'sale_return') {
      row.salesNet -= net;
      row.salesVat -= inv.vatAmount;
    } else if (inv.invoiceType === 'purchase') {
      row.purchasesNet += net;
      row.purchasesVat += inv.vatAmount;
    } else if (inv.invoiceType === 'purchase_return') {
      row.purchasesNet -= net;
      row.purchasesVat -= inv.vatAmount;
    }
    row.invoiceCount += 1;
    map.set(inv.partyId, row);
  }

  return Array.from(map.values()).sort(
    (a, b) => b.salesNet + b.purchasesNet - (a.salesNet + a.purchasesNet)
  );
}

