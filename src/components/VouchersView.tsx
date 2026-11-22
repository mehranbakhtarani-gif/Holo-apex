import { apiUrl } from '../lib/apiBase';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  Edit3,
  Inbox,
  ListOrdered,
  Loader2,
  Lock,
  Plus,
  Printer,
  RotateCcw,
  Scale,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { useWorkspaceExtensions } from '../context/WorkspaceExtensionsContext';
import { Voucher, VoucherLine, VoucherType } from '../types/accounting';
import {
  exportToCsv,
  formatMoney,
  getTodayShamsi,
  numberToPersianWords,
  toPersianDigits,
} from '../lib/format';
import {
  BASE_CURRENCY_CODE,
  convertForeignToIrr,
  convertIrrToForeign,
  formatForeignMoney,
  formatForeignNumber,
  getEffectiveExchangeRate,
  isForeignCurrency,
  normalizeCurrencyCode,
  roundCurrency,
} from '../lib/currency';
import { fuzzyFilterAndRank } from '../lib/fuzzySearch';
import { detectVoucherAnomalies } from '../lib/smartIntelligence';
import { SmartSearchCombobox, SmartSearchOption } from './SmartSearchCombobox';
import { FuzzyTableOption, FuzzyTableSearch } from './FuzzyTableSearch';
import { VoiceInputButton } from './VoiceInputButton';

const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  opening: 'افتتاحیه',
  general: 'عمومی / اصلاحی',
  sales: 'فروش',
  purchase: 'خرید',
  treasury: 'خزانه‌داری',
  payroll: 'حقوق و دستمزد',
  depreciation: 'استهلاک',
  closing: 'اختتامیه',
};

const ALLOWED_AI_VOUCHER_TYPES = new Set<VoucherType>([
  'opening',
  'general',
  'sales',
  'purchase',
  'treasury',
  'payroll',
  'depreciation',
  'closing',
]);

