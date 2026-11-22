import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Trash2, X } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { Account, AccountCategory, AccountLevel, AccountNature } from '../types/accounting';
import { formatMoney, toPersianDigits } from '../lib/format';
import { computeAccountLedger } from '../lib/accountingEngine';
import { fuzzyFilterAndRank } from '../lib/fuzzySearch';
import { FuzzyTableOption, FuzzyTableSearch } from './FuzzyTableSearch';

const LEVEL_LABELS: Record<AccountLevel, string> = {
  group: 'گروه',
  kol: 'کل',
  moein: 'معین',
  tafsili: 'تفصیلی',
};

const CATEGORY_LABELS: Record<AccountCategory, string> = {
  asset: 'دارایی',
  liability: 'بدهی',
  equity: 'حقوق صاحبان سهام',
  revenue: 'درآمد و فروش',
  cogs: 'بهای تمام‌شده',
  expense: 'هزینه',
  memo: 'انتظامی / کنترلی',
};

export const AccountsView: React.FC<{ initialIntent?: string; clearIntent?: () => void }> = ({
  initialIntent,
  clearIntent,
}) => {
  const {
    accounts,
    vouchers,
    trialBalance,
    profile,
    addAccount,
    updateAccount,
    deleteAccount,
    showToast,
  } = useAccounting();
  const unit = profile.currencyUnit;

  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | 'cash_bank' | 'ar_ap' | 'pnl'>('all');
  const [selectedCode, setSelectedCode] = useState<string>('10201');
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<AccountLevel>('moein');
  const [parentCode, setParentCode] = useState('102');
  const [category, setCategory] = useState<AccountCategory>('asset');
  const [nature, setNature] = useState<AccountNature>('debit');

  useEffect(() => {
    if (!initialIntent) return;
    if (initialIntent === 'banks-cash') {
      setGroupFilter('cash_bank');
      setSelectedCode('10201');
    } else if (initialIntent === 'new-account') {
      setEditingAccount(null);
      setCode('');
      setTitle('');
      setShowForm(true);
    }
    clearIntent?.();
  }, [initialIntent, clearIntent]);

  const balanceMap = useMemo(() => {
    const map = new Map<string, number>();
    trialBalance.forEach((r) => map.set(r.accountCode, r.balanceDebit - r.balanceCredit));
    return map;
  }, [trialBalance]);

  const accountSearchOptions: FuzzyTableOption[] = useMemo(
    () =>
      [...accounts]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => {
          const bal = balanceMap.get(a.code) ?? 0;
          return {
            id: a.code,
            code: a.code,
            label: a.title,
            sublabel: `${LEVEL_LABELS[a.level]} · ${CATEGORY_LABELS[a.category]}`,
            meta: bal === 0 ? 'مانده صفر' : `${formatMoney(Math.abs(bal), unit, false)} ${bal > 0 ? 'بد' : 'بس'}`,
            metaTone: bal < 0 ? 'positive' : 'default',
            keywords: `${a.code} ${a.title} ${LEVEL_LABELS[a.level]} ${CATEGORY_LABELS[a.category]}`,
          };
        }),
    [accounts, balanceMap, unit]
  );

  const groupScopedAccounts = useMemo(
    () =>
      [...accounts]
        .filter((a) => {
          if (groupFilter === 'cash_bank' && !(a.code.startsWith('101') || a.code.startsWith('102'))) {
            return false;
          }
          if (
            groupFilter === 'ar_ap' &&
            !(a.code.startsWith('103') || a.code.startsWith('104') || a.code.startsWith('301') || a.code.startsWith('302'))
          ) {
            return false;
          }
          if (
            groupFilter === 'pnl' &&
            !(a.category === 'revenue' || a.category === 'cogs' || a.category === 'expense')
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accounts, groupFilter]
  );

  const filtered = useMemo(() => {
    const ranked = fuzzyFilterAndRank(groupScopedAccounts, search, (a) => [
      { text: a.code, weight: 1.45 },
      { text: a.title, weight: 1.25 },
      { text: LEVEL_LABELS[a.level], weight: 0.85 },
      { text: CATEGORY_LABELS[a.category], weight: 0.85 },
    ]);
    return ranked.map((r) => r.item);
  }, [groupScopedAccounts, search]);

  const selectedAccount = accounts.find((a) => a.code === selectedCode);
  const ledger = useMemo(
    () => (selectedCode ? computeAccountLedger(selectedCode, vouchers) : []),
    [selectedCode, vouchers]
  );

  const openEdit = (acc: Account) => {
    setEditingAccount(acc);
    setCode(acc.code);
    setTitle(acc.title);
    setLevel(acc.level);
    setParentCode(acc.parentCode || '');
    setCategory(acc.category);
    setNature(acc.nature);
    setShowForm(true);
  };

  const openCreate = () => {
    setEditingAccount(null);
    setCode('');
    setTitle('');
    setLevel('moein');
    setParentCode('102');
    setCategory('asset');
    setNature('debit');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('عنوان حساب الزامی است.');
      return;
    }

    if (editingAccount) {
      await updateAccount(editingAccount.id, {
        title: title.trim(),
        parentCode: parentCode.trim() || undefined,
        category,
        nature,
      });
      setEditingAccount(null);
      setShowForm(false);
      return;
    }

    const cleanCode = code.replace(/\D/g, '');
    if (!cleanCode) {
      showToast('کد عددی حساب را وارد کنید.');
      return;
    }
    if (accounts.some((a) => a.code === cleanCode)) {
      showToast('این کد حساب قبلاً در کدینگ ثبت شده است.');
      return;
    }
    await addAccount({
      code: cleanCode,
      title: title.trim(),
      level,
      parentCode: parentCode.trim() || undefined,
      category,
      nature,
      isSystem: false,
    });
    setCode('');
    setTitle('');
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            سرفصل‌های حسابداری، کدینگ، صندوق و بانک‌ها
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            تعریف، ویرایش و حذف حساب‌های کل، معین و تفصیلی (بانک‌ها، صندوق، تنخواه و سرفصل‌های هلو) با مرور آنی گردش
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>تعریف حساب / بانک جدید</span>
        </button>
      </div>

      {/* Category Quick Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto w-fit">
        {(
          [
            { id: 'all', label: 'همه سرفصل‌ها' },
            { id: 'cash_bank', label: 'صندوق، تنخواه و بانک‌ها' },
            { id: 'ar_ap', label: 'بدهکاران، بستانکاران و اسناد' },
            { id: 'pnl', label: 'درآمدها و هزینه‌ها' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setGroupFilter(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
              groupFilter === t.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {editingAccount
                ? `ویرایش سرفصل کد ${editingAccount.code}`
                : 'افزودن حساب یا حساب بانکی جدید به کدینگ'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingAccount(null);
              }}
              className="p-1 text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">کد حساب (فقط عدد)</label>
              <input
                value={code}
                disabled={!!editingAccount}
                onChange={(e) => setCode(e.target.value)}
                placeholder="مثلاً 10203"
                className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-500 mb-1">عنوان حساب</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثلاً بانک پاسارگاد — حساب ارزی"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">سطح</label>
              <select
                value={level}
                disabled={!!editingAccount}
                onChange={(e) => setLevel(e.target.value as AccountLevel)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
              >
                {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1">گروه مالی</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as AccountCategory)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1">ماهیت</label>
              <select
                value={nature}
                onChange={(e) => setNature(e.target.value as AccountNature)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="debit">بدهکار</option>
                <option value="credit">بستانکار</option>
                <option value="both">دوطرفه</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-xs">
              <label className="text-slate-500">کد حساب والد:</label>
              <input
                value={parentCode}
                onChange={(e) => setParentCode(e.target.value)}
                className="w-28 px-2.5 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
            >
              {editingAccount ? 'ذخیره تغییرات' : 'ذخیره در کدینگ'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Accounts Tree Table */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800">
            <FuzzyTableSearch
              options={accountSearchOptions}
              query={search}
              onQueryChange={setSearch}
              totalCount={groupScopedAccounts.length}
              matchedCount={filtered.length}
              entityLabel="حساب"
              onSelect={(opt) => setSelectedCode(opt.id)}
              placeholder="جستجوی فازی سرفصل یا بانک (کد مثل ۱۰۲ یا عنوان حساب)..."
              emptyText="سرفصلی با این کد یا عنوان یافت نشد."
            />
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-2.5 px-4">کد</th>
                  <th className="py-2.5 px-4">عنوان حساب</th>
                  <th className="py-2.5 px-4">سطح</th>
                  <th className="py-2.5 px-4 text-left">مانده جاری</th>
                  <th className="py-2.5 px-3">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((a) => {
                  const bal = balanceMap.get(a.code) ?? 0;
                  const indent =
                    a.level === 'group'
                      ? 'font-bold bg-slate-50/70 dark:bg-slate-950/60'
                      : a.level === 'kol'
                        ? 'pr-6 font-semibold'
                        : 'pr-10';
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setSelectedCode(a.code)}
                      className={`cursor-pointer transition-colors ${
                        selectedCode === a.code
                          ? 'bg-teal-50/70 dark:bg-teal-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-code text-teal-800 dark:text-teal-400 font-semibold">
                        {a.code}
                      </td>
                      <td className={`py-2.5 px-4 text-slate-900 dark:text-slate-100 ${indent}`}>
                        {a.title}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">{LEVEL_LABELS[a.level]}</td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        {bal === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span
                            className={
                              bal > 0
                                ? 'text-slate-900 dark:text-slate-100 font-medium'
                                : 'text-emerald-700 dark:text-emerald-400 font-medium'
                            }
                          >
                            {formatMoney(Math.abs(bal), unit, false)} {bal > 0 ? 'بد' : 'بس'}
                          </span>
                        )}
                      </td>
                      <td
                        className="py-2.5 px-3 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openEdit(a)}
                            title="ویرایش عنوان و مشخصات"
                            className="p-1 rounded text-slate-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {!a.isSystem && (
                            <button
                              onClick={() => deleteAccount(a.id)}
                              title="حذف حساب"
                              className="p-1 rounded text-slate-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Account Quick Ledger */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              مرور گردش حساب: {selectedAccount?.title ?? selectedCode}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-code">
              کد {selectedCode} · {selectedAccount ? CATEGORY_LABELS[selectedAccount.category] : ''}
            </p>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {ledger.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                گردشی در اسناد برای این کد حساب ثبت نشده است.
              </div>
            ) : (
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2 px-3">سند</th>
                    <th className="py-2 px-3">شرح</th>
                    <th className="py-2 px-3 text-left">بدهکار</th>
                    <th className="py-2 px-3 text-left">بستانکار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ledger.map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-3 font-code text-slate-600 dark:text-slate-300">
                        #{toPersianDigits(row.voucherNumber)}
                        <div className="text-[10px] text-slate-400">
                          {toPersianDigits(row.date)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 max-w-[160px] truncate">
                        {row.description}
                      </td>
                      <td className="py-2.5 px-3 text-left font-code tabular-nums">
                        {row.debit > 0 ? formatMoney(row.debit, unit, false) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-left font-code tabular-nums">
                        {row.credit > 0 ? formatMoney(row.credit, unit, false) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
