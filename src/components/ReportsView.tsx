import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  Download,
  FileCode2,
  MessageCircle,
  Printer,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import {
  computeAccountLedger,
  computeAccountReview,
  computeInvoiceProfitability,
  computePartyLedger,
  computeProductProfitability,
  computeSeasonal169Report,
} from '../lib/accountingEngine';
import {
  buildMoadianInvoiceJson,
  buildTaminDskFiles,
  buildTtmsSalaryCsv,
  computeBrokerCommissions,
  computeReceivablesAging,
} from '../lib/enterpriseAccounting';
import { computeAbcIntelligence } from '../lib/apexExtensions';
import { exportToCsv, formatMoney, formatWeight, getTodayShamsi, toPersianDigits } from '../lib/format';
import { SmartSearchCombobox, SmartSearchOption } from './SmartSearchCombobox';
import { Voucher } from '../types/accounting';

interface ReportsViewProps {
  initialIntent?: string;
  clearIntent?: () => void;
}

type ReportTab =
  | 'trial'
  | 'moroor'
  | 'abc'
  | 'pnl'
  | 'balance'
  | 'ledger'
  | 'party-ledger'
  | 'vat'
  | 'seasonal-169'
  | 'product-profit'
  | 'aging'
  | 'commissions'
  | 'statutory';