export const VouchersView: React.FC<{ initialIntent?: string; clearIntent?: () => void }> = ({
  initialIntent,
  clearIntent,
}) => {
  const {
    vouchers,
    accounts,
    parties,
    costCenters,
    currencies,
    exchangeRates,
    importDossiers,
    salesOrders,
    profile,
    createVoucher,
    updateVoucher,
    deleteVoucher,
    finalizeVoucher,
    finalizeAllDraftVouchers,
    createReversingVoucher,
    renumberVouchersChronologically,
    showToast,
  } = useAccounting();
  const { setEditingLock, getConflictingDevices } = useWorkspaceExtensions();
  const unit = profile.currencyUnit;

  const [viewMode, setViewMode] = useState<'journal' | 'cartable'>('journal');
  const [selectedId, setSelectedId] = useState<string | null>(
    vouchers[vouchers.length - 1]?.id ?? null
  );
  const [showForm, setShowForm] = useState(false);
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);

  const currentVoucherLockKey = showForm
    ? editingVoucherId
      ? `voucher:${editingVoucherId}`
      : 'voucher:new'
    : '';
  const conflictingDevices = useMemo(
    () => (currentVoucherLockKey ? getConflictingDevices(currentVoucherLockKey) : []),
    [currentVoucherLockKey, getConflictingDevices]
  );

  useEffect(() => {
    if (!showForm) {
      setEditingLock('', '');
      return;
    }
    const label = editingVoucherId
      ? `ویرایش سند #${vouchers.find((v) => v.id === editingVoucherId)?.voucherNumber ?? ''}`
      : 'ثبت سند حسابداری جدید';
    setEditingLock(currentVoucherLockKey, label);
    return () => setEditingLock('', '');
  }, [showForm, editingVoucherId, currentVoucherLockKey, setEditingLock, vouchers]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'permanent'>('all');

  // Holoo Apex 9.6 Voucher Composer State
  const [date, setDate] = useState(getTodayShamsi());
  const [atfNumber, setAtfNumber] = useState(''); // شماره عطف هلو ۹.۶
  const [subNumber, setSubNumber] = useState(''); // شماره فرعی هلو ۹.۶
  const [description, setDescription] = useState('');
  const [voucherType, setVoucherType] = useState<VoucherType>('general');
  const [currencyCode, setCurrencyCode] = useState<string>(BASE_CURRENCY_CODE);
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [lines, setLines] = useState<VoucherLine[]>([
    { accountCode: '10101', accountTitle: 'صندوق مرکزی شرکت', description: '', debit: 0, credit: 0 },
    { accountCode: '10201', accountTitle: 'بانک ملت — حساب جاری شرکتی', description: '', debit: 0, credit: 0 },
  ]);

  // AI Natural-Language-to-Voucher State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReasoning, setAiReasoning] = useState('');

  const nextVoucherNumber = useMemo(() => {
    const maxNum = vouchers.reduce((m, v) => (v.voucherNumber > m ? v.voucherNumber : m), 0);
    return maxNum + 1;
  }, [vouchers]);

  const activeCurrencies = useMemo(
    () => currencies.filter((c) => c.active || c.isBase),
    [currencies]
  );

  const activeCurrencyDef = useMemo(
    () => currencies.find((c) => normalizeCurrencyCode(c.code) === normalizeCurrencyCode(currencyCode)),
    [currencies, currencyCode]
  );

  const isFxMode = isForeignCurrency(currencyCode);
  const fxDecimals = activeCurrencyDef?.decimalPlaces ?? 2;

  const resetComposer = (type: VoucherType = 'general') => {
    setEditingVoucherId(null);
    setDate(type === 'opening' ? `${profile.fiscalYear}/01/01` : getTodayShamsi());
    setAtfNumber(String(nextVoucherNumber));
    setSubNumber('1');
    setDescription(type === 'opening' ? `سند اصلاح / تکمیل تراز افتتاحیه سال مالی ${profile.fiscalYear}` : '');
    setVoucherType(type);
    setCurrencyCode(BASE_CURRENCY_CODE);
    setExchangeRate(1);
    setAiReasoning('');
    setLines([
      { accountCode: '10101', accountTitle: 'صندوق مرکزی شرکت', description: '', debit: 0, credit: 0 },
      { accountCode: '10201', accountTitle: 'بانک ملت — حساب جاری شرکتی', description: '', debit: 0, credit: 0 },
    ]);
  };

  const handleCurrencyChange = (nextCode: string) => {
    const norm = normalizeCurrencyCode(nextCode);
    setCurrencyCode(norm);
    if (!isForeignCurrency(norm)) {
      setExchangeRate(1);
      setLines((prev) =>
        prev.map((l) => {
          const { foreignDebit: _fd, foreignCredit: _fc, ...rest } = l;
          return rest;
        })
      );
      return;
    }
    const eff = getEffectiveExchangeRate(norm, date, exchangeRates, currencies);
    const nextRate = eff.rateToIrr > 0 ? eff.rateToIrr : 1;
    const nextDef = currencies.find((c) => normalizeCurrencyCode(c.code) === norm);
    const dec = nextDef?.decimalPlaces ?? 2;
    setExchangeRate(nextRate);
    setLines((prev) =>
      prev.map((l) => {
        const fd =
          l.foreignDebit && l.foreignDebit > 0
            ? l.foreignDebit
            : l.debit > 0
              ? convertIrrToForeign(l.debit, nextRate, dec)
              : 0;
        const fc =
          l.foreignCredit && l.foreignCredit > 0
            ? l.foreignCredit
            : l.credit > 0
              ? convertIrrToForeign(l.credit, nextRate, dec)
              : 0;
        return {
          ...l,
          foreignDebit: fd,
          foreignCredit: fc,
          debit: fd > 0 ? convertForeignToIrr(fd, nextRate) : 0,
          credit: fc > 0 ? convertForeignToIrr(fc, nextRate) : 0,
        };
      })
    );
  };

  const handleExchangeRateChange = (nextRate: number) => {
    const safeRate = Math.max(1, Math.round(nextRate || 1));
    setExchangeRate(safeRate);
    if (isFxMode) {
      setLines((prev) =>
        prev.map((l) => ({
          ...l,
          debit: l.foreignDebit && l.foreignDebit > 0 ? convertForeignToIrr(l.foreignDebit, safeRate) : 0,
          credit: l.foreignCredit && l.foreignCredit > 0 ? convertForeignToIrr(l.foreignCredit, safeRate) : 0,
        }))
      );
    }
  };

  const handleRefreshDailyRate = () => {
    if (!isFxMode) return;
    const eff = getEffectiveExchangeRate(currencyCode, date, exchangeRates, currencies);
    handleExchangeRateChange(eff.rateToIrr);
    showToast(
      eff.rateDate
        ? `نرخ ${currencyCode} از تاریخ ${toPersianDigits(eff.rateDate)} بارگذاری شد.`
        : `نرخ پیش‌فرض ${currencyCode} اعمال شد.`
    );
  };

  useEffect(() => {
    if (initialIntent === 'new-voucher') {
      setViewMode('journal');
      resetComposer('general');
      setShowForm(true);
      clearIntent?.();
    } else if (initialIntent === 'new-opening') {
      setViewMode('journal');
      resetComposer('opening');
      setShowForm(true);
      clearIntent?.();
    } else if (initialIntent === 'drafts') {
      setViewMode('journal');
      setStatusFilter('draft');
      clearIntent?.();
    } else if (initialIntent === 'cartable') {
      setViewMode('cartable');
      clearIntent?.();
    }
  }, [initialIntent, clearIntent]);

  const moeinAccounts = useMemo(
    () =>
      accounts
        .filter((a) => a.level === 'moein' || a.level === 'tafsili')
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  );

  const accountPickerOptions: SmartSearchOption[] = useMemo(
    () =>
      moeinAccounts.map((a) => ({
        id: a.code,
        code: a.code,
        label: a.title,
        sublabel: `سطح: ${a.level === 'moein' ? 'معین' : 'تفصیلی'} · گروه: ${a.category}`,
        keywords: `${a.code} ${a.title} ${a.parentCode || ''}`,
      })),
    [moeinAccounts]
  );

  const partyPickerOptions: SmartSearchOption[] = useMemo(
    () => [
      { id: '', label: 'بدون طرف‌حساب', sublabel: 'ثبت بدون کد تفصیلی شخص' },
      ...parties.map((p) => ({
        id: p.id,
        code: p.code,
        label: p.name,
        sublabel: p.nationalId ? `شناسه: ${p.nationalId}` : p.phone || '',
        keywords: `${p.code} ${p.name} ${p.nationalId || ''} ${p.phone || ''}`,
      })),
    ],
    [parties]
  );

  const voucherSearchOptions: FuzzyTableOption[] = useMemo(
    () =>
      [...vouchers]
        .sort((a, b) => b.voucherNumber - a.voucherNumber)
        .map((v) => ({
          id: v.id,
          code: `#${toPersianDigits(v.voucherNumber)}`,
          label: v.description,
          sublabel: `${toPersianDigits(v.date)} · ${VOUCHER_TYPE_LABELS[v.voucherType]} · ${
            v.status === 'permanent' ? 'دائم' : 'موقت'
          }`,
          meta: formatMoney(v.totalDebit, unit),
          metaTone: v.status === 'draft' ? 'warning' : 'default',
          keywords: [
            String(v.voucherNumber),
            v.date,
            v.description,
            VOUCHER_TYPE_LABELS[v.voucherType],
            String(v.totalDebit),
            ...v.lines.map((l) => `${l.accountCode} ${l.accountTitle} ${l.partyName || ''}`),
          ].join(' '),
        })),
    [vouchers, unit]
  );

  const draftVouchers = useMemo(
    () => vouchers.filter((v) => v.status === 'draft').sort((a, b) => b.voucherNumber - a.voucherNumber),
    [vouchers]
  );
  const draftCount = draftVouchers.length;

  const pendingImports = useMemo(
    () => importDossiers.filter((d) => d.status !== 'cleared'),
    [importDossiers]
  );

  const pendingDispatches = useMemo(
    () => salesOrders.filter((o) => o.status === 'ordered' || o.status === 'dispatched'),
    [salesOrders]
  );

  const cartableTotalCount = draftCount + pendingImports.length + pendingDispatches.length;

  const statusScopedVouchers = useMemo(
    () =>
      [...vouchers]
        .filter((v) => statusFilter === 'all' || v.status === statusFilter)
        .sort((a, b) => b.voucherNumber - a.voucherNumber),
    [vouchers, statusFilter]
  );

  const sortedVouchers = useMemo(() => {
    const ranked = fuzzyFilterAndRank(statusScopedVouchers, search, (v) => [
      { text: String(v.voucherNumber), weight: 1.45 },
      { text: v.description, weight: 1.25 },
      { text: v.date, weight: 1.05 },
      { text: VOUCHER_TYPE_LABELS[v.voucherType], weight: 0.95 },
      { text: String(v.totalDebit), weight: 0.85 },
      {
        text: v.lines.map((l) => `${l.accountCode} ${l.accountTitle} ${l.partyName || ''}`).join(' '),
        weight: 1.0,
      },
    ]);
    return ranked.map((r) => r.item);
  }, [statusScopedVouchers, search]);

  const selectedVoucher: Voucher | undefined =
    vouchers.find((v) => v.id === selectedId) ?? sortedVouchers[0];

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanceDiff = totalDebit - totalCredit;
  const foreignTotalDebit = roundCurrency(
    lines.reduce((s, l) => s + (Number(l.foreignDebit) || 0), 0),
    fxDecimals
  );
  const foreignTotalCredit = roundCurrency(
    lines.reduce((s, l) => s + (Number(l.foreignCredit) || 0), 0),
    fxDecimals
  );
  const foreignBalanceDiff = roundCurrency(foreignTotalDebit - foreignTotalCredit, fxDecimals);
  const isBalanced = balanceDiff === 0 && totalDebit > 0 && lines.length >= 2;

  const smartWarnings = useMemo(
    () =>
      showForm
        ? detectVoucherAnomalies({
            date,
            lines,
            totalDebit,
            vouchers,
            accounts,
            editingVoucherId,
          })
        : [],
    [showForm, date, lines, totalDebit, vouchers, accounts, editingVoucherId]
  );

  // Auto-balance specific row (Holoo 9.6 F9 shortcut)
  const autoBalanceRow = (idx: number) => {
    const otherDebit = lines.reduce((s, l, i) => (i === idx ? s : s + (Number(l.debit) || 0)), 0);
    const otherCredit = lines.reduce((s, l, i) => (i === idx ? s : s + (Number(l.credit) || 0)), 0);
    const diff = otherDebit - otherCredit;
    if (diff === 0) return;
    setLines((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const nextDebit = diff < 0 ? Math.abs(diff) : 0;
        const nextCredit = diff > 0 ? diff : 0;
        return {
          ...r,
          debit: nextDebit,
          credit: nextCredit,
          ...(isFxMode
            ? {
                foreignDebit: nextDebit > 0 ? convertIrrToForeign(nextDebit, exchangeRate, fxDecimals) : 0,
                foreignCredit: nextCredit > 0 ? convertIrrToForeign(nextCredit, exchangeRate, fxDecimals) : 0,
              }
            : {}),
        };
      })
    );
  };

  const appendBalancedLine = () => {
    setLines((prev) => [
      ...prev,
      {
        accountCode: '10202',
        accountTitle: 'بانک سامان — حساب عملیاتی و ارزی',
        description: description.trim(),
        debit: balanceDiff < 0 ? Math.abs(balanceDiff) : 0,
        credit: balanceDiff > 0 ? balanceDiff : 0,
        ...(isFxMode
          ? {
              foreignDebit: foreignBalanceDiff < 0 ? Math.abs(foreignBalanceDiff) : 0,
              foreignCredit: foreignBalanceDiff > 0 ? foreignBalanceDiff : 0,
            }
          : {}),
      },
    ]);
  };

  // Holoo 9.6 Form-level Keyboard Shortcuts (Insert = add line, F9 = auto balance last line)
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Insert') {
      e.preventDefault();
      appendBalancedLine();
    } else if (e.key === 'F9') {
      e.preventDefault();
      e.stopPropagation();
      autoBalanceRow(lines.length - 1);
      showToast('اختلاف سند روی آخرین آرتیکل به‌صورت خودکار تراز شد.');
    }
  };

  // Gemini AI Natural Language -> Balanced Double-Entry Voucher
  const handleAiGenerateVoucher = async () => {
    if (aiPrompt.trim().length < 4 || aiLoading) {
      showToast('شرح فارسی رویداد مالی را وارد کنید (مثلاً: پرداخت ۳۵ میلیون تومان اجاره انبار از بانک ملت).');
      return;
    }
    setAiLoading(true);
    setAiReasoning('');
    try {
      const resp = await fetch(apiUrl('/api/ai/parse-voucher'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: aiPrompt.trim(),
          date,
          currencyUnit: unit,
          accounts: moeinAccounts.map((a) => ({
            code: a.code,
            title: a.title,
            category: a.category,
          })),
          parties: parties.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
          })),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        showToast(data?.error || 'خطا در تبدیل هوشمند متن به سند.');
        return;
      }

      const accMap = new Map(moeinAccounts.map((a) => [a.code, a]));
      const partyMap = new Map(parties.map((p) => [p.id, p]));
      const mappedLines: VoucherLine[] = (data.lines || []).map(
        (l: {
          accountCode: string;
          partyId?: string;
          description: string;
          debitIrr: number;
          creditIrr: number;
        }) => {
          const acc = accMap.get(l.accountCode) ?? moeinAccounts[0];
          const party = l.partyId ? partyMap.get(l.partyId) : undefined;
          return {
            accountCode: acc?.code || l.accountCode,
            accountTitle: acc?.title || 'حساب معین',
            ...(party ? { partyId: party.id, partyName: party.name } : {}),
            description: l.description || data.description || aiPrompt.trim(),
            debit: Math.max(0, Math.round(Number(l.debitIrr) || 0)),
            credit: Math.max(0, Math.round(Number(l.creditIrr) || 0)),
          };
        }
      );

      if (mappedLines.length >= 2) {
        setCurrencyCode(BASE_CURRENCY_CODE);
        setExchangeRate(1);
        setDescription(data.description || aiPrompt.trim());
        if (ALLOWED_AI_VOUCHER_TYPES.has(data.voucherType)) {
          setVoucherType(data.voucherType);
        }
        setLines(mappedLines);
        setAiReasoning(data.reasoning || '');
        showToast('سند دوبل تراز با هوش مصنوعی در جدول هلو ۹.۶ تکمیل شد؛ پس از کنترل ثبت کنید.');
      }
    } catch {
      showToast('اتصال به سرویس هوش مصنوعی برقرار نشد.');
    } finally {
      setAiLoading(false);
    }
  };

  const openEditDraft = (v: Voucher) => {
    if (v.status === 'permanent') {
      showToast('سند دائم قابل ویرایش مستقیم نیست؛ از دکمه «صدور سند اصلاحی / معکوس» استفاده کنید.');
      return;
    }
    setViewMode('journal');
    setEditingVoucherId(v.id);
    setDate(v.date);
    setAtfNumber(String(v.voucherNumber));
    setSubNumber('1');
    setDescription(v.description);
    setVoucherType(v.voucherType);
    const vCode = normalizeCurrencyCode(v.currencyCode);
    setCurrencyCode(vCode);
    setExchangeRate(isForeignCurrency(vCode) && v.exchangeRate ? v.exchangeRate : 1);
    setLines(v.lines.map((l) => ({ ...l })));
    setAiReasoning('');
    setShowForm(true);
  };

  const handleSave = async (
    e: React.FormEvent,
    status: 'draft' | 'permanent',
    saveAndNew = false
  ) => {
    e.preventDefault();
    if (!isBalanced) {
      showToast('اختلاف بدهکار و بستانکار باید دقیقاً صفر و جمع سند بزرگ‌تر از صفر باشد.');
      return;
    }
    if (!description.trim()) {
      showToast('شرح کلی سند حسابداری را وارد کنید.');
      return;
    }
    const cleanLines: VoucherLine[] = lines.map((l) => ({
      accountCode: l.accountCode,
      accountTitle: l.accountTitle,
      ...(l.partyId ? { partyId: l.partyId } : {}),
      ...(l.partyName ? { partyName: l.partyName } : {}),
      ...(l.costCenterId ? { costCenterId: l.costCenterId } : {}),
      debit: Math.max(0, Math.round(Number(l.debit) || 0)),
      credit: Math.max(0, Math.round(Number(l.credit) || 0)),
      ...(isFxMode && (Number(l.foreignDebit) || 0) > 0
        ? { foreignDebit: roundCurrency(Number(l.foreignDebit), fxDecimals) }
        : {}),
      ...(isFxMode && (Number(l.foreignCredit) || 0) > 0
        ? { foreignCredit: roundCurrency(Number(l.foreignCredit), fxDecimals) }
        : {}),
      description: l.description.trim() || description.trim(),
    }));

    const fxPayload = isFxMode
      ? { currencyCode: normalizeCurrencyCode(currencyCode), exchangeRate }
      : { currencyCode: BASE_CURRENCY_CODE, exchangeRate: 1 };

    if (editingVoucherId) {
      await updateVoucher(editingVoucherId, {
        date,
        description,
        voucherType,
        status,
        lines: cleanLines,
        ...fxPayload,
      });
      setSelectedId(editingVoucherId);
    } else {
      const created = await createVoucher({
        date,
        description,
        voucherType,
        status,
        lines: cleanLines,
        ...(isFxMode ? fxPayload : {}),
      });
      setSelectedId(created.id);
    }

    if (saveAndNew) {
      resetComposer('general');
      setAiPrompt('');
    } else {
      setShowForm(false);
      setEditingVoucherId(null);
    }
  };

  const handleReversePermanent = async (v: Voucher) => {
    const rev = await createReversingVoucher(v.id);
    if (rev) {
      setSelectedId(rev.id);
      showToast(
        `سند معکوس موقت #${rev.voucherNumber} برای ابطال/اصلاح سند #${v.voucherNumber} ساخته شد. می‌توانید آن را ویرایش یا دائم کنید.`
      );
    }
  };

  const handleDeleteDraft = async (v: Voucher) => {
    const ok = await deleteVoucher(v.id);
    if (ok && selectedId === v.id) {
      setSelectedId(null);
    }
  };

  const handleExportJournal = () => {
    const rows: (string | number)[][] = [];
    sortedVouchers.forEach((v) => {
      const vCur = normalizeCurrencyCode(v.currencyCode);
      const vRate = isForeignCurrency(vCur) && v.exchangeRate ? v.exchangeRate : 1;
      v.lines.forEach((l) => {
        rows.push([
          v.voucherNumber,
          v.date,
          VOUCHER_TYPE_LABELS[v.voucherType],
          v.status === 'permanent' ? 'دائم' : 'موقت',
          vCur,
          vRate,
          l.accountCode,
          l.accountTitle,
          l.partyName || '-',
          l.description,
          l.foreignDebit ?? 0,
          l.foreignCredit ?? 0,
          l.debit,
          l.credit,
        ]);
      });
    });
    exportToCsv(
      `holoo-journal-${profile.fiscalYear}.csv`,
      [
        'شماره سند',
        'تاریخ',
        'نوع سند',
        'وضعیت',
        'ارز',
        'نرخ برابری (ریال)',
        'کد حساب',
        'عنوان حساب',
        'طرف‌حساب',
        'شرح آرتیکل',
        'بدهکار ارزی',
        'بستانکار ارزی',
        'بدهکار (ریال)',
        'بستانکار (ریال)',
      ],
      rows
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Holoo Apex 9.6 Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            اسناد حسابداری، دفتر روزنامه و کارتابل اسناد (هلو ۹.۶ · F3)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            فرم استاندارد ورود سند هلو اپکس ۹.۶ با تراز خودکار (F9)، ثبت هوشمند از متن فارسی و کارتابل اسناد و حواله‌ها
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setViewMode('journal')}
              className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap ${
                viewMode === 'journal'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              دفتر روزنامه ({toPersianDigits(vouchers.length)})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cartable')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap ${
                viewMode === 'cartable'
                  ? 'bg-white dark:bg-slate-800 text-teal-800 dark:text-teal-300 shadow-sm font-semibold'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>کارتابل اسناد ({toPersianDigits(cartableTotalCount)})</span>
            </button>
          </div>

          {draftCount > 0 && (
            <button
              onClick={() => finalizeAllDraftVouchers()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>دائم‌سازی ({toPersianDigits(draftCount)})</span>
            </button>
          )}
          <button
            onClick={() => renumberVouchersChronologically()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <ListOrdered className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>مرتب‌سازی</span>
          </button>
          <button
            onClick={handleExportJournal}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>اکسل</span>
          </button>
          <button
            onClick={() => {
              setViewMode('journal');
              resetComposer('general');
              setShowForm(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>ثبت سند جدید</span>
          </button>
        </div>
      </div>

      {/* Authentic Holoo Apex 9.6 Double-Entry Voucher Composer Window */}
      {showForm && (
        <form
          onSubmit={(e) => handleSave(e, 'permanent', false)}
          onKeyDown={handleFormKeyDown}
          className="bg-white dark:bg-slate-900 border-2 border-teal-700/25 dark:border-teal-800/70 rounded-xl overflow-hidden shadow-sm no-print"
        >
          {/* Holoo 9.6 Classic Title Bar */}
          <div className="px-5 py-3 bg-slate-800 dark:bg-slate-950 text-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <ClipboardList className="w-4 h-4 text-teal-400" />
              <span className="font-bold text-sm">
                {editingVoucherId
                  ? `ویرایش سند حسابداری موقت`
                  : `فرم ورود اطلاعات سند حسابداری — هلو اپکس ۹.۶`}
              </span>
              <span className="text-slate-400 hidden sm:inline">·</span>
              <span className="text-[11px] text-slate-300 hidden sm:inline font-code">
                Insert: آرتیکل جدید | F9: تراز خودکار اختلاف
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingVoucherId(null);
              }}
              className="p-1 rounded-md text-slate-300 hover:bg-slate-700"
              aria-label="بستن فرم سند"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Multi-Device Concurrent Edit Warning Banner */}
            {conflictingDevices.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <div className="font-bold">هشدار ویرایش همزمان روی دستگاه دیگر</div>
                  <div className="text-[11px] mt-0.5">
                    دستگاه «{conflictingDevices.map((d) => `${d.deviceLabel} (${d.operatorName})`).join('، ')}» هم‌اکنون در حال ثبت یا ویرایش همین سند است. برای جلوگیری از تداخل شماره سند، پیش از ثبت هماهنگ کنید.
                  </div>
                </div>
              </div>
            )}

            {/* Smart AI Natural-Language-to-Voucher Bar (with Persian Voice Input) */}
            <div className="p-3 rounded-lg bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-900/70 space-y-2">
              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-teal-900 dark:text-teal-200 shrink-0">
                  <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>ثبت هوشمند صوتی/متنی سند:</span>
                </div>
                <input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAiGenerateVoucher();
                    }
                  }}
                  placeholder="به فارسی بگویید یا بنویسید؛ مثلاً: پرداخت ۴۵ میلیون تومان اجاره انبار شادآباد از بانک ملت..."
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-teal-300/80 dark:border-teal-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
                <VoiceInputButton
                  compact
                  label="ورود صوتی"
                  onTranscript={(spoken) => {
                    setAiPrompt((prev) => (prev ? `${prev} ${spoken}` : spoken));
                    showToast('متن فارسی از صدای شما دریافت شد؛ دکمه «تبدیل به سند دوبل» را بزنید.');
                  }}
                  onError={(msg) => showToast(msg)}
                />
                <button
                  type="button"
                  onClick={() => void handleAiGenerateVoucher()}
                  disabled={aiLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg whitespace-nowrap shrink-0"
                >
                  {aiLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>{aiLoading ? 'در حال سندزدن...' : 'تبدیل به سند دوبل'}</span>
                </button>
              </div>
              {aiReasoning && (
                <div className="text-[11px] text-teal-800 dark:text-teal-300">
                  منطق سند پیشنهادی: {aiReasoning}
                </div>
              )}
            </div>

            {/* Authentic Holoo 9.6 Voucher Header Metadata Box */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-xs">
              <div className="lg:col-span-1">
                <label className="block text-[11px] text-slate-500 mb-1">شماره سند</label>
                <input
                  readOnly
                  value={editingVoucherId ? `#${toPersianDigits(vouchers.find((x) => x.id === editingVoucherId)?.voucherNumber ?? 0)}` : `#${toPersianDigits(nextVoucherNumber)}`}
                  className="w-full px-2.5 py-1.5 font-code font-bold text-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-teal-800 dark:text-teal-300"
                />
              </div>
              <div className="lg:col-span-1">
                <label className="block text-[11px] text-slate-500 mb-1">عطف</label>
                <input
                  value={atfNumber}
                  onChange={(e) => setAtfNumber(e.target.value)}
                  className="w-full px-2 py-1.5 font-code text-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div className="lg:col-span-1">
                <label className="block text-[11px] text-slate-500 mb-1">فرعی</label>
                <input
                  value={subNumber}
                  onChange={(e) => setSubNumber(e.target.value)}
                  className="w-full px-2 py-1.5 font-code text-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">تاریخ سند (شمسی)</label>
                <input
                  value={date}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setDate(nextDate);
                    if (isFxMode && /^\d{4}\/\d{2}\/\d{2}$/.test(nextDate)) {
                      const eff = getEffectiveExchangeRate(currencyCode, nextDate, exchangeRates, currencies);
                      if (eff.rateToIrr > 0) handleExchangeRateChange(eff.rateToIrr);
                    }
                  }}
                  className="w-full px-2.5 py-1.5 font-code rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">نوع سند</label>
                <select
                  value={voucherType}
                  onChange={(e) => setVoucherType(e.target.value as VoucherType)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {Object.entries(VOUCHER_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">ارز سند</label>
                <select
                  value={currencyCode}
                  onChange={(e) => handleCurrencyChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                >
                  {activeCurrencies.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.isBase ? `${c.code} — ریال پایه` : `${c.code} (${c.symbol})`}
                    </option>
                  ))}
                </select>
              </div>
              {isFxMode ? (
                <div className="lg:col-span-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-slate-500">نرخ برابری (ریال)</label>
                    <button
                      type="button"
                      onClick={handleRefreshDailyRate}
                      className="text-[10.5px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      نرخ روز
                    </button>
                  </div>
                  <input
                    type="number"
                    min={1}
                    dir="ltr"
                    value={exchangeRate}
                    onChange={(e) => handleExchangeRateChange(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 font-code tabular-nums rounded-md border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-900 text-left"
                  />
                </div>
              ) : (
                <div className="lg:col-span-3">
                  <label className="block text-[11px] text-slate-500 mb-1">توضیح و شرح کلی سند</label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="شرح کلی سند حسابداری..."
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              )}
              {isFxMode && (
                <div className="col-span-2 sm:col-span-4 lg:col-span-12">
                  <label className="block text-[11px] text-slate-500 mb-1">شرح کلی سند ارزی</label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={`مثلاً: تسویه حواله ارزی (${currencyCode}) بابت خرید نخ وارداتی`}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              )}
            </div>

            {/* Classic Holoo 9.6 Bordered Voucher Data Grid */}
            <div className="border border-slate-300 dark:border-slate-700 rounded-lg overflow-visible">
              <div className="hidden lg:grid lg:grid-cols-12 bg-slate-100 dark:bg-slate-950 text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-300 dark:border-slate-700 rounded-t-lg">
                <div className="col-span-1 py-2 px-2 text-center border-l border-slate-200 dark:border-slate-800">
                  ردیف
                </div>
                <div className="col-span-3 py-2 px-2.5 border-l border-slate-200 dark:border-slate-800">
                  کد و عنوان حساب معین
                </div>
                <div className="col-span-2 py-2 px-2.5 border-l border-slate-200 dark:border-slate-800">
                  تفصیلی / مرکز هزینه
                </div>
                <div className="col-span-2 py-2 px-2.5 border-l border-slate-200 dark:border-slate-800">
                  شرح آرتیکل
                </div>
                <div className="col-span-2 py-2 px-2.5 text-left border-l border-slate-200 dark:border-slate-800">
                  {isFxMode ? `بدهکار (${currencyCode})` : 'بدهکار (ریال)'}
                </div>
                <div className="col-span-2 py-2 px-2.5 text-left">
                  {isFxMode ? `بستانکار (${currencyCode})` : 'بستانکار (ریال)'}
                </div>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 lg:grid-cols-12 items-start text-xs bg-white dark:bg-slate-900 hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    {/* Row Index & Mini Actions */}
                    <div className="lg:col-span-1 p-2 flex lg:flex-col items-center justify-between lg:justify-center gap-1 lg:border-l border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                      <span className="font-code font-bold text-slate-500">
                        {toPersianDigits(idx + 1)}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => autoBalanceRow(idx)}
                          title="تراز خودکار اختلاف روی این ردیف (F9)"
                          className="p-1 rounded text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50"
                        >
                          <Scale className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setLines((prev) => [
                              ...prev.slice(0, idx + 1),
                              { ...line },
                              ...prev.slice(idx + 1),
                            ])
                          }
                          title="کپی این ردیف"
                          className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {lines.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                            title="حذف ردیف"
                            className="p-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Account Picker */}
                    <div className="lg:col-span-3 p-2 lg:border-l border-slate-200 dark:border-slate-800">
                      <label className="lg:hidden block text-[11px] text-slate-500 mb-1">حساب معین</label>
                      <SmartSearchCombobox
                        mode="picker"
                        compact
                        options={accountPickerOptions}
                        value={line.accountCode}
                        placeholder="کد یا نام حساب معین..."
                        onSelect={(opt) => {
                          const acc = moeinAccounts.find((a) => a.code === opt.id);
                          setLines((prev) =>
                            prev.map((r, i) =>
                              i === idx
                                ? {
                                    ...r,
                                    accountCode: opt.id,
                                    accountTitle: acc?.title || opt.label,
                                  }
                                : r
                            )
                          );
                        }}
                      />
                    </div>

                    {/* Party & Cost Center */}
                    <div className="lg:col-span-2 p-2 space-y-1 lg:border-l border-slate-200 dark:border-slate-800">
                      <SmartSearchCombobox
                        mode="picker"
                        compact
                        options={partyPickerOptions}
                        value={line.partyId || ''}
                        placeholder="تفصیلی طرف‌حساب..."
                        onSelect={(opt) => {
                          const p = parties.find((x) => x.id === opt.id);
                          setLines((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, partyId: p?.id, partyName: p?.name } : r
                            )
                          );
                        }}
                      />
                      <select
                        value={line.costCenterId || ''}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, costCenterId: e.target.value || undefined } : r
                            )
                          )
                        }
                        className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
                      >
                        <option value="">بدون مرکز هزینه</option>
                        {costCenters.map((cc) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.code} — {cc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Line Description */}
                    <div className="lg:col-span-2 p-2 lg:border-l border-slate-200 dark:border-slate-800">
                      <label className="lg:hidden block text-[11px] text-slate-500 mb-1">شرح آرتیکل</label>
                      <input
                        value={line.description}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, description: e.target.value } : r
                            )
                          )
                        }
                        placeholder="شرح ردیف سند..."
                        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>

                    {/* Debit */}
                    <div className="lg:col-span-2 p-2 lg:border-l border-slate-200 dark:border-slate-800">
                      <label className="lg:hidden block text-[11px] text-slate-500 mb-1">
                        {isFxMode ? `بدهکار (${currencyCode})` : 'بدهکار'}
                      </label>
                      {isFxMode ? (
                        <>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            dir="ltr"
                            value={line.foreignDebit ?? 0}
                            onChange={(e) => {
                              const fVal = Math.max(0, Number(e.target.value) || 0);
                              setLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        foreignDebit: fVal,
                                        foreignCredit: 0,
                                        debit: convertForeignToIrr(fVal, exchangeRate),
                                        credit: 0,
                                      }
                                    : r
                                )
                              );
                            }}
                            className="w-full px-2 py-1.5 font-code tabular-nums rounded border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-950 text-left"
                          />
                          <div className="text-[10px] text-slate-500 mt-0.5 font-code tabular-nums text-left">
                            {line.debit > 0 ? formatMoney(line.debit, unit) : '—'}
                          </div>
                        </>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          dir="ltr"
                          value={line.debit}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, debit: Number(e.target.value), credit: 0 } : r
                              )
                            )
                          }
                          className="w-full px-2 py-1.5 font-code tabular-nums text-left rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      )}
                    </div>

                    {/* Credit */}
                    <div className="lg:col-span-2 p-2">
                      <label className="lg:hidden block text-[11px] text-slate-500 mb-1">
                        {isFxMode ? `بستانکار (${currencyCode})` : 'بستانکار'}
                      </label>
                      {isFxMode ? (
                        <>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            dir="ltr"
                            value={line.foreignCredit ?? 0}
                            onChange={(e) => {
                              const fVal = Math.max(0, Number(e.target.value) || 0);
                              setLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        foreignCredit: fVal,
                                        foreignDebit: 0,
                                        credit: convertForeignToIrr(fVal, exchangeRate),
                                        debit: 0,
                                      }
                                    : r
                                )
                              );
                            }}
                            className="w-full px-2 py-1.5 font-code tabular-nums rounded border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-950 text-left"
                          />
                          <div className="text-[10px] text-slate-500 mt-0.5 font-code tabular-nums text-left">
                            {line.credit > 0 ? formatMoney(line.credit, unit) : '—'}
                          </div>
                        </>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          dir="ltr"
                          value={line.credit}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, credit: Number(e.target.value), debit: 0 } : r
                              )
                            )
                          }
                          className="w-full px-2 py-1.5 font-code tabular-nums text-left rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Holoo 9.6 Classic Grid Footer Totals Bar */}
              <div className="bg-slate-100 dark:bg-slate-950 border-t-2 border-slate-300 dark:border-slate-700 px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={appendBalancedLine}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-md hover:bg-teal-100 dark:hover:bg-teal-950"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>آرتیکل جدید (Insert)</span>
                  </button>
                  {balanceDiff !== 0 && (
                    <button
                      type="button"
                      onClick={() => autoBalanceRow(lines.length - 1)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-md hover:bg-amber-200/80"
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>تراز خودکار اختلاف (F9)</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-5">
                  {isFxMode && (
                    <span className="text-teal-800 dark:text-teal-300 font-code tabular-nums">
                      جمع ارزی: <strong>{formatForeignMoney(foreignTotalDebit, currencyCode, currencies, fxDecimals)}</strong>
                    </span>
                  )}
                  <span>
                    جمع بدهکار:{' '}
                    <strong className="font-code tabular-nums text-slate-900 dark:text-white">
                      {formatMoney(totalDebit, unit)}
                    </strong>
                  </span>
                  <span>
                    جمع بستانکار:{' '}
                    <strong className="font-code tabular-nums text-slate-900 dark:text-white">
                      {formatMoney(totalCredit, unit)}
                    </strong>
                  </span>
                  <span
                    className={`font-bold ${
                      isBalanced
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {isBalanced
                      ? 'تراز سند کامل است'
                      : `اختلاف تراز: ${formatMoney(Math.abs(balanceDiff), unit)}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Smart Anomaly Warnings Strip */}
            {smartWarnings.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70 space-y-1 text-xs">
                {smartWarnings.map((w, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 ${
                      w.severity === 'warning'
                        ? 'text-amber-900 dark:text-amber-200 font-medium'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{w.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Amount in Words & Holoo Save Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">
                {totalDebit > 0 && (
                  <span>
                    مبلغ به حروف:{' '}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {numberToPersianWords(totalDebit, unit)}
                    </strong>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={!isBalanced}
                  onClick={(e) => handleSave(e, 'draft', false)}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {editingVoucherId ? 'ذخیره اصلاحات (موقت)' : 'ذخیره در کارتابل موقت'}
                </button>
                {!editingVoucherId && (
                  <button
                    type="button"
                    disabled={!isBalanced}
                    onClick={(e) => handleSave(e, 'permanent', true)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/70 disabled:opacity-50 whitespace-nowrap"
                  >
                    ثبت و سند بعدی
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!isBalanced}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg whitespace-nowrap"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ثبت و دائم‌سازی سند</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Holoo Apex 9.6 Voucher & Dispatch Cartable View */}
      {viewMode === 'cartable' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500">اسناد موقت در انتظار تأیید</div>
              <div className="text-2xl font-bold font-code tabular-nums text-amber-700 dark:text-amber-400 mt-1">
                {toPersianDigits(draftCount)} سند
              </div>
              <div className="text-[11px] text-slate-500 mt-1">قابل ویرایش، حذف یا دائم‌سازی گروهی</div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500">پرونده‌های وارداتی در جریان ترخیص</div>
              <div className="text-2xl font-bold font-code tabular-nums text-cyan-700 dark:text-cyan-400 mt-1">
                {toPersianDigits(pendingImports.length)} پرونده
              </div>
              <div className="text-[11px] text-slate-500 mt-1">در انتظار ثبت سند ترخیص و بهای تمام‌شده</div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500">حواله‌ها و سفارش‌های فروش باز</div>
              <div className="text-2xl font-bold font-code tabular-nums text-indigo-700 dark:text-indigo-400 mt-1">
                {toPersianDigits(pendingDispatches.length)} حواله
              </div>
              <div className="text-[11px] text-slate-500 mt-1">در انتظار توزین باسکول یا صدور فاکتور</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                اسناد حسابداری موقت در کارتابل بررسی ({toPersianDigits(draftCount)})
              </h2>
              {draftCount > 0 && (
                <button
                  type="button"
                  onClick={() => finalizeAllDraftVouchers()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>تأیید و دائم‌سازی همه اسناد کارتابل</span>
                </button>
              )}
            </div>
            {draftVouchers.length === 0 ? (
              <div className="p-8 text-center text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                کارتابل اسناد موقت پاک است؛ تمامی اسناد حسابداری بررسی و دائم‌سازی شده‌اند.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {draftVouchers.map((v) => (
                  <div
                    key={v.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-code font-bold text-slate-900 dark:text-white">
                          سند #{toPersianDigits(v.voucherNumber)}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="font-code text-slate-500">{toPersianDigits(v.date)}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-amber-700 dark:text-amber-400 font-medium">
                          {VOUCHER_TYPE_LABELS[v.voucherType]}
                        </span>
                      </div>
                      <div className="text-slate-700 dark:text-slate-300 truncate">{v.description}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-code tabular-nums font-bold text-slate-900 dark:text-white ml-2">
                        {formatMoney(v.totalDebit, unit)}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEditDraft(v)}
                        className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                      >
                        ویرایش
                      </button>
                      <button
                        type="button"
                        onClick={() => finalizeVoucher(v.id)}
                        className="px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                      >
                        دائم‌سازی
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Split Layout: Voucher Register + Active Voucher Detail */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl no-print">
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
              <FuzzyTableSearch
                options={voucherSearchOptions}
                query={search}
                onQueryChange={setSearch}
                totalCount={statusScopedVouchers.length}
                matchedCount={sortedVouchers.length}
                entityLabel="سند"
                onSelect={(opt) => {
                  setSelectedId(opt.id);
                }}
                placeholder="جستجوی فازی سند (شماره سند، تاریخ، کد معین، طرف‌حساب یا شرح)..."
                emptyText="سندی با این مشخصات یافت نشد."
              />
              <div className="flex items-center gap-1 text-[11px]">
                {(
                  [
                    { id: 'all', label: `همه (${toPersianDigits(vouchers.length)})` },
                    {
                      id: 'permanent',
                      label: `دائم (${toPersianDigits(vouchers.filter((v) => v.status === 'permanent').length)})`,
                    },
                    {
                      id: 'draft',
                      label: `موقت (${toPersianDigits(vouchers.filter((v) => v.status === 'draft').length)})`,
                    },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setStatusFilter(t.id)}
                    className={`px-2.5 py-1 rounded-md font-medium ${
                      statusFilter === t.id
                        ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
              {sortedVouchers.map((v) => {
                const active = selectedVoucher?.id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedId(v.id)}
                    className={`w-full text-right p-4 transition-colors ${
                      active
                        ? 'bg-teal-50/70 dark:bg-teal-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-code font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>سند #{toPersianDigits(v.voucherNumber)}</span>
                        {isForeignCurrency(v.currencyCode) && (
                          <span className="text-[10.5px] font-semibold text-teal-700 dark:text-teal-400">
                            · ارزی {v.currencyCode}
                          </span>
                        )}
                      </span>
                      <span className="font-code text-slate-500">{toPersianDigits(v.date)}</span>
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-300 mt-1.5 line-clamp-1">
                      {v.description}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                      <span>
                        {VOUCHER_TYPE_LABELS[v.voucherType]} ·{' '}
                        <span
                          className={
                            v.status === 'permanent'
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-amber-600 font-medium'
                          }
                        >
                          {v.status === 'permanent' ? 'دائم' : 'موقت'}
                        </span>
                      </span>
                      <span className="font-code tabular-nums font-semibold text-slate-900 dark:text-slate-200 text-left">
                        {formatMoney(v.totalDebit, unit)}
                        {isForeignCurrency(v.currencyCode) &&
                          v.foreignTotalDebit !== undefined &&
                          v.foreignTotalDebit > 0 && (
                            <span className="block text-[10px] font-normal text-teal-700 dark:text-teal-400">
                              {formatForeignMoney(v.foreignTotalDebit, v.currencyCode!, currencies)}
                            </span>
                          )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Voucher Detail + Accountant Actions */}
          <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
            {selectedVoucher ? (
              <>
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      سند حسابداری شماره {toPersianDigits(selectedVoucher.voucherNumber)}
                      {isForeignCurrency(selectedVoucher.currencyCode) && (
                        <span className="mr-2 font-code text-xs font-semibold text-teal-700 dark:text-teal-400">
                          (ارزی — {selectedVoucher.currencyCode})
                        </span>
                      )}
                    </h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      تاریخ {toPersianDigits(selectedVoucher.date)} · نوع:{' '}
                      {VOUCHER_TYPE_LABELS[selectedVoucher.voucherType]} ·{' '}
                      {selectedVoucher.status === 'permanent' ? 'وضعیت: دائم و قطعی' : 'وضعیت: موقت'}
                      {isForeignCurrency(selectedVoucher.currencyCode) && selectedVoucher.exchangeRate && (
                        <>
                          {' '}
                          · نرخ برابری:{' '}
                          <span className="font-code tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                            {formatMoney(selectedVoucher.exchangeRate, unit)}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                      {selectedVoucher.description}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 no-print">
                    <button
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>چاپ سند</span>
                    </button>
                    {selectedVoucher.status === 'draft' ? (
                      <>
                        <button
                          onClick={() => openEditDraft(selectedVoucher)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>ویرایش</span>
                        </button>
                        <button
                          onClick={() => handleDeleteDraft(selectedVoucher)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                        <button
                          onClick={() => finalizeVoucher(selectedVoucher.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>دائم‌سازی</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleReversePermanent(selectedVoucher)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>صدور سند اصلاحی / معکوس</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                        <th className="py-2.5 px-4">کد معین</th>
                        <th className="py-2.5 px-4">عنوان حساب و شرح</th>
                        <th className="py-2.5 px-4 text-left">بدهکار</th>
                        <th className="py-2.5 px-4 text-left">بستانکار</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedVoucher.lines.map((l, idx) => {
                        const selIsFx = isForeignCurrency(selectedVoucher.currencyCode);
                        return (
                          <tr key={idx}>
                            <td className="py-3 px-4 font-code font-semibold text-teal-800 dark:text-teal-400">
                              {l.accountCode}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {l.accountTitle}
                                {l.partyName ? ` (${l.partyName})` : ''}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{l.description}</div>
                            </td>
                            <td className="py-3 px-4 text-left font-code tabular-nums text-slate-900 dark:text-slate-100">
                              <div>{l.debit > 0 ? formatMoney(l.debit, unit, false) : '—'}</div>
                              {selIsFx && l.foreignDebit !== undefined && l.foreignDebit > 0 && (
                                <div className="text-[10.5px] text-teal-700 dark:text-teal-400">
                                  {formatForeignNumber(l.foreignDebit, 2)} {selectedVoucher.currencyCode}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-left font-code tabular-nums text-slate-900 dark:text-slate-100">
                              <div>{l.credit > 0 ? formatMoney(l.credit, unit, false) : '—'}</div>
                              {selIsFx && l.foreignCredit !== undefined && l.foreignCredit > 0 && (
                                <div className="text-[10.5px] text-teal-700 dark:text-teal-400">
                                  {formatForeignNumber(l.foreignCredit, 2)} {selectedVoucher.currencyCode}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-bold text-slate-900 dark:text-white">
                        <td colSpan={2} className="py-3 px-4">
                          <div>جمع کل سند ({toPersianDigits(selectedVoucher.lines.length)} آرتیکل)</div>
                          <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                            به حروف: {numberToPersianWords(selectedVoucher.totalDebit, unit)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-left font-code tabular-nums">
                          <div>{formatMoney(selectedVoucher.totalDebit, unit, false)}</div>
                          {isForeignCurrency(selectedVoucher.currencyCode) &&
                            selectedVoucher.foreignTotalDebit !== undefined && (
                              <div className="text-[10.5px] text-teal-700 dark:text-teal-400">
                                {formatForeignMoney(
                                  selectedVoucher.foreignTotalDebit,
                                  selectedVoucher.currencyCode!,
                                  currencies
                                )}
                              </div>
                            )}
                        </td>
                        <td className="py-3 px-4 text-left font-code tabular-nums">
                          <div>{formatMoney(selectedVoucher.totalCredit, unit, false)}</div>
                          {isForeignCurrency(selectedVoucher.currencyCode) &&
                            selectedVoucher.foreignTotalCredit !== undefined && (
                              <div className="text-[10.5px] text-teal-700 dark:text-teal-400">
                                {formatForeignMoney(
                                  selectedVoucher.foreignTotalCredit,
                                  selectedVoucher.currencyCode!,
                                  currencies
                                )}
                              </div>
                            )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-10 text-center text-sm text-slate-500">
                یک سند را از فهرست سمت راست انتخاب کنید.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
