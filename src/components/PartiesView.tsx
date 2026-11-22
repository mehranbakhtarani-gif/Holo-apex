import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  MessageCircle,
  MessageSquare,
  Plus,
  Printer,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { Party, PartyPricingTier, PartyType } from '../types/accounting';
import { computePartyLedger } from '../lib/accountingEngine';
import { PRICING_TIER_LABELS } from '../lib/enterpriseAccounting';
import {
  buildSmsUrl,
  buildWhatsAppUrl,
  computeAbcIntelligence,
  formatPartyStatementShareMessage,
} from '../lib/apexExtensions';
import {
  buildTelegramShareUrl,
  buildWhatsAppShareUrl,
  exportToCsv,
  formatMoney,
  formatPartyStatementShareText,
  numberToPersianWords,
  toPersianDigits,
} from '../lib/format';
import { fuzzyFilterAndRank } from '../lib/fuzzySearch';
import { loadInvoiceSettings } from '../lib/invoiceSettings';
import { FuzzyTableOption, FuzzyTableSearch } from './FuzzyTableSearch';

const PARTY_LABELS: Record<PartyType, string> = {
  customer: 'مشتری (خریدار)',
  vendor: 'تأمین‌کننده (فروشنده)',
  both: 'مشتری و تأمین‌کننده',
  intermediary: 'واسطه / بازاریاب',
};

