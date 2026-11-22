import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowRightLeft,
  CalendarClock,
  Camera,
  CheckCircle2,
  Coins,
  Landmark,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { useWorkspaceExtensions } from '../context/WorkspaceExtensionsContext';
import {
  BankLoan,
  buildBankLoanSchedule,
  FiscalYearArchive,
  PettyCashItem,
  RecurringVoucherTemplate,
} from '../lib/apexExtensions';
import {
  formatCompactMoney,
  formatMoney,
  generateSafeId,
  getTodayShamsi,
  toPersianDigits,
} from '../lib/format';
import { VoucherLine } from '../types/accounting';

type FinanceOpsTab = 'petty-cash' | 'recurring' | 'loans' | 'fiscal-rollover';

export const FinanceOpsView: React.FC<{
  initialIntent?: string;
  clearIntent?: () => void;
}> = ({ initialIntent, clearIntent }) => {
  const {
    profile,
    accounts,
    parties,
    vouchers,
    invoices,
    trialBalance,
    incomeStatement,
    balanceSheet,
    createVoucher,
    updateCompanyProfile,
    showToast,
  } = useAccounting();

  const {
    pettyCashCeilingIrr,
    pettyCashItems,
    recurringTemplates,
    bankLoans,
    fiscalArchives,
    updateExtensions,
  } = useWorkspaceExtensions();

  const unit = profile.currencyUnit;
  const displayFactor = unit === 'IRT' ? 10 : 1;
  const unitName = unit === 'IRT' ? 'تومان' : 'ریال';

  const [activeTab, setActiveTab] = useState<FinanceOpsTab>('petty-cash');

  useEffect(() => {
    if (
      initialIntent === 'petty-cash' ||
      initialIntent === 'recurring' ||
      initialIntent === 'loans' ||
      initialIntent === 'fiscal-rollover'
    ) {
      setActiveTab(initialIntent);
      clearIntent?.();
    }
  }, [initialIntent, clearIntent]);

  const expenseAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          (a.level === 'moein' || a.level === 'tafsili') &&
          (a.category === 'expense' || a.code.startsWith('8'))
      ),
    [accounts]
  );

  const bankCashAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          (a.level === 'moein' || a.level === 'tafsili') &&
          (a.code.startsWith('101') || a.code.startsWith('102'))
      ),
    [accounts]
  );

  const leafAccounts = useMemo(
    () => accounts.filter((a) => a.level === 'moein' || a.level === 'tafsili'),
    [accounts]
  );

  // ---------------- TAB 1: PETTY CASH STATE ----------------
  const [pcDate, setPcDate] = useState(getTodayShamsi());
  const [pcTitle, setPcTitle] = useState('');
  const [pcCategoryCode, setPcCategoryCode] = useState(
    expenseAccounts[0]?.code || '80105'
  );
  const [pcAmountDisplay, setPcAmountDisplay] = useState('');
  const [pcVendor, setPcVendor] = useState('');
  const [pcReceiptNo, setPcReceiptNo] = useState('');
  const [pcCeilingInput, setPcCeilingInput] = useState(
    String(Math.round(pettyCashCeilingIrr / displayFactor))
  );
  const [pcBankAccount, setPcBankAccount] = useState(
    bankCashAccounts.find((a) => a.code.startsWith('102'))?.code || bankCashAccounts[0]?.code || '10201'
  );
  const [ocrLoading, setOcrLoading] = useState(false);
  const [settlingPc, setSettlingPc] = useState(false);
  const ocrFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPcCeilingInput(String(Math.round(pettyCashCeilingIrr / displayFactor)));
  }, [pettyCashCeilingIrr, displayFactor]);

  const pendingPettyItems = useMemo(
    () => pettyCashItems.filter((it) => it.status === 'pending'),
    [pettyCashItems]
  );
  const pendingPettyTotal = useMemo(
    () => pendingPettyItems.reduce((s, it) => s + it.amountIrr, 0),
    [pendingPettyItems]
  );
  const pettyRemaining = Math.max(0, pettyCashCeilingIrr - pendingPettyTotal);
  const pettyUsagePct =
    pettyCashCeilingIrr > 0
      ? Math.min(100, Math.round((pendingPettyTotal / pettyCashCeilingIrr) * 100))
      : 0;

  const handleScanPettyReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setOcrLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('خطا در خواندن تصویر'));
        reader.readAsDataURL(file);
      });

      const resp = await fetch('/api/ai/scan-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: dataUrl,
          hintKind: 'expense_bill',
          parties: parties.map((p) => ({ id: p.id, name: p.name })),
          accounts: accounts.map((a) => ({ code: a.code, title: a.title })),
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json?.error || 'اسکن رسید هزینه ناموفق بود.');
      }

      if (json.description) setPcTitle(json.description);
      if (json.amountIrr > 0) {
        setPcAmountDisplay(String(Math.round(json.amountIrr / displayFactor)));
      }
      if (json.issueDate && /^\d{4}\/\d{2}\/\d{2}$/.test(json.issueDate)) {
        setPcDate(json.issueDate);
      }
      if (json.partyNameHint) setPcVendor(json.partyNameHint);
      if (json.trackingNumber) setPcReceiptNo(json.trackingNumber);
      if (
        json.suggestedAccountCode &&
        expenseAccounts.some((a) => a.code === json.suggestedAccountCode)
      ) {
        setPcCategoryCode(json.suggestedAccountCode);
      }
      showToast('اطلاعات قبض/رسید هزینه با هوش مصنوعی استخراج و در فرم پر شد.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در اسکن هوشمند قبض هزینه.');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleAddPettyCashItem = (e: React.FormEvent) => {
    e.preventDefault();
    const amtIrr = Math.round((Number(pcAmountDisplay) || 0) * displayFactor);
    if (!pcTitle.trim() || amtIrr <= 0) {
      showToast('شرح هزینه و مبلغ معتبر را وارد کنید.');
      return;
    }
    const acc = expenseAccounts.find((a) => a.code === pcCategoryCode);
    const newItem: PettyCashItem = {
      id: generateSafeId('pc'),
      date: pcDate || getTodayShamsi(),
      title: pcTitle.trim(),
      categoryAccountCode: acc?.code || pcCategoryCode || '80105',
      categoryTitle: acc?.title || 'سایر هزینه‌های اداری و عمومی',
      amountIrr: amtIrr,
      vendorName: pcVendor.trim() || undefined,
      receiptNo: pcReceiptNo.trim() || undefined,
      status: 'pending',
    };
    updateExtensions((prev) => ({
      ...prev,
      pettyCashItems: [newItem, ...prev.pettyCashItems],
    }));
    setPcTitle('');
    setPcAmountDisplay('');
    setPcVendor('');
    setPcReceiptNo('');
    showToast('هزینه جدید در کاردکس تنخواه‌گردان ثبت و همگام شد.');
  };

  const handleSettlePettyCash = async () => {
    if (pendingPettyItems.length === 0) {
      showToast('هزینه تسویه‌نشده‌ای در تنخواه وجود ندارد.');
      return;
    }
    setSettlingPc(true);
    try {
      const bankAcc = accounts.find((a) => a.code === pcBankAccount);
      const lines: VoucherLine[] = pendingPettyItems.map((it) => ({
        accountCode: it.categoryAccountCode,
        accountTitle: it.categoryTitle,
        description: `هزینه تنخواه: ${it.title}${it.receiptNo ? ` (قبض ${it.receiptNo})` : ''}`,
        debit: it.amountIrr,
        credit: 0,
      }));
      lines.push({
        accountCode: bankAcc?.code || '10201',
        accountTitle: bankAcc?.title || 'بانک ملت — جاری ریالی',
        description: `شارژ مجدد و تسویه ${toPersianDigits(pendingPettyItems.length)} فقره هزینه تنخواه`,
        debit: 0,
        credit: pendingPettyTotal,
      });

      const voucher = await createVoucher({
        date: getTodayShamsi(),
        description: `سند تجمیعی تسویه و شارژ مجدد تنخواه‌گردان (${toPersianDigits(pendingPettyItems.length)} فقره)`,
        voucherType: 'treasury',
        status: 'permanent',
        lines,
      });

      const settledIds = new Set(pendingPettyItems.map((i) => i.id));
      updateExtensions((prev) => ({
        ...prev,
        pettyCashItems: prev.pettyCashItems.map((it) =>
          settledIds.has(it.id)
            ? { ...it, status: 'settled', settlementVoucherId: voucher.id }
            : it
        ),
      }));
      showToast(`سند تسویه تنخواه به شماره #${toPersianDigits(voucher.voucherNumber)} با موفقیت صادر شد.`);
    } finally {
      setSettlingPc(false);
    }
  };

  // ---------------- TAB 2: RECURRING VOUCHERS STATE ----------------
  const [recTitle, setRecTitle] = useState('');
  const [recDay, setRecDay] = useState('1');
  const [recDebitCode, setRecDebitCode] = useState(expenseAccounts[0]?.code || '80102');
  const [recCreditCode, setRecCreditCode] = useState(
    bankCashAccounts[0]?.code || '10201'
  );
  const [recAmountDisplay, setRecAmountDisplay] = useState('');
  const [issuingRecId, setIssuingRecId] = useState<string | null>(null);

  const currentPeriod = getTodayShamsi().slice(0, 7); // e.g. '1405/08'

  const handleAddRecurringTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const amtIrr = Math.round((Number(recAmountDisplay) || 0) * displayFactor);
    if (!recTitle.trim() || amtIrr <= 0) {
      showToast('عنوان و مبلغ معتبر برای سند تکرارشونده وارد کنید.');
      return;
    }
    const dAcc = leafAccounts.find((a) => a.code === recDebitCode);
    const cAcc = leafAccounts.find((a) => a.code === recCreditCode);
    const tpl: RecurringVoucherTemplate = {
      id: generateSafeId('rec'),
      title: recTitle.trim(),
      dayOfMonth: Math.max(1, Math.min(30, parseInt(recDay, 10) || 1)),
      description: `سند دوره‌ای: ${recTitle.trim()}`,
      active: true,
      lines: [
        {
          accountCode: dAcc?.code || recDebitCode,
          accountTitle: dAcc?.title || 'حساب بدهکار',
          description: recTitle.trim(),
          debit: amtIrr,
          credit: 0,
        },
        {
          accountCode: cAcc?.code || recCreditCode,
          accountTitle: cAcc?.title || 'حساب بستانکار',
          description: `پرداخت ${recTitle.trim()}`,
          debit: 0,
          credit: amtIrr,
        },
      ],
    };
    updateExtensions((prev) => ({
      ...prev,
      recurringTemplates: [tpl, ...prev.recurringTemplates],
    }));
    setRecTitle('');
    setRecAmountDisplay('');
    showToast('الگوی سند تکرارشونده جدید ذخیره و روی ابر همگام شد.');
  };

  const handleIssueRecurring = async (tpl: RecurringVoucherTemplate) => {
    setIssuingRecId(tpl.id);
    try {
      const today = getTodayShamsi();
      const voucher = await createVoucher({
        date: today,
        description: `${tpl.description} — دوره ${currentPeriod}`,
        voucherType: 'general',
        status: 'draft',
        lines: tpl.lines.map((l) => ({
          accountCode: l.accountCode,
          accountTitle: l.accountTitle,
          partyId: l.partyId,
          partyName: l.partyName,
          description: `${l.description} (${currentPeriod})`,
          debit: l.debit,
          credit: l.credit,
        })),
      });
      updateExtensions((prev) => ({
        ...prev,
        recurringTemplates: prev.recurringTemplates.map((t) =>
          t.id === tpl.id ? { ...t, lastIssuedPeriod: currentPeriod } : t
        ),
      }));
      showToast(
        `سند دوره‌ای «${tpl.title}» با شماره #${toPersianDigits(voucher.voucherNumber)} در کارتابل ثبت شد.`
      );
    } finally {
      setIssuingRecId(null);
    }
  };

  // ---------------- TAB 3: BANK LOANS & AMORTIZATION ----------------
  const [loanTitle, setLoanTitle] = useState('');
  const [loanBankName, setLoanBankName] = useState('بانک ملت');
  const [loanBankCode, setLoanBankCode] = useState(
    bankCashAccounts.find((a) => a.code.startsWith('102'))?.code || '10201'
  );
  const [loanNumber, setLoanNumber] = useState('');
  const [loanPrincipalDisplay, setLoanPrincipalDisplay] = useState('');
  const [loanInterestPct, setLoanInterestPct] = useState('23');
  const [loanMonths, setLoanMonths] = useState('12');
  const [loanStartDate, setLoanStartDate] = useState(getTodayShamsi());
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  const [payingInstallmentKey, setPayingInstallmentKey] = useState<string | null>(null);

  const handleCreateLoan = (e: React.FormEvent) => {
    e.preventDefault();
    const principalIrr = Math.round((Number(loanPrincipalDisplay) || 0) * displayFactor);
    const months = Math.max(1, Math.min(120, parseInt(loanMonths, 10) || 12));
    const rate = Math.max(0, Number(loanInterestPct) || 0);
    if (!loanTitle.trim() || principalIrr <= 0) {
      showToast('عنوان تسهیلات و اصل مبلغ وام را وارد کنید.');
      return;
    }
    const schedule = buildBankLoanSchedule({
      principalIrr,
      annualInterestPct: rate,
      installmentCount: months,
      startDate: loanStartDate || getTodayShamsi(),
    });
    const loan: BankLoan = {
      id: generateSafeId('loan'),
      title: loanTitle.trim(),
      bankName: loanBankName.trim() || 'بانک',
      bankAccountCode: loanBankCode,
      loanNumber: loanNumber.trim() || `LN-${Date.now().toString().slice(-5)}`,
      startDate: loanStartDate || getTodayShamsi(),
      principalIrr,
      annualInterestPct: rate,
      installmentCount: months,
      installments: schedule,
    };
    updateExtensions((prev) => ({
      ...prev,
      bankLoans: [loan, ...prev.bankLoans],
    }));
    setExpandedLoanId(loan.id);
    setLoanTitle('');
    setLoanNumber('');
    setLoanPrincipalDisplay('');
    showToast('قرارداد تسهیلات و جدول اقساط اصل و سود با موفقیت ایجاد شد.');
  };

  const handlePayLoanInstallment = async (loan: BankLoan, instIndex: number) => {
    const inst = loan.installments.find((i) => i.index === instIndex);
    if (!inst || inst.paid) return;
    const key = `${loan.id}-${instIndex}`;
    setPayingInstallmentKey(key);
    try {
      const loanLiabilityAcc =
        accounts.find((a) => a.code.startsWith('401')) ||
        accounts.find((a) => a.code.startsWith('301')) ||
        accounts[0];
      const interestExpAcc =
        accounts.find((a) => a.code.startsWith('802') || a.title.includes('مالی')) ||
        expenseAccounts[0] ||
        accounts[0];
      const bankAcc =
        accounts.find((a) => a.code === loan.bankAccountCode) || bankCashAccounts[0] || accounts[0];

      const lines: VoucherLine[] = [];
      if (inst.principalIrr > 0) {
        lines.push({
          accountCode: loanLiabilityAcc.code,
          accountTitle: loanLiabilityAcc.title,
          description: `بازپرداخت اصل قسط ${toPersianDigits(inst.index)} وام ${loan.title}`,
          debit: inst.principalIrr,
          credit: 0,
        });
      }
      if (inst.interestIrr > 0) {
        lines.push({
          accountCode: interestExpAcc.code,
          accountTitle: interestExpAcc.title,
          description: `هزینه سود قسط ${toPersianDigits(inst.index)} وام ${loan.title}`,
          debit: inst.interestIrr,
          credit: 0,
        });
      }
      lines.push({
        accountCode: bankAcc.code,
        accountTitle: bankAcc.title,
        description: `برداشت قسط ${toPersianDigits(inst.index)} تسهیلات ${loan.bankName} (${loan.loanNumber})`,
        debit: 0,
        credit: inst.totalIrr,
      });

      const voucher = await createVoucher({
        date: getTodayShamsi(),
        description: `پرداخت قسط ${toPersianDigits(inst.index)} از ${toPersianDigits(loan.installmentCount)} — ${loan.title}`,
        voucherType: 'treasury',
        status: 'permanent',
        lines,
      });

      updateExtensions((prev) => ({
        ...prev,
        bankLoans: prev.bankLoans.map((l) =>
          l.id !== loan.id
            ? l
            : {
                ...l,
                installments: l.installments.map((item) =>
                  item.index === instIndex
                    ? {
                        ...item,
                        paid: true,
                        paidDate: getTodayShamsi(),
                        voucherId: voucher.id,
                      }
                    : item
                ),
              }
        ),
      }));
      showToast(
        `سند پرداخت قسط #${toPersianDigits(inst.index)} به شماره سند ${toPersianDigits(voucher.voucherNumber)} ثبت شد.`
      );
    } finally {
      setPayingInstallmentKey(null);
    }
  };

  // ---------------- TAB 4: FISCAL YEAR ROLLOVER & ARCHIVE ----------------
  const suggestedNextYear = String((parseInt(profile.fiscalYear, 10) || 1405) + 1);
  const [nextYearInput, setNextYearInput] = useState(suggestedNextYear);
  const [createOpeningVoucherFlag, setCreateOpeningVoucherFlag] = useState(true);
  const [rollingOver, setRollingOver] = useState(false);

  const permanentAccountBalances = useMemo(() => {
    return trialBalance
      .filter(
        (r) =>
          (r.category === 'asset' || r.category === 'liability' || r.category === 'equity') &&
          (r.balanceDebit > 0 || r.balanceCredit > 0)
      )
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  }, [trialBalance]);

  const handleExecuteFiscalRollover = async () => {
    const cleanNext = nextYearInput.trim();
    if (!/^\d{4}$/.test(cleanNext) || cleanNext === profile.fiscalYear) {
      showToast('سال مالی جدید باید عدد ۴ رقمی متفاوت از سال جاری (مثلاً 1406) باشد.');
      return;
    }
    setRollingOver(true);
    try {
      let openingVoucherNumber: number | undefined;
      if (createOpeningVoucherFlag && permanentAccountBalances.length > 0) {
        const lines: VoucherLine[] = permanentAccountBalances.map((row) => ({
          accountCode: row.accountCode,
          accountTitle: row.accountTitle,
          description: `انتقال مانده از سال مالی ${toPersianDigits(profile.fiscalYear)} به ${toPersianDigits(cleanNext)}`,
          debit: row.balanceDebit,
          credit: row.balanceCredit,
        }));

        // Balance retained earnings if net profit/loss hasn't been closed yet
        const totalD = lines.reduce((s, l) => s + l.debit, 0);
        const totalC = lines.reduce((s, l) => s + l.credit, 0);
        if (totalD !== totalC) {
          const retainedAcc =
            accounts.find((a) => a.code.startsWith('503') || a.code.startsWith('501')) ||
            accounts.find((a) => a.category === 'equity') ||
            accounts[0];
          lines.push({
            accountCode: retainedAcc.code,
            accountTitle: retainedAcc.title,
            description: `سود (زیان) انباشته منتقل‌شده از سال مالی ${toPersianDigits(profile.fiscalYear)}`,
            debit: totalC > totalD ? totalC - totalD : 0,
            credit: totalD > totalC ? totalD - totalC : 0,
          });
        }

        const openingVoucher = await createVoucher({
          date: `${cleanNext}/01/01`,
          description: `سند افتتاحیه سال مالی ${toPersianDigits(cleanNext)} (انتقال از ${toPersianDigits(profile.fiscalYear)})`,
          voucherType: 'opening',
          status: 'draft',
          lines,
        });
        openingVoucherNumber = openingVoucher.voucherNumber;
      }

      const archive: FiscalYearArchive = {
        id: generateSafeId('fy'),
        fiscalYear: profile.fiscalYear,
        archivedAt: getTodayShamsi(),
        totalSalesIrr: incomeStatement.netSales,
        netProfitIrr: incomeStatement.netProfit,
        totalAssetsIrr: balanceSheet.totalAssets,
        totalLiabilitiesIrr: balanceSheet.totalLiabilities,
        totalEquityIrr: balanceSheet.totalEquity,
        voucherCount: vouchers.length,
        invoiceCount: invoices.length,
        openingVoucherNumber,
        nextFiscalYear: cleanNext,
      };

      updateExtensions((prev) => ({
        ...prev,
        fiscalArchives: [archive, ...prev.fiscalArchives],
      }));

      await updateCompanyProfile({ fiscalYear: cleanNext });
      showToast(
        `سال مالی ${toPersianDigits(profile.fiscalYear)} آرشیو و سال مالی فعال به ${toPersianDigits(cleanNext)} منتقل شد.`
      );
    } finally {
      setRollingOver(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            مرکز عملیات مالی پیشرفته هلو اپکس ۹.۶
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            تنخواه‌گردان هوشمند با اسکن قبض، اسناد تکرارشونده دوره‌ای، مدیریت تسهیلات بانکی و انتقال دوره سال مالی — همگام‌سازی زنده بین ۳ دستگاه
          </p>
        </div>
      </div>

      {/* 4-Tab Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 flex flex-wrap gap-1.5">
        {[
          { id: 'petty-cash' as const, label: 'تنخواه‌گردان و تسویه', icon: Wallet },
          { id: 'recurring' as const, label: 'اسناد تکرارشونده دوره‌ای', icon: CalendarClock },
          { id: 'loans' as const, label: 'تسهیلات و وام‌های بانکی', icon: Landmark },
          { id: 'fiscal-rollover' as const, label: 'انتقال دوره و سال مالی جدید', icon: ArrowRightLeft },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs transition-colors whitespace-nowrap ${
                active
                  ? 'bg-teal-700 text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ==================== TAB 1: PETTY CASH ==================== */}
      {activeTab === 'petty-cash' && (
        <div className="space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500">سقف مجاز تنخواه‌گردان</div>
              <div className="text-xl font-bold font-code tabular-nums text-slate-900 dark:text-white mt-1.5">
                {formatCompactMoney(pettyCashCeilingIrr, unit)}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  type="number"
                  value={pcCeilingInput}
                  onChange={(e) => setPcCeilingInput(e.target.value)}
                  className="w-28 px-2 py-1 text-xs font-code rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => {
                    const nextIrr = Math.max(0, Math.round((Number(pcCeilingInput) || 0) * displayFactor));
                    updateExtensions((prev) => ({ ...prev, pettyCashCeilingIrr: nextIrr }));
                    showToast('سقف تنخواه‌گردان به‌روزرسانی شد.');
                  }}
                  className="px-2 py-1 text-[11px] font-semibold rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-teal-950/50"
                >
                  تنظیم سقف ({unitName})
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500">هزینه‌های در انتظار تسویه ({toPersianDigits(pendingPettyItems.length)} فقره)</div>
              <div className="text-xl font-bold font-code tabular-nums text-amber-700 dark:text-amber-400 mt-1.5">
                {formatCompactMoney(pendingPettyTotal, unit)}
              </div>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2.5">
                <div
                  className={`h-full rounded-full ${pettyUsagePct >= 85 ? 'bg-rose-600' : 'bg-teal-600'}`}
                  style={{ width: `${pettyUsagePct}%` }}
                />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="text-xs text-slate-500">مانده قابل مصرف تنخواه</div>
                <div className="text-xl font-bold font-code tabular-nums text-emerald-700 dark:text-emerald-400 mt-1.5">
                  {formatCompactMoney(pettyRemaining, unit)}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <select
                  value={pcBankAccount}
                  onChange={(e) => setPcBankAccount(e.target.value)}
                  className="flex-1 px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {bankCashAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={settlingPc || pendingPettyItems.length === 0}
                  onClick={handleSettlePettyCash}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white whitespace-nowrap shrink-0"
                >
                  {settlingPc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>تسویه و شارژ مجدد</span>
                </button>
              </div>
            </div>
          </div>

          {/* Add Expense Form + AI Receipt OCR */}
          <form
            onSubmit={handleAddPettyCashItem}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                ثبت هزینه جدید تنخواه‌گردان
              </h2>
              <div>
                <input
                  ref={ocrFileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleScanPettyReceipt}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={ocrLoading}
                  onClick={() => ocrFileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
                >
                  {ocrLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                  <span>{ocrLoading ? 'در حال خواندن تصویر قبض...' : 'اسکن هوشمند عکس قبض هزینه (AI OCR)'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-slate-500 mb-1">شرح هزینه</label>
                <input
                  value={pcTitle}
                  onChange={(e) => setPcTitle(e.target.value)}
                  placeholder="مثلاً: کرایه پیک ارسال نمونه نخ، پذیرایی، لوازم‌التحریر"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">سرفصل هزینه</label>
                <select
                  value={pcCategoryCode}
                  onChange={(e) => setPcCategoryCode(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {expenseAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">مبلغ ({unitName})</label>
                <input
                  type="number"
                  value={pcAmountDisplay}
                  onChange={(e) => setPcAmountDisplay(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">تاریخ شمسی</label>
                <input
                  value={pcDate}
                  onChange={(e) => setPcDate(e.target.value)}
                  className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                  <span>افزودن به تنخواه</span>
                </button>
              </div>
            </div>
          </form>

          {/* Petty Cash Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">تاریخ</th>
                    <th className="py-2.5 px-4">شرح هزینه</th>
                    <th className="py-2.5 px-4">سرفصل حسابداری</th>
                    <th className="py-2.5 px-4 text-left">مبلغ</th>
                    <th className="py-2.5 px-4">وضعیت</th>
                    <th className="py-2.5 px-4 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pettyCashItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        هنوز خرده‌هزینه‌ای در تنخواه‌گردان ثبت نشده است. می‌توانید دستی ثبت کنید یا از قبض هزینه عکس بگیرید.
                      </td>
                    </tr>
                  ) : (
                    pettyCashItems.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-code">{toPersianDigits(it.date)}</td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">
                          {it.title}
                          {it.vendorName && (
                            <span className="text-[11px] text-slate-400 mr-2">({it.vendorName})</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                          <span className="font-code text-slate-400 ml-1">{it.categoryAccountCode}</span>
                          {it.categoryTitle}
                        </td>
                        <td className="py-2.5 px-4 text-left font-code tabular-nums font-semibold">
                          {formatMoney(it.amountIrr, unit)}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`font-semibold ${
                              it.status === 'settled'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {it.status === 'settled' ? 'تسویه‌شده (سند خورد)' : 'در انتظار تسویه'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {it.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() =>
                                updateExtensions((prev) => ({
                                  ...prev,
                                  pettyCashItems: prev.pettyCashItems.filter((x) => x.id !== it.id),
                                }))
                              }
                              className="p-1 text-slate-400 hover:text-rose-600"
                              aria-label="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: RECURRING VOUCHERS ==================== */}
      {activeTab === 'recurring' && (
        <div className="space-y-5">
          <form
            onSubmit={handleAddRecurringTemplate}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              تعریف الگوی سند تکرارشونده ماهانه (اجاره، قبوض، آبونمان و...)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-slate-500 mb-1">عنوان سند دوره‌ای</label>
                <input
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                  placeholder="مثلاً: اجاره انبار شادآباد"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">حساب بدهکار</label>
                <select
                  value={recDebitCode}
                  onChange={(e) => setRecDebitCode(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {leafAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">حساب بستانکار</label>
                <select
                  value={recCreditCode}
                  onChange={(e) => setRecCreditCode(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {leafAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">مبلغ ({unitName}) · روز ماه</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    value={recAmountDisplay}
                    onChange={(e) => setRecAmountDisplay(e.target.value)}
                    placeholder="مبلغ"
                    className="flex-1 min-w-0 px-2.5 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={recDay}
                    onChange={(e) => setRecDay(e.target.value)}
                    title="روز صدور در هر ماه"
                    className="w-14 px-2 py-2 font-code text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                  <span>افزودن الگو</span>
                </button>
              </div>
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recurringTemplates.map((tpl) => {
              const totalDebit = tpl.lines.reduce((s, l) => s + l.debit, 0);
              const issuedThisMonth = tpl.lastIssuedPeriod === currentPeriod;
              return (
                <div
                  key={tpl.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{tpl.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        سررسید: روز {toPersianDigits(tpl.dayOfMonth)} هر ماه · مبلغ:{' '}
                        <strong className="font-code text-slate-800 dark:text-slate-100">
                          {formatMoney(totalDebit, unit)}
                        </strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateExtensions((prev) => ({
                          ...prev,
                          recurringTemplates: prev.recurringTemplates.filter((t) => t.id !== tpl.id),
                        }))
                      }
                      className="p-1 text-slate-400 hover:text-rose-600"
                      aria-label="حذف الگو"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1 bg-slate-50 dark:bg-slate-950/60 rounded-lg p-2.5 border border-slate-100 dark:border-slate-800">
                    {tpl.lines.map((l, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <span className="truncate text-slate-700 dark:text-slate-300">
                          <span className="font-code text-slate-400 ml-1">{l.accountCode}</span>
                          {l.accountTitle}
                        </span>
                        <span
                          className={`font-code tabular-nums font-semibold shrink-0 ${
                            l.debit > 0
                              ? 'text-teal-700 dark:text-teal-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {l.debit > 0 ? `بد ${formatCompactMoney(l.debit, unit)}` : `بس ${formatCompactMoney(l.credit, unit)}`}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-slate-500 font-code">
                      {tpl.lastIssuedPeriod
                        ? `آخرین صدور: ${toPersianDigits(tpl.lastIssuedPeriod)}`
                        : 'هنوز صادر نشده'}
                    </span>
                    <button
                      type="button"
                      disabled={issuingRecId === tpl.id}
                      onClick={() => handleIssueRecurring(tpl)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap ${
                        issuedThisMonth
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-teal-700 hover:bg-teal-800 text-white'
                      }`}
                    >
                      {issuingRecId === tpl.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {issuedThisMonth ? 'صادرشده (صدور مجدد)' : `صدور سند دوره ${toPersianDigits(currentPeriod)}`}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== TAB 3: BANK LOANS & AMORTIZATION ==================== */}
      {activeTab === 'loans' && (
        <div className="space-y-5">
          <form
            onSubmit={handleCreateLoan}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              ثبت تسهیلات / وام بانکی جدید و محاسبه خودکار جدول اصل و سود
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-500 mb-1">عنوان وام / تسهیلات</label>
                <input
                  value={loanTitle}
                  onChange={(e) => setLoanTitle(e.target.value)}
                  placeholder="مثلاً: تسهیلات سرمایه در گردش واردات"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">بانک و حساب پرداخت قسط</label>
                <select
                  value={loanBankCode}
                  onChange={(e) => {
                    setLoanBankCode(e.target.value);
                    const acc = bankCashAccounts.find((a) => a.code === e.target.value);
                    if (acc) setLoanBankName(acc.title.split('—')[0].trim());
                  }}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {bankCashAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">اصل مبلغ تسهیلات ({unitName})</label>
                <input
                  type="number"
                  value={loanPrincipalDisplay}
                  onChange={(e) => setLoanPrincipalDisplay(e.target.value)}
                  placeholder="مثلاً: 500000000"
                  className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">نرخ سود سالانه ٪</label>
                  <input
                    type="number"
                    step="0.5"
                    value={loanInterestPct}
                    onChange={(e) => setLoanInterestPct(e.target.value)}
                    className="w-full px-2.5 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">تعداد اقساط</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={loanMonths}
                    onChange={(e) => setLoanMonths(e.target.value)}
                    className="w-full px-2.5 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <input
                  value={loanNumber}
                  onChange={(e) => setLoanNumber(e.target.value)}
                  placeholder="شماره قرارداد تسهیلات (اختیاری)"
                  className="px-3 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 w-52"
                />
                <input
                  value={loanStartDate}
                  onChange={(e) => setLoanStartDate(e.target.value)}
                  placeholder="تاریخ شروع"
                  className="px-3 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 w-32"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
              >
                <Coins className="w-4 h-4" />
                <span>محاسبه جدول اقساط و ثبت وام</span>
              </button>
            </div>
          </form>

          {bankLoans.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500">
              هنوز تسهیلات بانکی ثبت نشده است. با فرم بالا وام جدید تعریف کنید تا جدول اقساط اصل و سود خودکار ساخته شود.
            </div>
          ) : (
            <div className="space-y-4">
              {bankLoans.map((loan) => {
                const paidCount = loan.installments.filter((i) => i.paid).length;
                const totalInterest = loan.installments.reduce((s, i) => s + i.interestIrr, 0);
                const remainingBalance = loan.installments
                  .filter((i) => !i.paid)
                  .reduce((s, i) => s + i.totalIrr, 0);
                const isExpanded = expandedLoanId === loan.id;

                return (
                  <div
                    key={loan.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs"
                  >
                    <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {loan.title}{' '}
                          <span className="font-code text-xs font-normal text-slate-400">
                            ({loan.loanNumber})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                          <span>{loan.bankName}</span>
                          <span>·</span>
                          <span>اصل: {formatCompactMoney(loan.principalIrr, unit)}</span>
                          <span>·</span>
                          <span>کل سود ({toPersianDigits(loan.annualInterestPct)}٪): {formatCompactMoney(totalInterest, unit)}</span>
                          <span>·</span>
                          <span>
                            پرداخت‌شده: {toPersianDigits(paidCount)} از {toPersianDigits(loan.installmentCount)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-left pl-2">
                          <div className="text-[10.5px] text-slate-400">مانده تعهدات</div>
                          <div className="font-code font-bold text-rose-700 dark:text-rose-400">
                            {formatCompactMoney(remainingBalance, unit)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedLoanId(isExpanded ? null : loan.id)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          {isExpanded ? 'بستن جدول اقساط' : 'مشاهده و پرداخت اقساط'}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 dark:border-slate-800 overflow-x-auto">
                        <table className="w-full text-right border-collapse">
                          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="py-2 px-3">قسط</th>
                              <th className="py-2 px-3">سررسید</th>
                              <th className="py-2 px-3 text-left">اصل وام</th>
                              <th className="py-2 px-3 text-left">سود تسهیلات</th>
                              <th className="py-2 px-3 text-left">مبلغ قسط</th>
                              <th className="py-2 px-3 text-center">عملیات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loan.installments.map((inst) => {
                              const key = `${loan.id}-${inst.index}`;
                              return (
                                <tr key={inst.index} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="py-2 px-3 font-code font-semibold">
                                    #{toPersianDigits(inst.index)}
                                  </td>
                                  <td className="py-2 px-3 font-code">{toPersianDigits(inst.dueDate)}</td>
                                  <td className="py-2 px-3 text-left font-code tabular-nums">
                                    {formatMoney(inst.principalIrr, unit, false)}
                                  </td>
                                  <td className="py-2 px-3 text-left font-code tabular-nums text-amber-700 dark:text-amber-400">
                                    {formatMoney(inst.interestIrr, unit, false)}
                                  </td>
                                  <td className="py-2 px-3 text-left font-code tabular-nums font-bold">
                                    {formatMoney(inst.totalIrr, unit)}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {inst.paid ? (
                                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                        پرداخت‌شده ({toPersianDigits(inst.paidDate || '')})
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={payingInstallmentKey === key}
                                        onClick={() => handlePayLoanInstallment(loan, inst.index)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-700 hover:bg-teal-800 text-white font-semibold disabled:opacity-50"
                                      >
                                        {payingInstallmentKey === key ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <CheckCircle2 className="w-3 h-3" />
                                        )}
                                        <span>ثبت سند قسط</span>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 4: FISCAL YEAR ROLLOVER ==================== */}
      {activeTab === 'fiscal-rollover' && (
        <div className="space-y-5 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  انتقال دوره و افتتاح سال مالی جدید (آرشیو سال {toPersianDigits(profile.fiscalYear)})
                </h2>
                <p className="text-slate-500 mt-0.5">
                  ذخیره تصویر رسمی ترازنامه و سود و زیان سال جاری در آرشیو سنواتی و انتقال خودکار مانده حساب‌های دائم (دارایی، بدهی و سرمایه) به سند افتتاحیه سال جدید.
                </p>
              </div>
              <span className="font-code font-bold text-teal-700 dark:text-teal-400">
                سال مالی فعلی: {toPersianDigits(profile.fiscalYear)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">جمع دارایی‌های انتقالی</div>
                <div className="text-base font-bold font-code tabular-nums mt-1">
                  {formatCompactMoney(balanceSheet.totalAssets, unit)}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">جمع بدهی و سرمایه انتقالی</div>
                <div className="text-base font-bold font-code tabular-nums mt-1">
                  {formatCompactMoney(balanceSheet.totalLiabilities + balanceSheet.totalEquity, unit)}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">تعداد سرفصل‌های دائم انتقالی</div>
                <div className="text-base font-bold font-code tabular-nums mt-1">
                  {toPersianDigits(permanentAccountBalances.length)} حساب معین
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-slate-600 dark:text-slate-300 font-semibold">سال مالی جدید:</label>
                  <input
                    value={nextYearInput}
                    onChange={(e) => setNextYearInput(e.target.value)}
                    className="w-24 px-3 py-1.5 font-code font-bold text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={createOpeningVoucherFlag}
                    onChange={(e) => setCreateOpeningVoucherFlag(e.target.checked)}
                    className="rounded border-slate-300 text-teal-700"
                  />
                  <span>صدور خودکار سند افتتاحیه تراز برای تاریخ {toPersianDigits(nextYearInput)}/01/01</span>
                </label>
              </div>
              <button
                type="button"
                disabled={rollingOver}
                onClick={handleExecuteFiscalRollover}
                className="inline-flex items-center gap-2 px-4 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg"
              >
                {rollingOver ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Archive className="w-4 h-4" />
                )}
                <span>آرشیو سال {toPersianDigits(profile.fiscalYear)} و افتتاح سال {toPersianDigits(nextYearInput)}</span>
              </button>
            </div>
          </div>

          {/* Archived Fiscal Years */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              آرشیو سنوات مالی گذشته ({toPersianDigits(fiscalArchives.length)} دوره)
            </h3>
            {fiscalArchives.length === 0 ? (
              <p className="text-slate-500">
                هنوز دوره مالی آرشیوشده‌ای ثبت نشده است. پس از اجرای انتقال دوره، خلاصه رسمی هر سال مالی برای مقایسه سنواتی در اینجا نگهداری می‌شود.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2 px-3">سال مالی</th>
                      <th className="py-2 px-3">تاریخ آرشیو</th>
                      <th className="py-2 px-3 text-left">فروش خالص</th>
                      <th className="py-2 px-3 text-left">سود خالص</th>
                      <th className="py-2 px-3 text-left">جمع دارایی‌ها</th>
                      <th className="py-2 px-3">سند افتتاحیه سال بعد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {fiscalArchives.map((ar) => (
                      <tr key={ar.id}>
                        <td className="py-2.5 px-3 font-code font-bold text-teal-700 dark:text-teal-400">
                          {toPersianDigits(ar.fiscalYear)}
                        </td>
                        <td className="py-2.5 px-3 font-code">{toPersianDigits(ar.archivedAt)}</td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums">
                          {formatCompactMoney(ar.totalSalesIrr, unit)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatCompactMoney(ar.netProfitIrr, unit)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums">
                          {formatCompactMoney(ar.totalAssetsIrr, unit)}
                        </td>
                        <td className="py-2.5 px-3 font-code">
                          {ar.openingVoucherNumber
                            ? `سند #${toPersianDigits(ar.openingVoucherNumber)} (سال ${toPersianDigits(ar.nextFiscalYear)})`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