function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const ReportsView: React.FC<ReportsViewProps> = ({ initialIntent, clearIntent }) => {
  const {
    trialBalance,
    incomeStatement,
    balanceSheet,
    auditReport,
    partyBalances,
    accounts,
    parties,
    products,
    employees,
    vouchers,
    invoices,
    cheques,
    profile,
    postBrokerCommissionVoucher,
    showToast,
  } = useAccounting();
  const unit = profile.currencyUnit;

  const [tab, setTab] = useState<ReportTab>('trial');
  const [drillVoucher, setDrillVoucher] = useState<Voucher | null>(null);
  const [statutoryMonth, setStatutoryMonth] = useState('آبان ۱۴۰۵');
  const [selectedMoadianInvId, setSelectedMoadianInvId] = useState('');
  const [trialCols, setTrialCols] = useState<2 | 4 | 6 | 8>(8);
  const [ledgerCode, setLedgerCode] = useState('10201');
  const [selectedPartyId, setSelectedPartyId] = useState(parties[0]?.id ?? '');
  const [includeChequesInPartyLedger, setIncludeChequesInPartyLedger] = useState(false);

  // Date range filter (Shamsi YYYY/MM/DD)
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Holoo Moroor-e Hesabha (Multi-level Drill-Down) state
  const [moroorLevel, setMoroorLevel] = useState<'group' | 'kol' | 'moein'>('group');
  const [moroorParent, setMoroorParent] = useState<string | undefined>(undefined);
  const [moroorBreadcrumb, setMoroorBreadcrumb] = useState<{ code: string; title: string; level: 'group' | 'kol' }[]>([]);

  // Profitability sub-mode
  const [profitMode, setProfitMode] = useState<'product' | 'invoice'>('product');

  useEffect(() => {
    if (!initialIntent) return;
    if (
      initialIntent === 'trial' ||
      initialIntent === 'moroor' ||
      initialIntent === 'abc' ||
      initialIntent === 'pnl' ||
      initialIntent === 'balance' ||
      initialIntent === 'ledger' ||
      initialIntent === 'party-ledger' ||
      initialIntent === 'vat' ||
      initialIntent === 'seasonal-169' ||
      initialIntent === 'product-profit' ||
      initialIntent === 'aging' ||
      initialIntent === 'commissions' ||
      initialIntent === 'statutory'
    ) {
      setTab(initialIntent);
    }
    clearIntent?.();
  }, [initialIntent, clearIntent]);

  useEffect(() => {
    if (!selectedPartyId && parties.length > 0) {
      setSelectedPartyId(parties[0].id);
    }
  }, [parties, selectedPartyId]);

  const accountPickerOptions: SmartSearchOption[] = useMemo(
    () =>
      accounts
        .filter((a) => a.level !== 'group')
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({
          id: a.code,
          code: a.code,
          label: a.title,
          sublabel: a.level === 'kol' ? 'سطح کل' : 'سطح معین',
          keywords: `${a.code} ${a.title}`,
        })),
    [accounts]
  );

  const partyPickerOptions: SmartSearchOption[] = useMemo(
    () =>
      parties.map((p) => ({
        id: p.id,
        code: p.code,
        label: p.name,
        sublabel: p.nationalId ? `شناسه: ${p.nationalId}` : p.phone || '',
        keywords: `${p.code} ${p.name} ${p.nationalId || ''} ${p.phone || ''}`,
      })),
    [parties]
  );

  const ledgerEntries = useMemo(
    () => computeAccountLedger(ledgerCode, vouchers, fromDate.trim() || undefined, toDate.trim() || undefined),
    [ledgerCode, vouchers, fromDate, toDate]
  );

  const partyLedgerEntries = useMemo(
    () =>
      selectedPartyId
        ? computePartyLedger(
            selectedPartyId,
            vouchers,
            includeChequesInPartyLedger,
            fromDate.trim() || undefined,
            toDate.trim() || undefined
          )
        : [],
    [selectedPartyId, vouchers, includeChequesInPartyLedger, fromDate, toDate]
  );

  const moroorRows = useMemo(
    () =>
      computeAccountReview(
        accounts,
        vouchers,
        moroorLevel,
        moroorParent,
        fromDate.trim() || undefined,
        toDate.trim() || undefined
      ),
    [accounts, vouchers, moroorLevel, moroorParent, fromDate, toDate]
  );

  const productProfitability = useMemo(
    () => computeProductProfitability(invoices, products),
    [invoices, products]
  );

  const invoiceProfitability = useMemo(
    () => computeInvoiceProfitability(invoices, products),
    [invoices, products]
  );

  const seasonal169Rows = useMemo(
    () => computeSeasonal169Report(invoices, parties),
    [invoices, parties]
  );

  const agingRows = useMemo(
    () => computeReceivablesAging(parties, invoices, partyBalances, getTodayShamsi()),
    [parties, invoices, partyBalances]
  );

  const commissionRows = useMemo(
    () => computeBrokerCommissions(parties, invoices),
    [parties, invoices]
  );

  const abcReport = useMemo(
    () =>
      computeAbcIntelligence({
        products,
        parties,
        invoices,
        cheques,
        partyBalances,
      }),
    [products, parties, invoices, cheques, partyBalances]
  );

  const openVoucherByNumber = (vNum: number) => {
    const found = vouchers.find((v) => v.voucherNumber === vNum);
    if (found) setDrillVoucher(found);
  };

  const trialTotals = useMemo(
    () =>
      trialBalance.reduce(
        (acc, r) => ({
          openD: acc.openD + r.openingDebit,
          openC: acc.openC + r.openingCredit,
          perD: acc.perD + r.periodDebit,
          perC: acc.perC + r.periodCredit,
          totD: acc.totD + r.totalDebit,
          totC: acc.totC + r.totalCredit,
          balD: acc.balD + r.balanceDebit,
          balC: acc.balC + r.balanceCredit,
        }),
        { openD: 0, openC: 0, perD: 0, perC: 0, totD: 0, totC: 0, balD: 0, balC: 0 }
      ),
    [trialBalance]
  );

  // Exact VAT calculation reconciled with GL 30301 & 30302 (excludes cancelled, nets returns)
  const vatSummary = useMemo(() => {
    const activeInvoices = invoices.filter((i) => i.status !== 'cancelled');
    const sales = activeInvoices.filter((i) => i.invoiceType === 'sale');
    const saleReturns = activeInvoices.filter((i) => i.invoiceType === 'sale_return');
    const purchases = activeInvoices.filter((i) => i.invoiceType === 'purchase');
    const purchaseReturns = activeInvoices.filter((i) => i.invoiceType === 'purchase_return');

    const grossSalesNet = sales.reduce((s, i) => s + (i.subtotal - i.discount), 0);
    const saleReturnNet = saleReturns.reduce((s, i) => s + (i.subtotal - i.discount), 0);
    const grossSalesTax = sales.reduce((s, i) => s + i.vatAmount, 0);
    const saleReturnTax = saleReturns.reduce((s, i) => s + i.vatAmount, 0);
    const netSalesTax = grossSalesTax - saleReturnTax;

    const grossPurchaseNet = purchases.reduce((s, i) => s + (i.subtotal - i.discount), 0);
    const purchaseReturnNet = purchaseReturns.reduce((s, i) => s + (i.subtotal - i.discount), 0);
    const grossPurchaseTax = purchases.reduce((s, i) => s + i.vatAmount, 0);
    const purchaseReturnTax = purchaseReturns.reduce((s, i) => s + i.vatAmount, 0);
    const netPurchaseTax = grossPurchaseTax - purchaseReturnTax;

    return {
      grossSalesNet,
      saleReturnNet,
      netSalesBase: grossSalesNet - saleReturnNet,
      grossSalesTax,
      saleReturnTax,
      netSalesTax,
      grossPurchaseNet,
      purchaseReturnNet,
      netPurchaseBase: grossPurchaseNet - purchaseReturnNet,
      grossPurchaseTax,
      purchaseReturnTax,
      netPurchaseTax,
      netPayableVat: netSalesTax - netPurchaseTax,
    };
  }, [invoices]);

  const handleExportCurrentReport = () => {
    if (tab === 'trial') {
      exportToCsv(
        `holoo-trial-balance-8col-${profile.fiscalYear}.csv`,
        [
          'کد حساب',
          'عنوان حساب',
          'اول دوره بد',
          'اول دوره بس',
          'گردش دوره بد',
          'گردش دوره بس',
          'جمع گردش بد',
          'جمع گردش بس',
          'مانده بدهکار',
          'مانده بستانکار',
        ],
        trialBalance.map((r) => [
          r.accountCode,
          r.accountTitle,
          r.openingDebit,
          r.openingCredit,
          r.periodDebit,
          r.periodCredit,
          r.totalDebit,
          r.totalCredit,
          r.balanceDebit,
          r.balanceCredit,
        ])
      );
    } else if (tab === 'ledger') {
      exportToCsv(
        `holoo-ledger-${ledgerCode}-${profile.fiscalYear}.csv`,
        ['شماره سند', 'تاریخ', 'کد حساب', 'شرح', 'بدهکار', 'بستانکار', 'مانده'],
        ledgerEntries.map((r) => [
          r.voucherNumber,
          r.date,
          r.accountCode,
          r.description,
          r.debit,
          r.credit,
          r.runningBalance,
        ])
      );
    } else if (tab === 'party-ledger') {
      const pName = parties.find((p) => p.id === selectedPartyId)?.code ?? 'party';
      exportToCsv(
        `holoo-party-ledger-${pName}-${profile.fiscalYear}.csv`,
        ['شماره سند', 'تاریخ', 'حساب', 'شرح', 'بدهکار', 'بستانکار', 'مانده'],
        partyLedgerEntries.map((r) => [
          r.voucherNumber,
          r.date,
          `${r.accountCode} ${r.accountTitle}`,
          r.description,
          r.debit,
          r.credit,
          r.runningBalance,
        ])
      );
    } else if (tab === 'moroor') {
      exportToCsv(
        `holoo-moroor-${moroorLevel}-${profile.fiscalYear}.csv`,
        ['کد', 'عنوان حساب', 'تعداد آرتیکل', 'گردش بدهکار', 'گردش بستانکار', 'مانده بدهکار', 'مانده بستانکار'],
        moroorRows.map((r) => [
          r.code,
          r.title,
          r.txCount,
          r.totalDebit,
          r.totalCredit,
          r.balanceDebit,
          r.balanceCredit,
        ])
      );
    } else if (tab === 'seasonal-169') {
      exportToCsv(
        `holoo-seasonal-169-${profile.fiscalYear}.csv`,
        ['کد طرف‌حساب', 'نام شخص/شرکت', 'شناسه ملی', 'کد اقتصادی', 'تعداد فاکتور', 'فروش خالص', 'مالیات فروش', 'خرید خالص', 'مالیات خرید'],
        seasonal169Rows.map((r) => [
          r.partyCode,
          r.partyName,
          r.nationalId,
          r.economicCode,
          r.invoiceCount,
          r.salesNet,
          r.salesVat,
          r.purchasesNet,
          r.purchasesVat,
        ])
      );
    } else if (tab === 'product-profit') {
      if (profitMode === 'invoice') {
        exportToCsv(
          `holoo-invoice-profit-${profile.fiscalYear}.csv`,
          ['شماره فاکتور', 'تاریخ', 'مشتری', 'فروش خالص', 'بهای تمام‌شده', 'سود ناخالص', 'حاشیه سود %'],
          invoiceProfitability.map((r) => [
            r.invoiceNumber,
            r.date,
            r.partyName,
            r.netSales,
            r.cogs,
            r.grossProfit,
            r.marginPct.toFixed(1),
          ])
        );
      } else {
        exportToCsv(
          `holoo-product-profit-${profile.fiscalYear}.csv`,
          ['کد کالا', 'نام کالا', 'تعداد فروش', 'برگشت از فروش', 'خالص تعداد', 'فروش خالص', 'بهای تمام‌شده', 'سود ناخالص', 'حاشیه سود %'],
          productProfitability.map((r) => [
            r.sku,
            r.productName,
            r.soldQty,
            r.returnedQty,
            r.netQty,
            r.netSalesRevenue,
            r.estimatedCogs,
            r.grossProfit,
            r.marginPct.toFixed(1),
          ])
        );
      }
    } else if (tab === 'abc') {
      exportToCsv(
        `holoo-abc-products-${profile.fiscalYear}.csv`,
        ['کد کالا', 'نام کالا', 'وزن فروش (کیلو)', 'فروش خالص', 'سود ناخالص', 'حاشیه سود %', 'سهم فروش %', 'رده ABC', 'وضعیت راکد'],
        abcReport.products.map((r) => [
          r.sku,
          r.name,
          r.soldKg,
          r.revenueIrr,
          r.grossProfitIrr,
          r.marginPct,
          r.revenueSharePct,
          r.grade,
          r.isStagnant ? 'راکد' : 'پویا',
        ])
      );
    } else {
      exportToCsv(
        `holoo-trial-balance-${profile.fiscalYear}.csv`,
        ['کد حساب', 'عنوان حساب', 'مانده بدهکار', 'مانده بستانکار'],
        trialBalance.map((r) => [r.accountCode, r.accountTitle, r.balanceDebit, r.balanceCredit])
      );
    }
  };

  const selectedPartyObj = parties.find((p) => p.id === selectedPartyId);
  const vatSalesMatchesGl =
    Math.abs(auditReport.reconciliation.glSalesVat - auditReport.reconciliation.invSalesVat) < 1;
  const vatPurchaseMatchesGl =
    Math.abs(auditReport.reconciliation.glPurchaseVat - auditReport.reconciliation.invPurchaseVat) < 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            گزارش‌گیری مالی پیشرفته و دفاتر قانونی (F9)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            تراز آزمایشی ۲/۴/۶/۸ ستونی، سود و زیان، ترازنامه، دفتر کل و معین، صورتحساب طرف‌حساب، ارزش افزوده مودیان و سود ناخالص کالا
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCurrentReport}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>خروجی اکسل (CSV)</span>
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>چاپ گزارش (Ctrl+P)</span>
          </button>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto no-print">
        {[
          { id: 'trial', label: 'تراز آزمایشی (۲/۴/۶/۸ ستونی)' },
          { id: 'moroor', label: 'مرور حساب‌ها (دریل‌داون)' },
          { id: 'abc', label: 'تحلیل هوشمند ABC' },
          { id: 'pnl', label: 'صورت سود و زیان' },
          { id: 'balance', label: 'ترازنامه' },
          { id: 'ledger', label: 'دفتر کل و معین' },
          { id: 'party-ledger', label: 'صورتحساب طرف‌حساب' },
          { id: 'vat', label: 'ارزش افزوده مودیان' },
          { id: 'seasonal-169', label: 'معاملات فصلی ماده ۱۶۹' },
          { id: 'product-profit', label: 'سود کالا و فاکتور' },
          { id: 'aging', label: 'سنی مطالبات (Aging)' },
          { id: 'commissions', label: 'پورسانت بازاریابان' },
          { id: 'statutory', label: 'خروجی بیمه / مالیات / مودیان' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as ReportTab)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
              tab === t.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Holoo Signature Report: Moroor-e Hesabha (Multi-Level Drill-Down) */}
      {tab === 'moroor' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                مرور حساب‌ها (گروه → کل → معین → ریز گردش دفتر)
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-1.5">
                <button
                  onClick={() => {
                    setMoroorLevel('group');
                    setMoroorParent(undefined);
                    setMoroorBreadcrumb([]);
                  }}
                  className={`hover:text-teal-700 dark:hover:text-teal-400 ${
                    moroorLevel === 'group' ? 'font-bold text-teal-700 dark:text-teal-400' : ''
                  }`}
                >
                  همه گروه‌های حساب
                </button>
                {moroorBreadcrumb.map((bc, idx) => (
                  <React.Fragment key={bc.code}>
                    <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                    <button
                      onClick={() => {
                        if (bc.level === 'group') {
                          setMoroorLevel('kol');
                          setMoroorParent(bc.code);
                          setMoroorBreadcrumb(moroorBreadcrumb.slice(0, idx + 1));
                        } else {
                          setMoroorLevel('moein');
                          setMoroorParent(bc.code);
                          setMoroorBreadcrumb(moroorBreadcrumb.slice(0, idx + 1));
                        }
                      }}
                      className="hover:text-teal-700 dark:hover:text-teal-400 font-semibold text-slate-800 dark:text-slate-200"
                    >
                      {bc.code} — {bc.title}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs no-print">
              <div className="flex items-center gap-1.5">
                <label htmlFor="reports-moroor-from" className="text-slate-500">از تاریخ:</label>
                <input
                  id="reports-moroor-from"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  placeholder="1404/01/01"
                  className="w-28 px-2.5 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label htmlFor="reports-moroor-to" className="text-slate-500">تا تاریخ:</label>
                <input
                  id="reports-moroor-to"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  placeholder="1404/12/29"
                  className="w-28 px-2.5 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              {(fromDate || toDate) && (
                <button
                  onClick={() => {
                    setFromDate('');
                    setToDate('');
                  }}
                  className="text-rose-600 hover:underline"
                >
                  حذف بازه
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                  <th className="py-3 px-4">کد</th>
                  <th className="py-3 px-4">عنوان سرفصل (کلیک برای دریل‌داون)</th>
                  <th className="py-3 px-3 text-left">تعداد گردش</th>
                  <th className="py-3 px-4 text-left">گردش بدهکار</th>
                  <th className="py-3 px-4 text-left">گردش بستانکار</th>
                  <th className="py-3 px-4 text-left">مانده بدهکار</th>
                  <th className="py-3 px-4 text-left">مانده بستانکار</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {moroorRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      در این سطح و بازه تاریخی گردشی ثبت نشده است.
                    </td>
                  </tr>
                ) : (
                  moroorRows.map((row) => (
                    <tr
                      key={row.code}
                      onClick={() => {
                        if (moroorLevel === 'group') {
                          setMoroorBreadcrumb([{ code: row.code, title: row.title, level: 'group' }]);
                          setMoroorParent(row.code);
                          setMoroorLevel('kol');
                        } else if (moroorLevel === 'kol') {
                          setMoroorBreadcrumb((prev) => [
                            ...prev.filter((b) => b.level === 'group'),
                            { code: row.code, title: row.title, level: 'kol' },
                          ]);
                          setMoroorParent(row.code);
                          setMoroorLevel('moein');
                        } else {
                          setLedgerCode(row.code);
                          setTab('ledger');
                        }
                      }}
                      className="cursor-pointer hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-code font-bold text-teal-800 dark:text-teal-400">
                        {row.code}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {row.title}
                      </td>
                      <td className="py-2.5 px-3 text-left font-code tabular-nums text-slate-500">
                        {toPersianDigits(row.txCount)}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {formatMoney(row.totalDebit, unit, false)}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {formatMoney(row.totalCredit, unit, false)}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums font-semibold">
                        {row.balanceDebit > 0 ? formatMoney(row.balanceDebit, unit, false) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                        {row.balanceCredit > 0 ? formatMoney(row.balanceCredit, unit, false) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {moroorRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-bold">
                    <td colSpan={3} className="py-3 px-4">
                      جمع کل این سطح ({toPersianDigits(moroorRows.length)} سرفصل)
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(moroorRows.reduce((s, r) => s + r.totalDebit, 0), unit, false)}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(moroorRows.reduce((s, r) => s + r.totalCredit, 0), unit, false)}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(moroorRows.reduce((s, r) => s + r.balanceDebit, 0), unit, false)}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(moroorRows.reduce((s, r) => s + r.balanceCredit, 0), unit, false)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Trial Balance 2/4/6/8 Columns */}
      {tab === 'trial' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                تراز آزمایشی {toPersianDigits(trialCols)} ستونی — {profile.companyName}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                سال مالی {toPersianDigits(profile.fiscalYear)} · واحد پول:{' '}
                {unit === 'IRT' ? 'تومان' : 'ریال'}
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg no-print">
              {([2, 4, 6, 8] as const).map((cols) => (
                <button
                  key={cols}
                  onClick={() => setTrialCols(cols)}
                  className={`px-3 py-1 text-xs font-medium rounded ${
                    trialCols === cols
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  {toPersianDigits(cols)} ستونی
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                  <th className="py-3 px-3">کد</th>
                  <th className="py-3 px-3">عنوان حساب</th>
                  {trialCols === 8 && (
                    <>
                      <th className="py-3 px-3 text-left">اول دوره بد</th>
                      <th className="py-3 px-3 text-left">اول دوره بس</th>
                    </>
                  )}
                  {trialCols >= 6 && (
                    <>
                      <th className="py-3 px-3 text-left">گردش دوره بد</th>
                      <th className="py-3 px-3 text-left">گردش دوره بس</th>
                    </>
                  )}
                  {trialCols >= 4 && (
                    <>
                      <th className="py-3 px-3 text-left">جمع گردش بد</th>
                      <th className="py-3 px-3 text-left">جمع گردش بس</th>
                    </>
                  )}
                  <th className="py-3 px-3 text-left">مانده بدهکار</th>
                  <th className="py-3 px-3 text-left">مانده بستانکار</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {trialBalance.map((r) => (
                  <tr key={r.accountCode} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-code font-semibold text-teal-800 dark:text-teal-400">
                      {r.accountCode}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                      {r.accountTitle}
                    </td>
                    {trialCols === 8 && (
                      <>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums text-slate-500">
                          {r.openingDebit > 0 ? formatMoney(r.openingDebit, unit, false) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums text-slate-500">
                          {r.openingCredit > 0 ? formatMoney(r.openingCredit, unit, false) : '—'}
                        </td>
                      </>
                    )}
                    {trialCols >= 6 && (
                      <>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums text-slate-600 dark:text-slate-300">
                          {r.periodDebit > 0 ? formatMoney(r.periodDebit, unit, false) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums text-slate-600 dark:text-slate-300">
                          {r.periodCredit > 0 ? formatMoney(r.periodCredit, unit, false) : '—'}
                        </td>
                      </>
                    )}
                    {trialCols >= 4 && (
                      <>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums">
                          {formatMoney(r.totalDebit, unit, false)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums">
                          {formatMoney(r.totalCredit, unit, false)}
                        </td>
                      </>
                    )}
                    <td className="py-2.5 px-3 text-left font-code tabular-nums font-semibold text-slate-900 dark:text-white">
                      {r.balanceDebit > 0 ? formatMoney(r.balanceDebit, unit, false) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-left font-code tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                      {r.balanceCredit > 0 ? formatMoney(r.balanceCredit, unit, false) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-bold text-slate-900 dark:text-white">
                  <td colSpan={2} className="py-3 px-3">
                    جمع کل تراز آزمایشی
                  </td>
                  {trialCols === 8 && (
                    <>
                      <td className="py-3 px-3 text-left font-code tabular-nums">
                        {formatMoney(trialTotals.openD, unit, false)}
                      </td>
                      <td className="py-3 px-3 text-left font-code tabular-nums">
                        {formatMoney(trialTotals.openC, unit, false)}
                      </td>
                    </>
                  )}
                  {trialCols >= 6 && (
                    <>
                      <td className="py-3 px-3 text-left font-code tabular-nums">
                        {formatMoney(trialTotals.perD, unit, false)}
                      </td>
                      <td className="py-3 px-3 text-left font-code tabular-nums">
                        {formatMoney(trialTotals.perC, unit, false)}
                      </td>
                    </>
                  )}
                  {trialCols >= 4 && (
                    <>
                      <td className="py-3 px-3 text-left font-code tabular-nums">
                        {formatMoney(trialTotals.totD, unit, false)}
                      </td>
                      <td className="py-3 px-3 text-left font-code tabular-nums">
                        {formatMoney(trialTotals.totC, unit, false)}
                      </td>
                    </>
                  )}
                  <td className="py-3 px-3 text-left font-code tabular-nums">
                    {formatMoney(trialTotals.balD, unit, false)}
                  </td>
                  <td className="py-3 px-3 text-left font-code tabular-nums">
                    {formatMoney(trialTotals.balC, unit, false)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Income Statement (P&L) */}
      {tab === 'pnl' && (
        <div className="max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 print-container">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              صورت سود و زیان جامع — سال مالی {toPersianDigits(profile.fiscalYear)}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{profile.companyName}</p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <div className="py-3 flex justify-between">
              <span className="text-slate-700 dark:text-slate-300">درآمد ناخالص فروش کالا و خدمات</span>
              <span className="font-code tabular-nums font-semibold">
                {formatMoney(incomeStatement.grossSales, unit)}
              </span>
            </div>
            <div className="py-3 flex justify-between text-rose-700 dark:text-rose-400">
              <span>کسر می‌شود: برگشت از فروش و تخفیفات</span>
              <span className="font-code tabular-nums">
                ({formatMoney(incomeStatement.salesReturns, unit)})
              </span>
            </div>
            <div className="py-3 flex justify-between font-bold bg-slate-50 dark:bg-slate-950/70 px-3 rounded">
              <span>فروش خالص دوره</span>
              <span className="font-code tabular-nums">{formatMoney(incomeStatement.netSales, unit)}</span>
            </div>
            <div className="py-3 flex justify-between text-slate-700 dark:text-slate-300">
              <span>کسر می‌شود: بهای تمام‌شده کالای فروش‌رفته (COGS)</span>
              <span className="font-code tabular-nums">
                ({formatMoney(incomeStatement.cogs, unit)})
              </span>
            </div>
            <div className="py-3 flex justify-between font-bold text-teal-800 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/30 px-3 rounded">
              <span>
                سود ناخالص ({toPersianDigits(incomeStatement.grossMarginPct.toFixed(1))}٪)
              </span>
              <span className="font-code tabular-nums">
                {formatMoney(incomeStatement.grossProfit, unit)}
              </span>
            </div>

            {incomeStatement.expenseRows
              .filter((exp) => !exp.code.startsWith('809'))
              .map((exp) => (
                <div
                  key={exp.code}
                  className="py-2.5 flex justify-between text-xs text-slate-600 dark:text-slate-400 pr-4"
                >
                  <span>
                    {exp.code} — {exp.title}
                  </span>
                  <span className="font-code tabular-nums">({formatMoney(exp.amount, unit)})</span>
                </div>
              ))}

            <div className="py-3 flex justify-between font-bold text-indigo-800 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/30 px-3 rounded">
              <span>سود (زیان) عملیاتی دوره</span>
              <span className="font-code tabular-nums">
                {formatMoney(incomeStatement.operatingProfit, unit)}
              </span>
            </div>

            {incomeStatement.otherRevenue !== 0 && (
              <div className="py-3 flex justify-between text-emerald-700 dark:text-emerald-400">
                <span>
                  اضافه می‌شود: سایر درآمدها و اضافی انبارگردانی
                  {incomeStatement.fxGain !== 0
                    ? ` (شامل ${formatMoney(incomeStatement.fxGain, unit)} سود تسعیر ارز)`
                    : ''}
                </span>
                <span className="font-code tabular-nums font-semibold">
                  {formatMoney(incomeStatement.otherRevenue, unit)}
                </span>
              </div>
            )}

            {incomeStatement.expenseRows
              .filter((exp) => exp.code.startsWith('809'))
              .map((exp) => (
                <div
                  key={exp.code}
                  className="py-2.5 flex justify-between text-xs text-rose-700 dark:text-rose-400 pr-4"
                >
                  <span>
                    {exp.code} — {exp.title} (غیرعملیاتی / مالی)
                  </span>
                  <span className="font-code tabular-nums">({formatMoney(exp.amount, unit)})</span>
                </div>
              ))}

            <div className="py-4 flex justify-between text-base font-extrabold border-t-2 border-slate-300 dark:border-slate-700">
              <span>
                سود (زیان) خالص دوره ({toPersianDigits(incomeStatement.netMarginPct.toFixed(1))}٪)
              </span>
              <span
                className={`font-code tabular-nums ${
                  incomeStatement.netProfit >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {formatMoney(incomeStatement.netProfit, unit)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Balance Sheet */}
      {tab === 'balance' && (
        <div className="space-y-4 print-container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2.5">
                دارایی‌ها (جاری و غیرجاری)
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {balanceSheet.assets.map((a) => (
                  <div key={a.code} className="py-2.5 flex justify-between">
                    <span className="text-slate-700 dark:text-slate-300">
                      <span className="font-code text-slate-400 ml-2">{a.code}</span>
                      {a.title}
                    </span>
                    <span className="font-code tabular-nums font-medium">
                      {formatMoney(a.amount, unit)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t-2 border-slate-300 dark:border-slate-700 flex justify-between text-sm font-bold text-slate-900 dark:text-white">
                <span>جمع کل دارایی‌ها</span>
                <span className="font-code tabular-nums text-teal-700 dark:text-teal-400">
                  {formatMoney(balanceSheet.totalAssets, unit)}
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-2.5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  بدهی‌ها
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {balanceSheet.liabilities.map((l) => (
                    <div key={l.code} className="py-2.5 flex justify-between">
                      <span className="text-slate-700 dark:text-slate-300">
                        <span className="font-code text-slate-400 ml-2">{l.code}</span>
                        {l.title}
                      </span>
                      <span className="font-code tabular-nums font-medium">
                        {formatMoney(l.amount, unit)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  حقوق صاحبان سهام
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {balanceSheet.equity.map((e) => (
                    <div key={e.code} className="py-2.5 flex justify-between">
                      <span className="text-slate-700 dark:text-slate-300">
                        <span className="font-code text-slate-400 ml-2">{e.code}</span>
                        {e.title}
                      </span>
                      <span className="font-code tabular-nums font-medium">
                        {formatMoney(e.amount, unit)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t-2 border-slate-300 dark:border-slate-700 flex justify-between text-sm font-bold text-slate-900 dark:text-white">
                <span>جمع بدهی‌ها و حقوق صاحبان سهام</span>
                <span className="font-code tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatMoney(balanceSheet.totalLiabilities + balanceSheet.totalEquity, unit)}
                </span>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            وضعیت معادله حسابداری ترازنامه:{' '}
            <strong
              className={
                balanceSheet.isBalanced
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400'
              }
            >
              {balanceSheet.isBalanced
                ? 'دارایی‌ها دقیقاً برابر با بدهی‌ها + حقوق صاحبان سهام است.'
                : 'عدم توازن ترازنامه — لطفاً مرکز حسابرسی را بررسی کنید.'}
            </strong>
          </div>
        </div>
      )}

      {/* Account Ledger */}
      {tab === 'ledger' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl print-container">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              دفتر کل و معین (گردش با مانده در خط)
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs no-print">
              <div className="w-64">
                <SmartSearchCombobox
                  mode="picker"
                  compact
                  options={accountPickerOptions}
                  value={ledgerCode}
                  onSelect={(opt) => setLedgerCode(opt.id)}
                  placeholder="جستجوی کد یا عنوان حساب..."
                />
              </div>
              <input
                aria-label="از تاریخ دفتر کل"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                placeholder="از تاریخ 1404/01/01"
                className="w-32 px-2.5 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                aria-label="تا تاریخ دفتر کل"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                placeholder="تا تاریخ 1404/12/29"
                className="w-32 px-2.5 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                  <th className="py-3 px-4">شماره سند</th>
                  <th className="py-3 px-4">تاریخ</th>
                  <th className="py-3 px-4">شرح آرتیکل</th>
                  <th className="py-3 px-4 text-left">بدهکار</th>
                  <th className="py-3 px-4 text-left">بستانکار</th>
                  <th className="py-3 px-4 text-left">مانده در خط</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ledgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      گردشی برای این حساب ثبت نشده است.
                    </td>
                  </tr>
                ) : (
                  ledgerEntries.map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-4 font-code font-semibold">
                        <button
                          type="button"
                          onClick={() => openVoucherByNumber(row.voucherNumber)}
                          className="text-teal-700 dark:text-teal-400 hover:underline"
                          title="مشاهده جزئیات سند حسابداری (دریل‌داون هلو)"
                        >
                          #{toPersianDigits(row.voucherNumber)}
                        </button>
                      </td>
                      <td className="py-2.5 px-4 font-code text-slate-600 dark:text-slate-300">
                        {toPersianDigits(row.date)}
                      </td>
                      <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100">
                        {row.description}
                        {row.partyName ? ` (${row.partyName})` : ''}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {row.debit > 0 ? formatMoney(row.debit, unit, false) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {row.credit > 0 ? formatMoney(row.credit, unit, false) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums font-bold">
                        {formatMoney(Math.abs(row.runningBalance), unit, false)}{' '}
                        {row.runningBalance >= 0 ? 'بد' : 'بس'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {ledgerEntries.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-bold">
                    <td colSpan={3} className="py-3 px-4">
                      جمع گردش حساب {ledgerCode}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(
                        ledgerEntries.reduce((s, r) => s + r.debit, 0),
                        unit,
                        false
                      )}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(
                        ledgerEntries.reduce((s, r) => s + r.credit, 0),
                        unit,
                        false
                      )}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(
                        Math.abs(ledgerEntries[ledgerEntries.length - 1].runningBalance),
                        unit,
                        false
                      )}{' '}
                      {ledgerEntries[ledgerEntries.length - 1].runningBalance >= 0 ? 'بد' : 'بس'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Party Subsidiary Ledger */}
      {tab === 'party-ledger' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl print-container">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                صورتحساب تفصیلی طرف‌حساب {selectedPartyObj ? `— ${selectedPartyObj.name}` : ''}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {profile.companyName} · سال مالی {toPersianDigits(profile.fiscalYear)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-xs no-print">
              <div className="w-64">
                <SmartSearchCombobox
                  mode="picker"
                  compact
                  options={partyPickerOptions}
                  value={selectedPartyId}
                  onSelect={(opt) => setSelectedPartyId(opt.id)}
                  placeholder="جستجوی طرف‌حساب با نام یا کد..."
                />
              </div>
              <input
                aria-label="از تاریخ صورتحساب طرف‌حساب"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                placeholder="از تاریخ"
                className="w-28 px-2.5 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                aria-label="تا تاریخ صورتحساب طرف‌حساب"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                placeholder="تا تاریخ"
                className="w-28 px-2.5 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeChequesInPartyLedger}
                  onChange={(e) => setIncludeChequesInPartyLedger(e.target.checked)}
                />
                <span>اسناد چک (۱۰۳/۳۰۲)</span>
              </label>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                  <th className="py-3 px-4">شماره سند</th>
                  <th className="py-3 px-4">تاریخ</th>
                  <th className="py-3 px-4">حساب معین</th>
                  <th className="py-3 px-4">شرح آرتیکل</th>
                  <th className="py-3 px-4 text-left">بدهکار</th>
                  <th className="py-3 px-4 text-left">بستانکار</th>
                  <th className="py-3 px-4 text-left">مانده در خط</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {partyLedgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      گردش مالی برای این طرف‌حساب ثبت نشده است.
                    </td>
                  </tr>
                ) : (
                  partyLedgerEntries.map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-4 font-code font-semibold">
                        <button
                          type="button"
                          onClick={() => openVoucherByNumber(row.voucherNumber)}
                          className="text-teal-700 dark:text-teal-400 hover:underline"
                          title="مشاهده جزئیات سند حسابداری (دریل‌داون هلو)"
                        >
                          #{toPersianDigits(row.voucherNumber)}
                        </button>
                      </td>
                      <td className="py-2.5 px-4 font-code text-slate-600 dark:text-slate-300">
                        {toPersianDigits(row.date)}
                      </td>
                      <td className="py-2.5 px-4 font-code text-teal-800 dark:text-teal-400">
                        {row.accountCode}
                      </td>
                      <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100">
                        {row.description}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {row.debit > 0 ? formatMoney(row.debit, unit, false) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {row.credit > 0 ? formatMoney(row.credit, unit, false) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums font-bold">
                        {formatMoney(Math.abs(row.runningBalance), unit, false)}{' '}
                        {row.runningBalance >= 0 ? 'بد' : 'بس'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {partyLedgerEntries.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-bold">
                    <td colSpan={4} className="py-3 px-4">
                      جمع صورتحساب {selectedPartyObj?.name}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(
                        partyLedgerEntries.reduce((s, r) => s + r.debit, 0),
                        unit,
                        false
                      )}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(
                        partyLedgerEntries.reduce((s, r) => s + r.credit, 0),
                        unit,
                        false
                      )}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(
                        Math.abs(partyLedgerEntries[partyLedgerEntries.length - 1].runningBalance),
                        unit,
                        false
                      )}{' '}
                      {partyLedgerEntries[partyLedgerEntries.length - 1].runningBalance >= 0
                        ? 'بد'
                        : 'بس'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* VAT Quarterly Tax Report (Reconciled with GL 30301 & 30302) */}
      {tab === 'vat' && (
        <div className="max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 print-container">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              خلاصه اظهارنامه مالیات بر ارزش افزوده و سامانه مودیان
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              محاسبه خالص پس از کسر برگشت از فروش/خرید و حذف فاکتورهای ابطالی · مطابق دفتر کل ۳۰۳۰۱ و ۳۰۳۰۲
            </p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <div className="py-3 flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                فروش خالص مشمول مالیات (پس از برگشت از فروش)
              </span>
              <span className="font-code tabular-nums font-semibold">
                {formatMoney(vatSummary.netSalesBase, unit)}
              </span>
            </div>
            <div className="py-3 flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                مالیات بر ارزش افزوده فروش (۱۰٪ خالص)
              </span>
              <span className="font-code tabular-nums font-semibold text-rose-700 dark:text-rose-400">
                {formatMoney(vatSummary.netSalesTax, unit)}
              </span>
            </div>
            <div className="py-3 flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                خرید خالص مشمول اعتبار مالیاتی (پس از برگشت از خرید)
              </span>
              <span className="font-code tabular-nums font-semibold">
                {formatMoney(vatSummary.netPurchaseBase, unit)}
              </span>
            </div>
            <div className="py-3 flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                مالیات بر ارزش افزوده خرید (اعتبار خالص)
              </span>
              <span className="font-code tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                ({formatMoney(vatSummary.netPurchaseTax, unit)})
              </span>
            </div>
            <div className="py-4 flex justify-between text-base font-extrabold border-t-2 border-slate-300 dark:border-slate-700">
              <span>مالیات بر ارزش افزوده قابل پرداخت (یا بستانکاری مالیاتی)</span>
              <span className="font-code tabular-nums text-teal-700 dark:text-teal-400">
                {formatMoney(vatSummary.netPayableVat, unit)}
              </span>
            </div>
          </div>

          {/* Live Audit Reconciliation Status */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
            <div className="font-bold text-slate-900 dark:text-white">
              تطبیق کنترلی با مانده دفاتر کل (۳۰۳۰۱ / ۳۰۳۰۲)
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                {vatSalesMatchesGl ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                )}
                <span>مانده حساب کل ۳۰۳۰۱ (مالیات فروش):</span>
              </span>
              <span className="font-code tabular-nums font-semibold">
                {formatMoney(auditReport.reconciliation.glSalesVat, unit)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                {vatPurchaseMatchesGl ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                )}
                <span>مانده حساب کل ۳۰۳۰۲ (اعتبار خرید):</span>
              </span>
              <span className="font-code tabular-nums font-semibold">
                {formatMoney(auditReport.reconciliation.glPurchaseVat, unit)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Seasonal 169 Tax Report (معاملات فصلی ماده ۱۶۹) */}
      {tab === 'seasonal-169' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              گزارش معاملات فصلی (ماده ۱۶۹ قانون مالیات‌های مستقیم) — {profile.companyName}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              تجمیع خالص خرید و فروش و مالیات ارزش افزوده به تفکیک هر طرف‌حساب همراه با شناسه ملی و کد اقتصادی (پس از کسر برگشتی‌ها و حذف فاکتورهای ابطالی)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                  <th className="py-3 px-4">کد</th>
                  <th className="py-3 px-4">نام طرف‌حساب</th>
                  <th className="py-3 px-3">شناسه / کد ملی</th>
                  <th className="py-3 px-3">کد اقتصادی</th>
                  <th className="py-3 px-3 text-left">تعداد فاکتور</th>
                  <th className="py-3 px-4 text-left">فروش خالص</th>
                  <th className="py-3 px-4 text-left">مالیات فروش</th>
                  <th className="py-3 px-4 text-left">خرید خالص</th>
                  <th className="py-3 px-4 text-left">مالیات خرید</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {seasonal169Rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      معامله مشمول ماده ۱۶۹ ثبت نشده است.
                    </td>
                  </tr>
                ) : (
                  seasonal169Rows.map((r) => (
                    <tr key={r.partyId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-code text-teal-800 dark:text-teal-400 font-semibold">
                        {toPersianDigits(r.partyCode)}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {r.partyName}
                      </td>
                      <td className="py-2.5 px-3 font-code text-slate-600 dark:text-slate-300">
                        {r.nationalId}
                      </td>
                      <td className="py-2.5 px-3 font-code text-slate-600 dark:text-slate-300">
                        {r.economicCode}
                      </td>
                      <td className="py-2.5 px-3 text-left font-code tabular-nums">
                        {toPersianDigits(r.invoiceCount)}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums font-semibold">
                        {r.salesNet !== 0 ? formatMoney(r.salesNet, unit, false) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums text-rose-700 dark:text-rose-400">
                        {r.salesVat !== 0 ? formatMoney(r.salesVat, unit, false) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums font-semibold">
                        {r.purchasesNet !== 0 ? formatMoney(r.purchasesNet, unit, false) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums text-emerald-700 dark:text-emerald-400">
                        {r.purchasesVat !== 0 ? formatMoney(r.purchasesVat, unit, false) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {seasonal169Rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-bold">
                    <td colSpan={5} className="py-3 px-4">
                      جمع کل معاملات فصلی ماده ۱۶۹ ({toPersianDigits(seasonal169Rows.length)} طرف‌حساب)
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(seasonal169Rows.reduce((s, r) => s + r.salesNet, 0), unit, false)}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(seasonal169Rows.reduce((s, r) => s + r.salesVat, 0), unit, false)}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(seasonal169Rows.reduce((s, r) => s + r.purchasesNet, 0), unit, false)}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(seasonal169Rows.reduce((s, r) => s + r.purchasesVat, 0), unit, false)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Product & Invoice Profitability Report */}
      {tab === 'product-profit' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {profitMode === 'product'
                  ? 'گزارش سود و زیان ناخالص فروش به تفکیک کالا'
                  : 'گزارش سود و زیان ناخالص به تفکیک هر فاکتور فروش'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                محاسبه بر اساس فاکتورهای فروش قطعی و بهای تمام‌شده خرید کالاها
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg no-print">
              <button
                onClick={() => setProfitMode('product')}
                className={`px-3 py-1 text-xs font-medium rounded ${
                  profitMode === 'product'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                به تفکیک کالا
              </button>
              <button
                onClick={() => setProfitMode('invoice')}
                className={`px-3 py-1 text-xs font-medium rounded ${
                  profitMode === 'invoice'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                به تفکیک هر فاکتور
              </button>
            </div>
          </div>

          {profitMode === 'product' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                    <th className="py-3 px-4">کد کالا</th>
                    <th className="py-3 px-4">شرح کالا</th>
                    <th className="py-3 px-3 text-left">تعداد فروش</th>
                    <th className="py-3 px-3 text-left">برگشتی</th>
                    <th className="py-3 px-3 text-left">خالص تعداد</th>
                    <th className="py-3 px-4 text-left">فروش خالص</th>
                    <th className="py-3 px-4 text-left">بهای تمام‌شده</th>
                    <th className="py-3 px-4 text-left">سود ناخالص</th>
                    <th className="py-3 px-3 text-left">حاشیه سود</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {productProfitability.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        هنوز فاکتور فروش قطعی ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    productProfitability.map((r) => (
                      <tr key={r.productId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-code font-semibold text-teal-800 dark:text-teal-400">
                          {r.sku}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                          {r.productName}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums">
                          {toPersianDigits(r.soldQty)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums text-rose-700 dark:text-rose-400">
                          {r.returnedQty > 0 ? toPersianDigits(r.returnedQty) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums font-semibold">
                          {toPersianDigits(r.netQty)}
                        </td>
                        <td className="py-2.5 px-4 text-left font-code tabular-nums">
                          {formatMoney(r.netSalesRevenue, unit, false)}
                        </td>
                        <td className="py-2.5 px-4 text-left font-code tabular-nums text-slate-600 dark:text-slate-300">
                          {formatMoney(r.estimatedCogs, unit, false)}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-left font-code tabular-nums font-bold ${
                            r.grossProfit >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {formatMoney(r.grossProfit, unit, false)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums">
                          {toPersianDigits(r.marginPct.toFixed(1))}٪
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {productProfitability.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-bold">
                      <td colSpan={5} className="py-3 px-4">
                        جمع کل سود ناخالص کالاها
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums">
                        {formatMoney(
                          productProfitability.reduce((s, r) => s + r.netSalesRevenue, 0),
                          unit,
                          false
                        )}
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums">
                        {formatMoney(
                          productProfitability.reduce((s, r) => s + r.estimatedCogs, 0),
                          unit,
                          false
                        )}
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatMoney(
                          productProfitability.reduce((s, r) => s + r.grossProfit, 0),
                          unit,
                          false
                        )}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                    <th className="py-3 px-4">شماره فاکتور</th>
                    <th className="py-3 px-4">تاریخ</th>
                    <th className="py-3 px-4">مشتری / خریدار</th>
                    <th className="py-3 px-4 text-left">فروش خالص</th>
                    <th className="py-3 px-4 text-left">بهای تمام‌شده</th>
                    <th className="py-3 px-4 text-left">سود ناخالص فاکتور</th>
                    <th className="py-3 px-3 text-left">حاشیه سود</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoiceProfitability.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        هنوز فاکتور فروش قطعی ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    invoiceProfitability.map((r) => (
                      <tr key={r.invoiceId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-code font-semibold text-teal-800 dark:text-teal-400">
                          {r.invoiceNumber}
                        </td>
                        <td className="py-2.5 px-4 font-code text-slate-600 dark:text-slate-300">
                          {toPersianDigits(r.date)}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                          {r.partyName}
                        </td>
                        <td className="py-2.5 px-4 text-left font-code tabular-nums">
                          {formatMoney(r.netSales, unit, false)}
                        </td>
                        <td className="py-2.5 px-4 text-left font-code tabular-nums text-slate-600 dark:text-slate-300">
                          {formatMoney(r.cogs, unit, false)}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-left font-code tabular-nums font-bold ${
                            r.grossProfit >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {formatMoney(r.grossProfit, unit, false)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums">
                          {toPersianDigits(r.marginPct.toFixed(1))}٪
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {invoiceProfitability.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-bold">
                      <td colSpan={3} className="py-3 px-4">
                        جمع کل ({toPersianDigits(invoiceProfitability.length)} فاکتور فروش)
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums">
                        {formatMoney(
                          invoiceProfitability.reduce((s, r) => s + r.netSales, 0),
                          unit,
                          false
                        )}
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums">
                        {formatMoney(
                          invoiceProfitability.reduce((s, r) => s + r.cogs, 0),
                          unit,
                          false
                        )}
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatMoney(
                          invoiceProfitability.reduce((s, r) => s + r.grossProfit, 0),
                          unit,
                          false
                        )}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {/* Receivables Aging Report (گزارش سنی مطالبات) */}
      {tab === 'aging' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              گزارش سنی مطالبات مشتریان (Aging Report) — مبنای تاریخ {toPersianDigits(getTodayShamsi())}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              تفکیک مانده بدهی مشتریان به بازه‌های ۰ تا ۳۰ روز، ۳۱ تا ۶۰ روز، ۶۱ تا ۹۰ روز و معوقات بالای ۹۰ روز همراه با یادآوری مستقیم واتس‌اپ و تلگرام
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                  <th className="py-3 px-4">مشتری</th>
                  <th className="py-3 px-3 text-left">۰ تا ۳۰ روز</th>
                  <th className="py-3 px-3 text-left">۳۱ تا ۶۰ روز</th>
                  <th className="py-3 px-3 text-left">۶۱ تا ۹۰ روز</th>
                  <th className="py-3 px-3 text-left">بالای ۹۰ روز</th>
                  <th className="py-3 px-4 text-left">جمع بدهی باز</th>
                  <th className="py-3 px-3 text-left no-print">پیگیری وصول</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {agingRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      مطلب باز یا معوقه‌ای از مشتریان ثبت نشده است.
                    </td>
                  </tr>
                ) : (
                  agingRows.map((r) => {
                    const reminderText = encodeURIComponent(
                      `با سلام و احترام، ${r.partyName} گرامی؛ مانده حساب باز شما نزد ${profile.companyName} مبلغ ${formatMoney(r.totalReceivable, unit)} می‌باشد. لطفاً جهت تسویه هماهنگ فرمایید.`
                    );
                    const digitsPhone = (r.phone || '').replace(/\D/g, '');
                    const waPhone = digitsPhone.startsWith('0')
                      ? `98${digitsPhone.slice(1)}`
                      : digitsPhone;
                    return (
                      <tr key={r.partyId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">{r.partyName}</div>
                          <div className="text-[11px] text-slate-500 font-code">
                            کد {toPersianDigits(r.partyCode)} · قدیمی‌ترین فاکتور: {r.oldestInvoiceDate ? toPersianDigits(r.oldestInvoiceDate) : 'مانده اول دوره'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums">
                          {r.bucket0to30 > 0 ? formatMoney(r.bucket0to30, unit, false) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums text-amber-700 dark:text-amber-400">
                          {r.bucket31to60 > 0 ? formatMoney(r.bucket31to60, unit, false) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums text-orange-700 dark:text-orange-400">
                          {r.bucket61to90 > 0 ? formatMoney(r.bucket61to90, unit, false) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums font-bold text-rose-700 dark:text-rose-400">
                          {r.bucketOver90 > 0 ? formatMoney(r.bucketOver90, unit, false) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-left font-code tabular-nums font-bold text-slate-900 dark:text-white">
                          {formatMoney(r.totalReceivable, unit, false)}
                        </td>
                        <td className="py-2.5 px-3 text-left no-print">
                          <div className="inline-flex items-center gap-1.5">
                            <a
                              href={waPhone ? `https://wa.me/${waPhone}?text=${reminderText}` : `https://wa.me/?text=${reminderText}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              title="ارسال یادآوری وصول با واتس‌اپ"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                            <a
                              href={`https://t.me/share/url?url=${encodeURIComponent(profile.companyName)}&text=${reminderText}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded border border-sky-200 dark:border-sky-900 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                              title="ارسال یادآوری وصول با تلگرام"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {agingRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-bold">
                    <td className="py-3 px-4">جمع کل مطالبات</td>
                    <td className="py-3 px-3 text-left font-code tabular-nums">
                      {formatMoney(agingRows.reduce((s, r) => s + r.bucket0to30, 0), unit, false)}
                    </td>
                    <td className="py-3 px-3 text-left font-code tabular-nums">
                      {formatMoney(agingRows.reduce((s, r) => s + r.bucket31to60, 0), unit, false)}
                    </td>
                    <td className="py-3 px-3 text-left font-code tabular-nums">
                      {formatMoney(agingRows.reduce((s, r) => s + r.bucket61to90, 0), unit, false)}
                    </td>
                    <td className="py-3 px-3 text-left font-code tabular-nums text-rose-700 dark:text-rose-400">
                      {formatMoney(agingRows.reduce((s, r) => s + r.bucketOver90, 0), unit, false)}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums">
                      {formatMoney(agingRows.reduce((s, r) => s + r.totalReceivable, 0), unit, false)}
                    </td>
                    <td className="no-print" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Broker / Intermediary Commissions Report */}
      {tab === 'commissions' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              محاسبه و صدور سند پورسانت بازاریابان و واسطه‌های فروش نخ
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              تجمیع خودکار فروش‌های منتسب به هر واسطه و ثبت سند هزینه پورسانت (۸۰۳۰۱) در بستانکار حساب واسطه
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                  <th className="py-3 px-4">واسطه / بازاریاب</th>
                  <th className="py-3 px-3 text-left">نرخ پورسانت</th>
                  <th className="py-3 px-3 text-left">تعداد فاکتور</th>
                  <th className="py-3 px-3 text-left">جمع وزن (کیلو)</th>
                  <th className="py-3 px-4 text-left">مبلغ فروش خالص</th>
                  <th className="py-3 px-4 text-left">پورسانت قابل پرداخت</th>
                  <th className="py-3 px-4 text-left no-print">سند حسابداری</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {commissionRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      واسطه یا بازاریابی با درصد پورسانت تعریف نشده است. از بخش طرف‌حساب‌ها یک واسطه تعریف کنید.
                    </td>
                  </tr>
                ) : (
                  commissionRows.map((row) => (
                    <tr key={row.partyId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{row.partyName}</div>
                        <div className="text-[11px] font-code text-slate-500">کد {row.partyCode}</div>
                      </td>
                      <td className="py-3 px-3 text-left font-code tabular-nums">
                        {toPersianDigits(row.commissionRate)}٪
                      </td>
                      <td className="py-3 px-3 text-left font-code tabular-nums">
                        {toPersianDigits(row.invoiceCount)}
                      </td>
                      <td className="py-3 px-3 text-left font-code tabular-nums">
                        {toPersianDigits(row.totalWeightKg.toLocaleString('en-US'))}
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums">
                        {formatMoney(row.totalSalesIrr, unit, false)}
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums font-bold text-teal-700 dark:text-teal-400">
                        {formatMoney(row.commissionAmountIrr, unit, false)}
                      </td>
                      <td className="py-3 px-4 text-left no-print">
                        <button
                          type="button"
                          disabled={row.commissionAmountIrr <= 0}
                          onClick={() =>
                            postBrokerCommissionVoucher({
                              partyId: row.partyId,
                              partyName: row.partyName,
                              amountIrr: row.commissionAmountIrr,
                              date: getTodayShamsi(),
                              periodLabel: `دوره ${profile.fiscalYear}`,
                            })
                          }
                          className="px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white font-semibold disabled:opacity-40"
                        >
                          ثبت سند پورسانت
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Official Statutory Exporters: Tamin DSK, Salary Tax TTMS, Moadian JSON */}
      {tab === 'statutory' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 text-xs">
          {/* Tamin Social Security Diskette */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <FileCode2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>دیسکت لیست بیمه تأمین اجتماعی (DSK)</span>
              </div>
              <p className="text-slate-500 leading-relaxed">
                تولید همزمان فایل‌های کارگاهی <span className="font-code">DSKKAR00.TXT</span> و ریز کارکنان <span className="font-code">DSKWOR00.TXT</span> بر اساس حقوق مشمول بیمه {toPersianDigits(employees.filter((e) => e.active).length)} پرسنل فعال.
              </p>
              <div>
                <label className="block text-slate-500 mb-1">ماه / دوره عملکرد</label>
                <input
                  value={statutoryMonth}
                  onChange={(e) => setStatutoryMonth(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const { karFile } = buildTaminDskFiles(employees, profile, statutoryMonth);
                  downloadTextFile('DSKKAR00.TXT', karFile);
                  showToast('فایل کارگاهی DSKKAR00.TXT با موفقیت دریافت شد.');
                }}
                className="flex-1 py-2 px-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
              >
                دانلود DSKKAR00
              </button>
              <button
                type="button"
                onClick={() => {
                  const { worFile } = buildTaminDskFiles(employees, profile, statutoryMonth);
                  downloadTextFile('DSKWOR00.TXT', worFile);
                  showToast('فایل ریز کارکنان DSKWOR00.TXT با موفقیت دریافت شد.');
                }}
                className="flex-1 py-2 px-3 rounded-lg border border-teal-700 text-teal-800 dark:text-teal-300 font-semibold hover:bg-teal-50 dark:hover:bg-teal-950/30"
              >
                دانلود DSKWOR00
              </button>
            </div>
          </div>

          {/* Salary Tax TTMS */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Download className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>فایل مالیات حقوق اداره دارایی (TTMS)</span>
              </div>
              <p className="text-slate-500 leading-relaxed">
                خروجی استاندارد لیست حقوق و دستمزد، معافیت بیمه سهم کارگر، درآمد مشمول و مالیات پلکانی حقوق جهت بارگذاری در سامانه مالیات حقوق.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const csv = buildTtmsSalaryCsv(employees, profile, statutoryMonth);
                downloadTextFile(`TTMS-Salary-${profile.fiscalYear}.csv`, csv, 'text/csv;charset=utf-8');
                showToast('فایل مالیات حقوق TTMS با موفقیت دریافت شد.');
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
            >
              دریافت فایل مالیات حقوق (CSV / TTMS)
            </button>
          </div>

          {/* Moadian Tax Portal JSON */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <FileCode2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>خروجی صورتحساب الکترونیکی سامانه مودیان (JSON)</span>
              </div>
              <p className="text-slate-500 leading-relaxed">
                تولید بسته استاندارد TPIS (نوع اول B2B شامل شماره منحصر‌به‌فرد مالیاتی، کد اقتصادی خریدار/فروشنده، اقلام وزنی و ارزش افزوده) آماده ارسال به شرکت معتمد.
              </p>
              <div>
                <label className="block text-slate-500 mb-1">انتخاب فاکتور فروش</label>
                <select
                  value={selectedMoadianInvId || invoices.find((i) => i.invoiceType === 'sale')?.id || ''}
                  onChange={(e) => setSelectedMoadianInvId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {invoices
                    .filter((i) => i.invoiceType === 'sale' || i.invoiceType === 'sale_return')
                    .map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — {inv.partyName} ({formatMoney(inv.grandTotal, unit)})
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const inv =
                  invoices.find((i) => i.id === selectedMoadianInvId) ||
                  invoices.find((i) => i.invoiceType === 'sale');
                if (!inv) {
                  showToast('فاکتور فروشی جهت خروجی مودیان یافت نشد.');
                  return;
                }
                const party = parties.find((p) => p.id === inv.partyId);
                const json = buildMoadianInvoiceJson(inv, profile, party);
                downloadTextFile(`Moadian-${inv.invoiceNumber}.json`, json, 'application/json;charset=utf-8');
                showToast(`فایل JSON سامانه مودیان فاکتور ${inv.invoiceNumber} دریافت شد.`);
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
            >
              دانلود JSON استاندارد سامانه مودیان
            </button>
          </div>
        </div>
      )}

      {/* Smart ABC Intelligence (Products, Stagnant Stock & Customer Tier Ranking) */}
      {tab === 'abc' && (
        <div className="space-y-6 text-xs print-container">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-500">مشتریان طلایی (رده A — ۷۰٪ فروش)</div>
              <div className="text-xl font-extrabold font-code text-amber-700 dark:text-amber-400 mt-1">
                {toPersianDigits(abcReport.goldCustomersCount)} مشتری
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-500">مشتریان پرریسک (چک برگشتی / عبور اعتبار)</div>
              <div className="text-xl font-extrabold font-code text-rose-700 dark:text-rose-400 mt-1">
                {toPersianDigits(abcReport.riskCustomersCount)} مشتری
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-500">اقلام راکد انبار (بدون فروش در دوره)</div>
              <div className="text-xl font-extrabold font-code text-slate-900 dark:text-white mt-1">
                {toPersianDigits(abcReport.stagnantProductsCount)} قلم نخ
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-500">سرمایه خوابیده در موجودی راکد</div>
              <div className="text-xl font-extrabold font-code tabular-nums text-teal-700 dark:text-teal-400 mt-1">
                {formatMoney(abcReport.stagnantStockValueIrr, unit)}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-600" />
                <span>تحلیل هوشمند ABC کالاها (پرفروش‌ترین‌ها و شناسایی موجودی راکد)</span>
              </h2>
              <span className="text-[11px] text-slate-500">
                رده A: ۷۰٪ درآمد اول · رده B: ۲۰٪ بعدی · رده C: ۱۰٪ پایانی
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                    <th className="py-2.5 px-4">کد</th>
                    <th className="py-2.5 px-4">نام نخ / کالا</th>
                    <th className="py-2.5 px-4 text-center">رده ABC</th>
                    <th className="py-2.5 px-4 text-left">وزن فروش</th>
                    <th className="py-2.5 px-4 text-left">فروش خالص</th>
                    <th className="py-2.5 px-4 text-left">سود ناخالص</th>
                    <th className="py-2.5 px-4 text-left">حاشیه سود</th>
                    <th className="py-2.5 px-4 text-left">سهم از فروش</th>
                    <th className="py-2.5 px-4">وضعیت انبار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {abcReport.products.map((row) => (
                    <tr key={row.productId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-code text-teal-700 dark:text-teal-400">{row.sku}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">{row.name}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-code font-bold ${
                            row.grade === 'A'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                              : row.grade === 'B'
                                ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {row.grade}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {formatWeight(row.soldKg)} کیلو
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums font-semibold">
                        {formatMoney(row.revenueIrr, unit, false)}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatMoney(row.grossProfitIrr, unit, false)}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {toPersianDigits(row.marginPct)}٪
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {toPersianDigits(row.revenueSharePct)}٪
                      </td>
                      <td className="py-2.5 px-4">
                        {row.isStagnant ? (
                          <span className="text-rose-700 dark:text-rose-400 font-semibold">
                            راکد ({formatMoney(row.stockValueIrr, unit)})
                          </span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">پویا</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                رتبه‌بندی هوشمند ABC و امتیاز اعتباری مشتریان
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                    <th className="py-2.5 px-4">کد</th>
                    <th className="py-2.5 px-4">نام مشتری</th>
                    <th className="py-2.5 px-4 text-center">رتبه هوشمند</th>
                    <th className="py-2.5 px-4 text-center">تعداد فاکتور</th>
                    <th className="py-2.5 px-4 text-left">حجم خرید دوره</th>
                    <th className="py-2.5 px-4 text-left">سود ایجادشده</th>
                    <th className="py-2.5 px-4 text-left">مانده جاری</th>
                    <th className="py-2.5 px-4 text-center">چک برگشتی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {abcReport.customers.map((c) => (
                    <tr key={c.partyId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-code text-teal-700 dark:text-teal-400">
                        {toPersianDigits(c.code)}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-bold ${
                            c.tier === 'gold'
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                              : c.tier === 'silver'
                                ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300'
                                : c.tier === 'risk'
                                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {c.tierLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center font-code">
                        {toPersianDigits(c.invoiceCount)}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums font-semibold">
                        {formatMoney(c.totalSalesIrr, unit, false)}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatMoney(c.grossProfitIrr, unit, false)}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {formatMoney(Math.abs(c.currentBalanceIrr), unit, false)}{' '}
                        {c.currentBalanceIrr > 0 ? 'بد' : c.currentBalanceIrr < 0 ? 'بس' : ''}
                      </td>
                      <td className="py-2.5 px-4 text-center font-code">
                        {c.bouncedChequesCount > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">
                            {toPersianDigits(c.bouncedChequesCount)} فقره
                          </span>
                        ) : (
                          '۰'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Holoo Signature Voucher Drill-Down Modal */}
      {drillVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 no-print">
          <div className="w-full max-w-3xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-xs">
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  پنجره نمایش سریع سند حسابداری #{toPersianDigits(drillVoucher.voucherNumber)}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  تاریخ {toPersianDigits(drillVoucher.date)} · {drillVoucher.description} · وضعیت:{' '}
                  {drillVoucher.status === 'permanent' ? 'دائم و قطعی' : 'موقت'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrillVoucher(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto max-h-[65vh]">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                    <th className="py-2.5 px-4">کد معین</th>
                    <th className="py-2.5 px-4">عنوان حساب و تفصیلی</th>
                    <th className="py-2.5 px-4">شرح آرتیکل</th>
                    <th className="py-2.5 px-4 text-left">بدهکار</th>
                    <th className="py-2.5 px-4 text-left">بستانکار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {drillVoucher.lines.map((l, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-4 font-code font-semibold text-teal-800 dark:text-teal-400">
                        {l.accountCode}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900 dark:text-white">{l.accountTitle}</div>
                        {l.partyName && (
                          <div className="text-[11px] text-slate-500">{l.partyName}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{l.description}</td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {l.debit > 0 ? formatMoney(l.debit, unit, false) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {l.credit > 0 ? formatMoney(l.credit, unit, false) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-bold">
                    <td colSpan={3} className="py-2.5 px-4">
                      جمع کل سند (تراز کامل)
                    </td>
                    <td className="py-2.5 px-4 text-left font-code tabular-nums">
                      {formatMoney(drillVoucher.totalDebit, unit, false)}
                    </td>
                    <td className="py-2.5 px-4 text-left font-code tabular-nums">
                      {formatMoney(drillVoucher.totalCredit, unit, false)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