export const PartiesView: React.FC<{ initialIntent?: string; clearIntent?: () => void }> = ({
  initialIntent,
  clearIntent,
}) => {
  const {
    parties,
    vouchers,
    invoices,
    cheques,
    partyBalances,
    profile,
    addParty,
    updateParty,
    deleteParty,
    showToast,
  } = useAccounting();
  const unit = profile.currencyUnit;

  const customerTierMap = useMemo(() => {
    const report = computeAbcIntelligence({
      products: [],
      parties,
      invoices,
      cheques,
      partyBalances,
    });
    return new Map(report.customers.map((c) => [c.partyId, c]));
  }, [parties, invoices, cheques, partyBalances]);

  const [filter, setFilter] = useState<'all' | PartyType>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);

  // Statement Modal
  const [statementParty, setStatementParty] = useState<Party | null>(null);
  const [includeCheques, setIncludeCheques] = useState(false);

  const [name, setName] = useState('');
  const [partyType, setPartyType] = useState<PartyType>('customer');
  const [nationalId, setNationalId] = useState('');
  const [economicCode, setEconomicCode] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState(20_000_000_000);
  const [commissionRate, setCommissionRate] = useState(0);
  const [pricingTier, setPricingTier] = useState<PartyPricingTier>('standard');
  const [tierDiscountPct, setTierDiscountPct] = useState(0);

  const openCreate = () => {
    setEditingParty(null);
    setName('');
    setPartyType('customer');
    setNationalId('');
    setEconomicCode('');
    setPhone('');
    setAddress('');
    setCreditLimit(20_000_000_000);
    setCommissionRate(0);
    setPricingTier('standard');
    setTierDiscountPct(0);
    setShowForm(true);
  };

  const openEdit = (p: Party) => {
    setEditingParty(p);
    setName(p.name);
    setPartyType(p.partyType);
    setNationalId(p.nationalId || '');
    setEconomicCode(p.economicCode || '');
    setPhone(p.phone || '');
    setAddress(p.address || '');
    setCreditLimit(p.creditLimit);
    setCommissionRate(p.commissionRate || 0);
    setPricingTier(p.pricingTier || 'standard');
    setTierDiscountPct(p.tierDiscountPct ?? PRICING_TIER_LABELS[p.pricingTier || 'standard'].defaultDiscountPct);
    setShowForm(true);
  };

  useEffect(() => {
    if (initialIntent === 'new-party') {
      openCreate();
      clearIntent?.();
    }
  }, [initialIntent, clearIntent]);

  const partySearchOptions: FuzzyTableOption[] = useMemo(
    () =>
      parties.map((p) => {
        const bal = partyBalances.get(p.id) ?? 0;
        return {
          id: p.id,
          code: p.code,
          label: p.name,
          sublabel: `${PARTY_LABELS[p.partyType]}${p.nationalId ? ` · شناسه: ${p.nationalId}` : ''}${
            p.phone ? ` · ${p.phone}` : ''
          }`,
          meta:
            bal === 0
              ? 'تسویه'
              : `${formatMoney(Math.abs(bal), unit, false)} ${bal > 0 ? 'بد' : 'بس'}`,
          metaTone: bal > 0 ? 'warning' : bal < 0 ? 'positive' : 'default',
          keywords: `${p.code} ${p.name} ${p.nationalId || ''} ${p.economicCode || ''} ${p.phone || ''} ${p.address || ''}`,
        };
      }),
    [parties, partyBalances, unit]
  );

  const typeScopedParties = useMemo(
    () => parties.filter((p) => filter === 'all' || p.partyType === filter),
    [parties, filter]
  );

  const filtered = useMemo(() => {
    const ranked = fuzzyFilterAndRank(typeScopedParties, search, (p) => [
      { text: p.code, weight: 1.3 },
      { text: p.name, weight: 1.25 },
      { text: p.nationalId, weight: 1.1 },
      { text: p.economicCode, weight: 1.0 },
      { text: p.phone, weight: 1.0 },
      { text: p.address, weight: 0.8 },
    ]);
    return ranked.map((r) => r.item);
  }, [typeScopedParties, search]);

  const statementEntries = useMemo(
    () => (statementParty ? computePartyLedger(statementParty.id, vouchers, includeCheques) : []),
    [statementParty, vouchers, includeCheques]
  );

  const statementShare = useMemo(() => {
    if (!statementParty) return null;
    const bal = partyBalances.get(statementParty.id) ?? 0;
    const invSettings = loadInvoiceSettings();
    const text = formatPartyStatementShareText({
      companyName: profile.companyName,
      fiscalYear: profile.fiscalYear,
      partyName: statementParty.name,
      partyCode: statementParty.code,
      currentBalance: bal,
      entries: statementEntries,
      unit,
      bankInfo: invSettings.bankInfo,
    });
    return {
      balance: bal,
      text,
      whatsappUrl: buildWhatsAppShareUrl(text, statementParty.phone),
      telegramUrl: buildTelegramShareUrl(text),
    };
  }, [statementParty, partyBalances, profile.companyName, profile.fiscalYear, statementEntries, unit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('نام شخص یا شرکت طرف‌حساب را وارد کنید.');
      return;
    }

    const safeTierDiscount = Math.max(0, Math.min(50, Number(tierDiscountPct) || 0));

    if (editingParty) {
      await updateParty(editingParty.id, {
        name: name.trim(),
        partyType,
        nationalId: nationalId.trim(),
        economicCode: economicCode.trim(),
        phone: phone.trim(),
        address: address.trim(),
        creditLimit,
        accountCode: partyType === 'vendor' ? '30101' : '10401',
        commissionRate: partyType === 'intermediary' ? commissionRate : 0,
        pricingTier: partyType === 'customer' || partyType === 'both' ? pricingTier : 'standard',
        tierDiscountPct: partyType === 'customer' || partyType === 'both' ? safeTierDiscount : 0,
      });
      setEditingParty(null);
      setShowForm(false);
      return;
    }

    const nextCode = String(1000 + parties.length + 1);
    await addParty({
      code: nextCode,
      name: name.trim(),
      partyType,
      nationalId: nationalId.trim() || undefined,
      economicCode: economicCode.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      creditLimit,
      openingBalance: 0,
      accountCode: partyType === 'vendor' ? '30101' : '10401',
      commissionRate: partyType === 'intermediary' ? commissionRate : undefined,
      pricingTier: partyType === 'customer' || partyType === 'both' ? pricingTier : undefined,
      tierDiscountPct: partyType === 'customer' || partyType === 'both' ? safeTierDiscount : undefined,
    });
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            مدیریت طرف‌حساب‌ها و اشخاص (F5)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            معرفی، ویرایش، کنترل سقف اعتبار و دریافت صورتحساب تفصیلی دقیق مشتریان، تأمین‌کنندگان و واسطه‌ها
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportToCsv(
                'holoo-parties.csv',
                [
                  'کد',
                  'نام طرف‌حساب',
                  'نوع',
                  'شناسه ملی',
                  'کد اقتصادی',
                  'تلفن',
                  'سقف اعتبار (ریال)',
                  'مانده جاری (ریال)',
                ],
                filtered.map((p) => [
                  p.code,
                  p.name,
                  PARTY_LABELS[p.partyType],
                  p.nationalId || '-',
                  p.economicCode || '-',
                  p.phone || '-',
                  p.creditLimit,
                  partyBalances.get(p.id) ?? 0,
                ])
              )
            }
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>خروجی CSV</span>
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>طرف‌حساب جدید</span>
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 no-print"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {editingParty
                ? `ویرایش طرف‌حساب کد ${toPersianDigits(editingParty.code)}`
                : 'تعریف طرف‌حساب جدید'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingParty(null);
              }}
              className="p-1 text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="md:col-span-2">
              <label className="block text-slate-500 mb-1">نام کامل شخص یا شرکت</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="شرکت صنعتی و تجاری ..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">نوع طرف‌حساب</label>
              <select
                value={partyType}
                onChange={(e) => setPartyType(e.target.value as PartyType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {Object.entries(PARTY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1">شناسه ملی / کد ملی</label>
              <input
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">کد اقتصادی (سامانه مودیان)</label>
              <input
                value={economicCode}
                onChange={(e) => setEconomicCode(e.target.value)}
                className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">تلفن تماس</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">سقف اعتبار (ریال)</label>
              <input
                type="number"
                min={0}
                value={creditLimit}
                onChange={(e) => setCreditLimit(Number(e.target.value))}
                className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-500 mb-1">نشانی کامل</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            {partyType === 'intermediary' && (
              <div>
                <label className="block text-slate-500 mb-1">درصد پورسانت واسطه (٪)</label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={100}
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(Number(e.target.value))}
                  className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            )}
            {(partyType === 'customer' || partyType === 'both') && (
              <>
                <div className="md:col-span-2">
                  <label className="block text-slate-500 mb-1">تیپ قیمتی مشتری (هلو)</label>
                  <select
                    value={pricingTier}
                    onChange={(e) => {
                      const nextTier = e.target.value as PartyPricingTier;
                      setPricingTier(nextTier);
                      setTierDiscountPct(PRICING_TIER_LABELS[nextTier].defaultDiscountPct);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {(Object.keys(PRICING_TIER_LABELS) as PartyPricingTier[]).map((t) => (
                      <option key={t} value={t}>
                        {PRICING_TIER_LABELS[t].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">درصد تخفیف خودکار فاکتور (٪)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={50}
                    value={tierDiscountPct}
                    onChange={(e) => setTierDiscountPct(Number(e.target.value))}
                    className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingParty(null);
              }}
              className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
            >
              {editingParty ? 'ذخیره تغییرات' : 'ثبت طرف‌حساب'}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
          {(['all', 'customer', 'vendor', 'both', 'intermediary'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                filter === t
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t === 'all' ? 'همه اشخاص' : PARTY_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="w-full md:w-96">
          <FuzzyTableSearch
            options={partySearchOptions}
            query={search}
            onQueryChange={setSearch}
            totalCount={typeScopedParties.length}
            matchedCount={filtered.length}
            entityLabel="طرف‌حساب"
            onSelect={(opt) => {
              const found = parties.find((x) => x.id === opt.id);
              if (found) setStatementParty(found);
            }}
            placeholder="جستجوی فازی طرف‌حساب (نام، کد، شناسه ملی، تلفن یا شهر)..."
            emptyText="طرف‌حسابی با این مشخصات یافت نشد."
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                <th className="py-3 px-4">کد</th>
                <th className="py-3 px-4">نام طرف‌حساب</th>
                <th className="py-3 px-4">نقش</th>
                <th className="py-3 px-4">شناسه ملی / اقتصادی</th>
                <th className="py-3 px-4 text-left">سقف اعتبار</th>
                <th className="py-3 px-4 text-left">مانده حساب جاری</th>
                <th className="py-3 px-4">وضعیت</th>
                <th className="py-3 px-4">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((p) => {
                const bal = partyBalances.get(p.id) ?? 0;
                const overLimit = bal > p.creditLimit && p.creditLimit > 0;
                const abcInfo = customerTierMap.get(p.id);
                const quickBalanceMsg = formatPartyStatementShareMessage({
                  partyName: p.name,
                  balanceIrr: bal,
                  companyName: profile.companyName,
                  unit,
                });
                return (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-code font-semibold text-teal-800 dark:text-teal-400">
                      {toPersianDigits(p.code)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-900 dark:text-white">{p.name}</span>
                        {abcInfo && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              abcInfo.tier === 'gold'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                : abcInfo.tier === 'silver'
                                  ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300'
                                  : abcInfo.tier === 'risk'
                                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {abcInfo.tierLabel}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {p.phone || '—'}
                        {p.commissionRate
                          ? ` · پورسانت ${toPersianDigits(p.commissionRate)}٪`
                          : ''}
                        {(p.partyType === 'customer' || p.partyType === 'both') && p.pricingTier && p.pricingTier !== 'standard'
                          ? ` · ${PRICING_TIER_LABELS[p.pricingTier].label.split('—')[0].trim()}${
                              p.tierDiscountPct ? ` (${toPersianDigits(p.tierDiscountPct)}٪ تخفیف)` : ''
                            }`
                          : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      <div>{PARTY_LABELS[p.partyType]}</div>
                      {(p.partyType === 'customer' || p.partyType === 'both') && (
                        <div className="text-[10.5px] text-teal-700 dark:text-teal-400 mt-0.5">
                          {PRICING_TIER_LABELS[p.pricingTier || 'standard'].label.split('(')[0].trim()}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-code text-slate-500">
                      <div>{p.nationalId || '—'}</div>
                      <div className="text-[11px]">{p.economicCode || ''}</div>
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums text-slate-700 dark:text-slate-300">
                      {formatMoney(p.creditLimit, unit, false)}
                    </td>
                    <td className="py-3 px-4 text-left font-code tabular-nums font-semibold text-slate-900 dark:text-white">
                      {formatMoney(Math.abs(bal), unit, false)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {bal === 0 ? (
                        <span className="text-slate-500">تسویه</span>
                      ) : bal > 0 ? (
                        <span
                          className={
                            overLimit
                              ? 'text-rose-700 dark:text-rose-400 font-semibold'
                              : 'text-amber-700 dark:text-amber-400 font-medium'
                          }
                        >
                          بدهکار {overLimit ? '(عبور از سقف)' : ''}
                        </span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          بستانکار
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setStatementParty(p)}
                          className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 hover:underline font-medium"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>صورتحساب</span>
                        </button>
                        <a
                          href={buildWhatsAppUrl(p.phone, quickBalanceMsg)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="ارسال مانده حساب در واتساپ"
                          className="p-1 rounded text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={buildSmsUrl(p.phone, quickBalanceMsg)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="ارسال مانده حساب با پیامک"
                          className="p-1 rounded text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => openEdit(p)}
                          title="ویرایش"
                          className="p-1 rounded text-slate-500 hover:text-teal-700"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteParty(p.id)}
                          title="حذف"
                          className="p-1 rounded text-slate-500 hover:text-rose-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable Party Subsidiary Ledger Statement Modal */}
      {statementParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 p-6 space-y-5 print-container">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold">
                  صورتحساب تفصیلی طرف‌حساب — {statementParty.name}
                </h3>
                <div className="text-xs text-slate-500 mt-1">
                  کد تفصیلی: {toPersianDigits(statementParty.code)} · شرکت: {profile.companyName} · سال
                  مالی {toPersianDigits(profile.fiscalYear)}
                </div>
              </div>
              <div className="flex items-center gap-3 no-print">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeCheques}
                    onChange={(e) => setIncludeCheques(e.target.checked)}
                    className="rounded border-slate-300 text-teal-700"
                  />
                  نمایش گردش حساب چک‌ها (۱۰۳/۳۰۲)
                </label>
                <button
                  onClick={() => setStatementParty(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500">
                    <th className="py-2.5 px-3">سند</th>
                    <th className="py-2.5 px-3">تاریخ</th>
                    <th className="py-2.5 px-3">معین</th>
                    <th className="py-2.5 px-3">شرح عملیات</th>
                    <th className="py-2.5 px-3 text-left">بدهکار</th>
                    <th className="py-2.5 px-3 text-left">بستانکار</th>
                    <th className="py-2.5 px-3 text-left">مانده در خط</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {statementEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        گردشی برای این طرف‌حساب ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    statementEntries.map((row, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 font-code">
                          #{toPersianDigits(row.voucherNumber)}
                        </td>
                        <td className="py-2.5 px-3 font-code text-slate-500">
                          {toPersianDigits(row.date)}
                        </td>
                        <td className="py-2.5 px-3 font-code text-teal-700 dark:text-teal-400">
                          {row.accountCode}
                        </td>
                        <td className="py-2.5 px-3">{row.description}</td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums">
                          {row.debit > 0 ? formatMoney(row.debit, unit, false) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums">
                          {row.credit > 0 ? formatMoney(row.credit, unit, false) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-left font-code tabular-nums font-bold">
                          {formatMoney(Math.abs(row.runningBalance), unit, false)}{' '}
                          {row.runningBalance >= 0 ? 'بد' : 'بس'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {statementShare && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-slate-500">مانده نهایی قابل تسویه: </span>
                  <strong className="font-code text-slate-900 dark:text-white">
                    {formatMoney(Math.abs(statementShare.balance), unit)}{' '}
                    {statementShare.balance === 0
                      ? '(تسویه)'
                      : statementShare.balance > 0
                        ? '(بدهکار)'
                        : '(بستانکار)'}
                  </strong>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  به حروف: <strong>{numberToPersianWords(Math.abs(statementShare.balance), unit)}</strong>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 no-print">
              <div className="flex flex-wrap items-center gap-1.5">
                {statementShare && (
                  <>
                    <a
                      href={statementShare.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>ارسال در واتساپ</span>
                    </a>
                    <a
                      href={statementShare.telegramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>ارسال در تلگرام</span>
                    </a>
                    <a
                      href={buildSmsUrl(statementParty.phone, statementShare.text)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>ارسال پیامک</span>
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(statementShare.text);
                          showToast('متن صورتحساب تفصیلی کپی شد و آماده ارسال است.');
                        } catch {
                          showToast('دسترسی کلیپ‌بورد فعال نیست؛ از دکمه مستقیم واتساپ یا تلگرام استفاده کنید.');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>کپی متن صورتحساب</span>
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStatementParty(null)}
                  className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  بستن
                </button>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  <Printer className="w-4 h-4" />
                  <span>چاپ صورتحساب</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
