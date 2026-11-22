import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Factory,
  Package,
  Plus,
  Printer,
  Scale,
  Ship,
  Trash2,
  X,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import {
  ImportCostAllocationMethod,
  ImportLandedCost,
  SalesOrder,
  SubcontractJob,
} from '../types/accounting';
import { calculateLandedCostAllocation } from '../lib/enterpriseAccounting';
import { getEffectiveExchangeRate, isForeignCurrency } from '../lib/currency';
import { formatMoney, formatWeight, getTodayShamsi, toPersianDigits } from '../lib/format';

type CommercialTab = 'imports' | 'orders' | 'subcontract';

/** Renders a crisp deterministic Code-128-style vector barcode for yarn cartons & lot numbers */
const CartonBarcodeSvg: React.FC<{ value: string }> = ({ value }) => {
  const bars = useMemo(() => {
    const out: { x: number; w: number }[] = [];
    let x = 4;
    const text = value || 'ATLASRIS-LOT';
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const pattern = [(code % 3) + 1, ((code >> 2) % 2) + 1, ((code >> 4) % 3) + 1, 1];
      for (let b = 0; b < pattern.length; b++) {
        if (b % 2 === 0) out.push({ x, w: pattern[b] * 1.4 });
        x += pattern[b] * 1.8;
      }
    }
    return { out, totalWidth: Math.max(160, x + 4) };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${bars.totalWidth} 44`}
      className="w-full h-11 text-slate-900"
      role="img"
      aria-label={`بارکد ${value}`}
    >
      <rect x="0" y="0" width={bars.totalWidth} height="44" fill="#ffffff" />
      {bars.out.map((bar, idx) => (
        <rect key={idx} x={bar.x} y="3" width={bar.w} height="38" fill="currentColor" />
      ))}
    </svg>
  );
};

export const ImportAndSubcontractView: React.FC<{
  initialIntent?: string;
  clearIntent?: () => void;
}> = ({ initialIntent, clearIntent }) => {
  const {
    profile,
    parties,
    products,
    accounts,
    currencies,
    exchangeRates,
    importDossiers,
    salesOrders,
    subcontractJobs,
    addImportDossier,
    clearImportDossier,
    addSalesOrder,
    dispatchSalesOrder,
    invoiceSalesOrder,
    addSubcontractJob,
    completeSubcontractJob,
    showToast,
  } = useAccounting();

  const [tab, setTab] = useState<CommercialTab>('imports');
  const unit = profile.currencyUnit;

  // Holoo-style Modal States
  const [showImportModal, setShowImportModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [dispatchingOrder, setDispatchingOrder] = useState<SalesOrder | null>(null);
  const [barcodeOrder, setBarcodeOrder] = useState<SalesOrder | null>(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [completingSub, setCompletingSub] = useState<SubcontractJob | null>(null);

  useEffect(() => {
    if (!initialIntent) return;
    if (initialIntent === 'imports') setTab('imports');
    else if (initialIntent === 'orders' || initialIntent === 'dispatch') setTab('orders');
    else if (initialIntent === 'subcontract' || initialIntent === 'dyeing') setTab('subcontract');
    clearIntent?.();
  }, [initialIntent, clearIntent]);

  const foreignCurrencies = useMemo(
    () => currencies.filter((c) => !c.isBase && c.active),
    [currencies]
  );

  // ---------------- IMPORT DOSSIER MODAL FORM STATE ----------------
  const [impNumber, setImpNumber] = useState(() => `IMP-${profile.fiscalYear}-${String(importDossiers.length + 1).padStart(3, '0')}`);
  const [impProforma, setImpProforma] = useState('PI-CN-2026-112');
  const [impCotage, setImpCotage] = useState('50100-9845110');
  const [impSupplierId, setImpSupplierId] = useState(() => parties.find((p) => p.partyType !== 'customer')?.id || parties[0]?.id || '');
  const [impOrigin, setImpOrigin] = useState('چین / بندر شانگهای');
  const [impWarehouse, setImpWarehouse] = useState('انبار بندرعباس (ترخیص)');
  const [impDate, setImpDate] = useState(() => getTodayShamsi());
  const [impCurrency, setImpCurrency] = useState('USD');
  const [impRate, setImpRate] = useState<number>(() =>
    getEffectiveExchangeRate('USD', getTodayShamsi(), exchangeRates, currencies).rateToIrr
  );
  const [impMethod, setImpMethod] = useState<ImportCostAllocationMethod>('weight');
  const [impItems, setImpItems] = useState(() => [
    {
      productId: products[0]?.id || '',
      lotNumber: 'CN-2026-901',
      weightKg: 4000,
      cartonCount: 160,
      foreignUnitPrice: 1.62,
    },
  ]);
  const [impCosts, setImpCosts] = useState<ImportLandedCost[]>([
    { id: 'c1', title: 'کرایه حمل دریایی و کانتینر', amountIrr: 520_000_000, accountCode: '10202' },
    { id: 'c2', title: 'حقوق و عوارض گمرکی (کوتاژ)', amountIrr: 980_000_000, accountCode: '10201' },
    { id: 'c3', title: 'بیمه، انبارداری گمرک و ترخیص‌کار', amountIrr: 260_000_000, accountCode: '30101' },
  ]);

  const liveImportPreview = useMemo(() => {
    const mapped = impItems.map((it) => {
      const p = products.find((pr) => pr.id === it.productId);
      return {
        productId: it.productId,
        sku: p?.sku || 'YN-IMP',
        productName: p?.name || 'کالای وارداتی',
        lotNumber: it.lotNumber,
        weightKg: Number(it.weightKg) || 0,
        cartonCount: Number(it.cartonCount) || 0,
        foreignUnitPrice: Number(it.foreignUnitPrice) || 0,
      };
    });
    return calculateLandedCostAllocation(mapped, impCosts, impRate, impMethod);
  }, [impItems, impCosts, impRate, impMethod, products]);

  const handleSaveImportDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    const supplier = parties.find((p) => p.id === impSupplierId);
    if (!supplier || liveImportPreview.computedItems.length === 0) {
      showToast('لطفاً تأمین‌کننده و حداقل یک ردیف نخ وارداتی را انتخاب کنید.');
      return;
    }
    await addImportDossier({
      dossierNumber: impNumber.trim() || `IMP-${profile.fiscalYear}-00${importDossiers.length + 1}`,
      proformaNumber: impProforma.trim(),
      cotageNumber: impCotage.trim(),
      supplierId: supplier.id,
      supplierName: supplier.name,
      originCountry: impOrigin.trim(),
      warehouse: impWarehouse.trim(),
      date: impDate,
      currencyCode: impCurrency,
      exchangeRate: impRate,
      allocationMethod: impMethod,
      status: 'customs',
      items: liveImportPreview.computedItems,
      costs: impCosts.filter((c) => c.amountIrr > 0),
      totalForeignAmount: liveImportPreview.totalForeignAmount,
      totalFobIrr: liveImportPreview.totalFobIrr,
      totalLandedCostsIrr: liveImportPreview.totalLandedCostsIrr,
      totalRecoverableVatIrr: liveImportPreview.totalRecoverableVatIrr,
      grandTotalLandedIrr: liveImportPreview.grandTotalLandedIrr,
    });
    setShowImportModal(false);
  };

  // ---------------- SALES ORDER & WEIGHBRIDGE DISPATCH STATE ----------------
  const [ordPartyId, setOrdPartyId] = useState(() => parties.find((p) => p.partyType === 'customer')?.id || parties[0]?.id || '');
  const [ordProductId, setOrdProductId] = useState(() => products[0]?.id || '');
  const [ordCartons, setOrdCartons] = useState(30);
  const [ordWeightKg, setOrdWeightKg] = useState(900);
  const [ordUnitPrice, setOrdUnitPrice] = useState(() => products[0]?.sellPrice || 2_250_000);
  const [ordNotes, setOrdNotes] = useState('');

  const [dispDate, setDispDate] = useState(() => getTodayShamsi());
  const [dispDriver, setDispDriver] = useState('حسین رضایی');
  const [dispPlate, setDispPlate] = useState('۴۴ ع ۵۸۲ ایران ۶۴');
  const [dispItems, setDispItems] = useState<SalesOrder['items']>([]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const party = parties.find((p) => p.id === ordPartyId);
    const prod = products.find((p) => p.id === ordProductId);
    if (!party || !prod) return;
    await addSalesOrder({
      orderNumber: `ORD-${profile.fiscalYear}-${101 + salesOrders.length}`,
      date: getTodayShamsi(),
      partyId: party.id,
      partyName: party.name,
      warehouse: prod.warehouse || 'انبار مرکزی شادآباد',
      status: 'ordered',
      items: [
        {
          productId: prod.id,
          sku: prod.sku,
          productName: prod.name,
          lotNumber: prod.lotNumber,
          orderedWeightKg: Number(ordWeightKg) || 0,
          orderedCartons: Number(ordCartons) || 0,
          actualWeighedKg: Number(ordWeightKg) || 0,
          actualCartons: Number(ordCartons) || 0,
          unitPriceIrr: Math.round(Number(ordUnitPrice) || prod.sellPrice),
        },
      ],
      notes: ordNotes.trim() || undefined,
    });
    setShowOrderModal(false);
    setOrdNotes('');
  };

  // ---------------- DYEING / WEAVING SUBCONTRACT STATE ----------------
  const [subContractorId, setSubContractorId] = useState(() => parties.find((p) => p.partyType !== 'customer')?.id || parties[0]?.id || '');
  const [subProcess, setSubProcess] = useState<'dyeing' | 'weaving' | 'twisting'>('dyeing');
  const [subRawProductId, setSubRawProductId] = useState(() => products[0]?.id || '');
  const [subSentKg, setSubSentKg] = useState(500);
  const [subLossPct, setSubLossPct] = useState(2.5);
  const [subFeePerKg, setSubFeePerKg] = useState(320_000);
  const [subFinishedName, setSubFinishedName] = useState('نخ پلی‌استر DTY 150/48 رنگ‌شده مشکی جت');
  const [subFinishedLot, setSubFinishedLot] = useState('DYE-BLK-510');

  const [compReturnedKg, setCompReturnedKg] = useState(780);
  const [compDate, setCompDate] = useState(() => getTodayShamsi());
  const [compLot, setCompLot] = useState('');
  const [compIncludeVat, setCompIncludeVat] = useState(false);

  const handleCreateSubcontract = async (e: React.FormEvent) => {
    e.preventDefault();
    const contractor = parties.find((p) => p.id === subContractorId);
    const rawProd = products.find((p) => p.id === subRawProductId);
    if (!contractor || !rawProd) return;
    const expectedReturned = Number((subSentKg * (1 - subLossPct / 100)).toFixed(2));
    const totalFee = Math.round(expectedReturned * subFeePerKg);
    const estUnitCost =
      expectedReturned > 0
        ? Math.round((subSentKg * rawProd.buyPrice + totalFee) / expectedReturned)
        : rawProd.buyPrice;

    await addSubcontractJob({
      jobNumber: `SUB-${profile.fiscalYear}-${String(subcontractJobs.length + 1).padStart(2, '0')}`,
      date: getTodayShamsi(),
      contractorPartyId: contractor.id,
      contractorName: contractor.name,
      processType: subProcess,
      rawProductId: rawProd.id,
      rawProductName: rawProd.name,
      sentWeightKg: subSentKg,
      rawUnitCostIrr: rawProd.buyPrice,
      expectedLossPct: subLossPct,
      returnedWeightKg: expectedReturned,
      finishedProductId: rawProd.id,
      finishedProductName: subFinishedName.trim() || `${rawProd.name} (تکمیل‌شده)`,
      finishedLotNumber: subFinishedLot.trim() || `LOT-${Date.now().toString().slice(-4)}`,
      serviceFeePerKgIrr: subFeePerKg,
      totalServiceFeeIrr: totalFee,
      finishedUnitCostIrr: estUnitCost,
      status: 'sent',
    });
    setShowSubModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            بازرگانی واردات نخ، حواله باسکول و پیمانکاری رنگرزی
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            سرشکن بهای تمام‌شده ترخیص (Landed Cost) · چرخه سفارش ← باسکول ← فاکتور · بارکد کارتن و لات · کارمزدی رنگرزی
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'imports' && (
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>پرونده واردات جدید</span>
            </button>
          )}
          {tab === 'orders' && (
            <button
              type="button"
              onClick={() => setShowOrderModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت سفارش مشتری جدید</span>
            </button>
          )}
          {tab === 'subcontract' && (
            <button
              type="button"
              onClick={() => setShowSubModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>ارسال نخ به رنگرزی/بافندگی</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setTab('imports')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            tab === 'imports'
              ? 'bg-white dark:bg-slate-800 text-teal-800 dark:text-teal-300 shadow-sm font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Ship className="w-3.5 h-3.5" />
          <span>پرونده واردات و ترخیص ({toPersianDigits(importDossiers.length)})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('orders')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            tab === 'orders'
              ? 'bg-white dark:bg-slate-800 text-teal-800 dark:text-teal-300 shadow-sm font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>سفارش، حواله باسکول و بارکد ({toPersianDigits(salesOrders.length)})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('subcontract')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            tab === 'subcontract'
              ? 'bg-white dark:bg-slate-800 text-teal-800 dark:text-teal-300 shadow-sm font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Factory className="w-3.5 h-3.5" />
          <span>پیمانکاری رنگرزی و بافندگی ({toPersianDigits(subcontractJobs.length)})</span>
        </button>
      </div>

      {/* TAB 1: IMPORT DOSSIERS & LANDED COST */}
      {tab === 'imports' && (
        <div className="space-y-4">
          {importDossiers.map((dos) => (
            <div
              key={dos.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                    <span className="font-code">{dos.dossierNumber}</span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span>پروفرما {dos.proformaNumber}</span>
                    {dos.cotageNumber && (
                      <>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="font-code text-xs text-slate-500">کوتاژ: {toPersianDigits(dos.cotageNumber)}</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                    <span>{dos.supplierName}</span>
                    <span aria-hidden="true">·</span>
                    <span>مبدأ: {dos.originCountry}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-code tabular-nums">
                      ارز: {dos.currencyCode} (نرخ {formatMoney(dos.exchangeRate, unit)})
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      روش سرشکن: {dos.allocationMethod === 'weight' ? 'بر اساس وزن (کیلوگرم)' : 'بر اساس ارزش ارزی'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-xs font-semibold ${
                      dos.status === 'cleared'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {dos.status === 'cleared' ? 'ترخیص و وارد انبار شده' : 'در حال ترخیص گمرکی'}
                  </span>
                  {dos.status !== 'cleared' && (
                    <button
                      type="button"
                      onClick={() => clearImportDossier(dos.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ترخیص، ورود به انبار و صدور سند بهای تمام‌شده</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="p-5 grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Allocated Items */}
                <div className="xl:col-span-8 overflow-x-auto">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    اقلام نخ وارداتی و بهای تمام‌شده هر کیلوگرم پس از سرشکن
                  </div>
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2 px-2">شرح نخ و لات</th>
                        <th className="py-2 px-2">وزن / کارتن</th>
                        <th className="py-2 px-2">نرخ ارزی ({dos.currencyCode})</th>
                        <th className="py-2 px-2">سهم هزینه‌های ترخیص</th>
                        <th className="py-2 px-2 text-left">بهای تمام‌شده هر کیلو</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {dos.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-2.5 px-2">
                            <div className="font-medium text-slate-900 dark:text-white">{it.productName}</div>
                            <div className="text-[11px] text-slate-500 font-code">
                              {it.sku} · لات {it.lotNumber}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 font-code tabular-nums">
                            {formatWeight(it.weightKg)} کیلو · {toPersianDigits(it.cartonCount)} کارتن
                          </td>
                          <td className="py-2.5 px-2 font-code tabular-nums">
                            {toPersianDigits(it.foreignUnitPrice.toFixed(2))} (جمع {toPersianDigits(it.foreignTotal.toLocaleString('en-US'))})
                          </td>
                          <td className="py-2.5 px-2 font-code tabular-nums text-amber-700 dark:text-amber-400">
                            +{formatMoney(it.allocatedLandedCostIrr, unit)}
                          </td>
                          <td className="py-2.5 px-2 text-left font-code tabular-nums font-bold text-teal-800 dark:text-teal-300">
                            {formatMoney(it.finalUnitCostIrr, unit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Landed Cost Breakdown */}
                <div className="xl:col-span-4 border-t xl:border-t-0 xl:border-r border-slate-100 dark:border-slate-800 pt-4 xl:pt-0 xl:pr-5 space-y-2 text-xs">
                  <div className="font-semibold text-slate-600 dark:text-slate-300">
                    ریز هزینه‌های گمرکی و جانبی محموله
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="py-1.5 flex items-center justify-between">
                      <span className="text-slate-500">ارزش ارزی محموله (FOB/CIF)</span>
                      <span className="font-code tabular-nums font-semibold text-slate-900 dark:text-white">
                        {formatMoney(dos.totalFobIrr, unit)}
                      </span>
                    </div>
                    {dos.costs.map((c) => (
                      <div key={c.id} className="py-1.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-slate-600 dark:text-slate-400 truncate">
                            {c.title}
                            {c.isRecoverableVat && (
                              <span className="text-[10px] text-indigo-700 dark:text-indigo-400 mr-1.5 font-semibold">
                                (اعتبار ۳۰۳۰۲)
                              </span>
                            )}
                          </div>
                          {c.partyName && (
                            <div className="text-[10.5px] text-slate-400 truncate">
                              طرف‌حساب: {c.partyName}
                            </div>
                          )}
                        </div>
                        <span className="font-code tabular-nums text-slate-800 dark:text-slate-200 shrink-0">
                          {formatMoney(c.amountIrr, unit)}
                        </span>
                      </div>
                    ))}
                    {(dos.totalRecoverableVatIrr ?? 0) > 0 && (
                      <div className="py-1.5 flex items-center justify-between text-indigo-700 dark:text-indigo-400">
                        <span>مالیات قابل کسر گمرکی (معین ۳۰۳۰۲)</span>
                        <span className="font-code tabular-nums font-semibold">
                          {formatMoney(dos.totalRecoverableVatIrr ?? 0, unit)}
                        </span>
                      </div>
                    )}
                    <div className="pt-2.5 flex items-center justify-between font-bold text-slate-900 dark:text-white">
                      <span>بهای تمام‌شده نهایی محموله (انبار ۱۰۵۰۱)</span>
                      <span className="font-code tabular-nums text-teal-700 dark:text-teal-400">
                        {formatMoney(dos.grandTotalLandedIrr, unit)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: SALES ORDERS, WEIGHBRIDGE DISPATCH & CARTON BARCODES */}
      {tab === 'orders' && (
        <div className="space-y-4">
          {salesOrders.map((ord) => {
            const totalOrdered = ord.items.reduce((s, i) => s + i.orderedWeightKg, 0);
            const totalWeighed = ord.items.reduce((s, i) => s + i.actualWeighedKg, 0);
            const scaleDiff = Number((totalWeighed - totalOrdered).toFixed(2));
            return (
              <div
                key={ord.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <span className="font-code">{ord.orderNumber}</span>
                      {ord.dispatchNumber && (
                        <>
                          <span className="text-slate-300" aria-hidden="true">←</span>
                          <span className="font-code text-teal-700 dark:text-teal-400">حواله {ord.dispatchNumber}</span>
                        </>
                      )}
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span>{ord.partyName}</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                      <span>انبار: {ord.warehouse}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-code tabular-nums">تاریخ سفارش: {toPersianDigits(ord.date)}</span>
                      {ord.driverName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>راننده: {ord.driverName} ({ord.plateNumber})</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-semibold ${
                          ord.status === 'invoiced'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : ord.status === 'dispatched'
                              ? 'text-teal-700 dark:text-teal-400'
                              : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {ord.status === 'invoiced'
                          ? 'تبدیل‌شده به فاکتور فروش نهایی'
                          : ord.status === 'dispatched'
                            ? 'توزین‌شده روی باسکول (آماده فاکتور)'
                            : 'در انتظار توزین و حواله خروج انبار'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setBarcodeOrder(ord)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>چاپ برچسب بارکد کارتن/لات</span>
                    </button>
                    {ord.status === 'ordered' && (
                      <button
                        type="button"
                        onClick={() => {
                          setDispatchingOrder(ord);
                          setDispItems(ord.items.map((i) => ({ ...i })));
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span>ثبت وزن باسکول و حواله خروج</span>
                      </button>
                    )}
                    {ord.status !== 'invoiced' && (
                      <button
                        type="button"
                        onClick={() => invoiceSalesOrder(ord.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        <span>تبدیل به فاکتور فروش نهایی</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2 px-2">شرح نخ و لات</th>
                        <th className="py-2 px-2">وزن و کارتن سفارشی</th>
                        <th className="py-2 px-2">وزن واقعی باسکول</th>
                        <th className="py-2 px-2">اختلاف باسکول</th>
                        <th className="py-2 px-2 text-left">مبلغ نهایی بر اساس باسکول</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {ord.items.map((it, i) => (
                        <tr key={i}>
                          <td className="py-2.5 px-2">
                            <span className="font-medium text-slate-900 dark:text-white">{it.productName}</span>
                            {it.lotNumber && (
                              <span className="text-slate-400 font-code mr-2">لات {it.lotNumber}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 font-code tabular-nums">
                            {formatWeight(it.orderedWeightKg)} کیلو · {toPersianDigits(it.orderedCartons)} کارتن
                          </td>
                          <td className="py-2.5 px-2 font-code tabular-nums font-bold text-slate-900 dark:text-white">
                            {formatWeight(it.actualWeighedKg)} کیلو · {toPersianDigits(it.actualCartons)} کارتن
                          </td>
                          <td
                            className={`py-2.5 px-2 font-code tabular-nums font-semibold ${
                              scaleDiff === 0
                                ? 'text-slate-500'
                                : scaleDiff > 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {scaleDiff > 0 ? '+' : ''}
                            {formatWeight(scaleDiff)} کیلو
                          </td>
                          <td className="py-2.5 px-2 text-left font-code tabular-nums font-bold text-teal-800 dark:text-teal-300">
                            {formatMoney(Math.round(it.actualWeighedKg * it.unitPriceIrr), unit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: DYEING / WEAVING SUBCONTRACTING */}
      {tab === 'subcontract' && (
        <div className="space-y-4">
          {subcontractJobs.map((job) => {
            const actualLossKg = Number((job.sentWeightKg - job.returnedWeightKg).toFixed(2));
            const actualLossPct =
              job.sentWeightKg > 0 ? Number(((actualLossKg / job.sentWeightKg) * 100).toFixed(2)) : 0;
            return (
              <div
                key={job.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <span className="font-code">{job.jobNumber}</span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span>
                        {job.processType === 'dyeing'
                          ? 'پیمانکاری رنگرزی نخ'
                          : job.processType === 'weaving'
                            ? 'پیمانکاری بافندگی'
                            : 'پیمانکاری دولاتابی و تکمیل'}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span>{job.contractorName}</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                      <span>نخ خام ارسالی: {job.rawProductName} ({formatWeight(job.sentWeightKg)} کیلو)</span>
                      <span aria-hidden="true">←</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        محصول نهایی: {job.finishedProductName} (لات {job.finishedLotNumber})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xs font-semibold ${
                        job.status === 'completed'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {job.status === 'completed' ? 'تکمیل و وارد انبار شده' : 'در حال عملیات نزد کارگاه'}
                    </span>
                    {job.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => {
                          setCompletingSub(job);
                          setCompReturnedKg(job.returnedWeightKg);
                          setCompLot(job.finishedLotNumber);
                          setCompDate(getTodayShamsi());
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>دریافت محصول نهایی و صدور سند کارمزد</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <div className="text-slate-500">وزن برگشتی / افت واقعی</div>
                    <div className="font-code tabular-nums font-bold text-slate-900 dark:text-white mt-1">
                      {formatWeight(job.returnedWeightKg)} کیلو ({toPersianDigits(actualLossPct)}٪ افت)
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">اجرت کارمزد هر کیلو</div>
                    <div className="font-code tabular-nums font-semibold text-slate-900 dark:text-white mt-1">
                      {formatMoney(job.serviceFeePerKgIrr, unit)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">جمع اجرت پیمانکار</div>
                    <div className="font-code tabular-nums font-semibold text-amber-700 dark:text-amber-400 mt-1">
                      {formatMoney(job.totalServiceFeeIrr, unit)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">بهای تمام‌شده هر کیلو نهایی</div>
                    <div className="font-code tabular-nums font-bold text-teal-800 dark:text-teal-300 mt-1">
                      {formatMoney(job.finishedUnitCostIrr, unit)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* HOLOO MODAL: NEW IMPORT DOSSIER */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveImportDossier}
            className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto"
          >
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="text-sm font-bold">پنجره ثبت پرونده واردات و سرشکن بهای تمام‌شده نخ</div>
              <button type="button" onClick={() => setShowImportModal(false)} className="p-1 hover:bg-slate-800 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">شماره پرونده واردات</label>
                  <input value={impNumber} onChange={(e) => setImpNumber(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code" required />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">شماره پروفرما (PI)</label>
                  <input value={impProforma} onChange={(e) => setImpProforma(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code" required />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">شماره کوتاژ گمرکی</label>
                  <input value={impCotage} onChange={(e) => setImpCotage(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">تأمین‌کننده / شرکت واردکننده</label>
                  <select value={impSupplierId} onChange={(e) => setImpSupplierId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">ارز و نرخ برابری (ریال)</label>
                  <div className="flex gap-2">
                    <select
                      value={impCurrency}
                      onChange={(e) => {
                        const c = e.target.value;
                        setImpCurrency(c);
                        setImpRate(getEffectiveExchangeRate(c, impDate, exchangeRates, currencies).rateToIrr);
                      }}
                      className="w-24 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code"
                    >
                      {foreignCurrencies.map((c) => (
                        <option key={c.id} value={c.code}>{c.code}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={impRate}
                      onChange={(e) => setImpRate(Number(e.target.value) || 0)}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">مبنای سرشکن هزینه‌های گمرک و حمل</label>
                  <select value={impMethod} onChange={(e) => setImpMethod(e.target.value as ImportCostAllocationMethod)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                    <option value="weight">بر اساس وزن خالص (کیلوگرم)</option>
                    <option value="value">بر اساس ارزش ارزی اقلام (FOB/CIF)</option>
                  </select>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-100">اقلام نخ محموله</span>
                  <button
                    type="button"
                    onClick={() =>
                      setImpItems((prev) => [
                        ...prev,
                        { productId: products[0]?.id || '', lotNumber: 'NEW-LOT', weightKg: 1000, cartonCount: 40, foreignUnitPrice: 1.6 },
                      ])
                    }
                    className="text-teal-700 dark:text-teal-400 font-semibold hover:underline"
                  >
                    + افزودن ردیف نخ
                  </button>
                </div>
                {impItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <select
                      value={it.productId}
                      onChange={(e) => setImpItems((p) => p.map((x, i) => (i === idx ? { ...x, productId: e.target.value } : x)))}
                      className="col-span-4 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    >
                      {products.map((pr) => (
                        <option key={pr.id} value={pr.id}>{pr.name}</option>
                      ))}
                    </select>
                    <input
                      value={it.lotNumber}
                      onChange={(e) => setImpItems((p) => p.map((x, i) => (i === idx ? { ...x, lotNumber: e.target.value } : x)))}
                      placeholder="شماره لات"
                      className="col-span-2 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code"
                    />
                    <input
                      type="number"
                      value={it.weightKg}
                      onChange={(e) => setImpItems((p) => p.map((x, i) => (i === idx ? { ...x, weightKg: Number(e.target.value) } : x)))}
                      placeholder="وزن kg"
                      className="col-span-2 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={it.foreignUnitPrice}
                      onChange={(e) => setImpItems((p) => p.map((x, i) => (i === idx ? { ...x, foreignUnitPrice: Number(e.target.value) } : x)))}
                      placeholder={`نرخ ${impCurrency}`}
                      className="col-span-2 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code"
                    />
                    <div className="col-span-1 font-code text-[11px] text-teal-700 dark:text-teal-400">
                      {formatMoney(liveImportPreview.computedItems[idx]?.finalUnitCostIrr || 0, unit, false)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setImpItems((p) => p.filter((_, i) => i !== idx))}
                      className="col-span-1 p-1 text-rose-600 hover:bg-rose-50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Landed Costs */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-100">هزینه‌های جانبی ترخیص (ریال)</span>
                  <button
                    type="button"
                    onClick={() =>
                      setImpCosts((prev) => [
                        ...prev,
                        { id: `c_${Date.now()}`, title: 'هزینه حمل داخلی و تخلیه', amountIrr: 100_000_000, accountCode: '10201' },
                      ])
                    }
                    className="text-teal-700 dark:text-teal-400 font-semibold hover:underline"
                  >
                    + افزودن هزینه جانبی
                  </button>
                </div>
                {impCosts.map((c, idx) => (
                  <div
                    key={c.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2"
                  >
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input
                        value={c.title}
                        onChange={(e) =>
                          setImpCosts((p) =>
                            p.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                          )
                        }
                        placeholder="شرح هزینه (حمل، بیمه، حقوق گمرکی، ارزش افزوده گمرک...)"
                        className="col-span-5 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <input
                        type="number"
                        value={c.amountIrr}
                        onChange={(e) =>
                          setImpCosts((p) =>
                            p.map((x, i) =>
                              i === idx ? { ...x, amountIrr: Number(e.target.value) } : x
                            )
                          )
                        }
                        className="col-span-3 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-code"
                      />
                      <select
                        value={c.accountCode}
                        onChange={(e) =>
                          setImpCosts((p) =>
                            p.map((x, i) =>
                              i === idx ? { ...x, accountCode: e.target.value } : x
                            )
                          )
                        }
                        className="col-span-3 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        {accounts
                          .filter(
                            (a) =>
                              a.code.startsWith('101') ||
                              a.code.startsWith('102') ||
                              a.code === '30101'
                          )
                          .map((a) => (
                            <option key={a.id} value={a.code}>
                              {a.code} — {a.title}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setImpCosts((p) => p.filter((_, i) => i !== idx))}
                        className="col-span-1 p-1 text-rose-600 hover:bg-rose-50 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <label className="inline-flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!c.isRecoverableVat}
                          onChange={(e) =>
                            setImpCosts((p) =>
                              p.map((x, i) =>
                                i === idx ? { ...x, isRecoverableVat: e.target.checked } : x
                              )
                            )
                          }
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <span>
                          مالیات ارزش افزوده قابل کسر گمرکی (ثبت در معین ۳۰۳۰۲ به‌جای بهای تمام‌شده کالا)
                        </span>
                      </label>
                      {c.accountCode === '30101' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500">ترخیص‌کار / شرکت حمل:</span>
                          <select
                            value={c.partyId || ''}
                            onChange={(e) => {
                              const chosen = parties.find((pt) => pt.id === e.target.value);
                              setImpCosts((p) =>
                                p.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        partyId: chosen?.id,
                                        partyName: chosen?.name,
                                      }
                                    : x
                                )
                              );
                            }}
                            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                          >
                            <option value="">تأمین‌کننده اصلی پرونده</option>
                            {parties.map((pt) => (
                              <option key={pt.id} value={pt.id}>
                                {pt.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <span>
                  ارزش ارزی:{' '}
                  <strong className="font-code">
                    {toPersianDigits(liveImportPreview.totalForeignAmount.toLocaleString('en-US'))}{' '}
                    {impCurrency}
                  </strong>
                </span>
                <span>
                  هزینه‌های سرشکن‌شونده:{' '}
                  <strong className="font-code">
                    {formatMoney(liveImportPreview.totalLandedCostsIrr, unit)}
                  </strong>
                </span>
                {liveImportPreview.totalRecoverableVatIrr > 0 && (
                  <span className="text-indigo-700 dark:text-indigo-400">
                    اعتبار ارزش افزوده (۳۰۳۰۲):{' '}
                    <strong className="font-code">
                      {formatMoney(liveImportPreview.totalRecoverableVatIrr, unit)}
                    </strong>
                  </span>
                )}
                <span>
                  بهای تمام‌شده کل (۱۰۵۰۱):{' '}
                  <strong className="font-code text-teal-700 dark:text-teal-400">
                    {formatMoney(liveImportPreview.grandTotalLandedIrr, unit)}
                  </strong>
                </span>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowImportModal(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">انصراف</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg">ذخیره پرونده واردات</button>
            </div>
          </form>
        </div>
      )}

      {/* HOLOO MODAL: NEW SALES ORDER */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={handleCreateOrder} className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="text-sm font-bold">پنجره ثبت سفارش فروش (پیش از باسکول و حواله خروج)</div>
              <button type="button" onClick={() => setShowOrderModal(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-slate-500 mb-1">مشتری</label>
                <select value={ordPartyId} onChange={(e) => setOrdPartyId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                  {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">نخ درخواستی</label>
                <select
                  value={ordProductId}
                  onChange={(e) => {
                    setOrdProductId(e.target.value);
                    const pr = products.find((x) => x.id === e.target.value);
                    if (pr) setOrdUnitPrice(pr.sellPrice);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  {products.map((pr) => <option key={pr.id} value={pr.id}>{pr.name} (موجودی: {formatWeight(pr.stock)} کیلو)</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">تعداد کارتن</label>
                  <input type="number" value={ordCartons} onChange={(e) => setOrdCartons(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">وزن تقریبی (کیلوگرم)</label>
                  <input type="number" step="0.1" value={ordWeightKg} onChange={(e) => setOrdWeightKg(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">نرخ توافقی (ریال/کیلو)</label>
                  <input type="number" value={ordUnitPrice} onChange={(e) => setOrdUnitPrice(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code" />
                </div>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">توضیحات ارسال به انبار</label>
                <input value={ordNotes} onChange={(e) => setOrdNotes(e.target.value)} placeholder="مثلاً: تحویل درب انبار شادآباد با باسکول رسمی" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950" />
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button type="button" onClick={() => setShowOrderModal(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700">انصراف</button>
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-teal-700 rounded-lg">ثبت سفارش</button>
            </div>
          </form>
        </div>
      )}

      {/* HOLOO MODAL: WEIGHBRIDGE DISPATCH */}
      {dispatchingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="text-sm font-bold">پنجره توزین باسکول و صدور حواله خروج ({dispatchingOrder.orderNumber})</div>
              <button type="button" onClick={() => setDispatchingOrder(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">تاریخ خروج</label>
                  <input value={dispDate} onChange={(e) => setDispDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">نام راننده</label>
                  <input value={dispDriver} onChange={(e) => setDispDriver(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">پلاک خودرو</label>
                  <input value={dispPlate} onChange={(e) => setDispPlate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950" />
                </div>
              </div>
              {dispItems.map((it, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-semibold text-slate-900 dark:text-white">{it.productName}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 mb-1">وزن واقعی باسکول (کیلوگرم)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={it.actualWeighedKg}
                        onChange={(e) =>
                          setDispItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, actualWeighedKg: Number(e.target.value) } : x))
                          )
                        }
                        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-code font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-1">تعداد کارتن بارگیری‌شده</label>
                      <input
                        type="number"
                        value={it.actualCartons}
                        onChange={(e) =>
                          setDispItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, actualCartons: Number(e.target.value) } : x))
                          )
                        }
                        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-code"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button type="button" onClick={() => setDispatchingOrder(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700">انصراف</button>
              <button
                type="button"
                onClick={async () => {
                  await dispatchSalesOrder(dispatchingOrder.id, {
                    dispatchDate: dispDate,
                    driverName: dispDriver,
                    plateNumber: dispPlate,
                    items: dispItems,
                  });
                  setDispatchingOrder(null);
                }}
                className="px-4 py-2 font-semibold text-white bg-teal-700 rounded-lg"
              >
                تایید باسکول و صدور حواله خروج
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE BARCODE LABEL MODAL */}
      {barcodeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between no-print">
              <div className="text-sm font-bold">برچسب بارکد کارتن و شماره لات نخ ({barcodeOrder.orderNumber})</div>
              <button type="button" onClick={() => setBarcodeOrder(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              {barcodeOrder.items.map((it, idx) => (
                <div key={idx} className="p-4 border-2 border-slate-900 rounded-lg bg-white text-slate-900 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                    <span className="font-bold text-xs">{profile.companyName}</span>
                    <span className="font-code text-xs font-bold">{barcodeOrder.dispatchNumber || barcodeOrder.orderNumber}</span>
                  </div>
                  <div className="text-sm font-extrabold">{it.productName}</div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-code tabular-nums">
                    <div>لات: <strong>{it.lotNumber || 'STD-01'}</strong></div>
                    <div>کارتن: <strong>{toPersianDigits(it.actualCartons || it.orderedCartons)}</strong></div>
                    <div>وزن خالص: <strong>{formatWeight(it.actualWeighedKg || it.orderedWeightKg)} kg</strong></div>
                  </div>
                  <div className="pt-1">
                    <CartonBarcodeSvg value={`${it.sku}-${it.lotNumber || 'LOT'}-${barcodeOrder.orderNumber}`} />
                    <div className="text-center font-code text-[11px] tracking-widest mt-1">
                      {it.sku}-{it.lotNumber || 'LOT'}-{barcodeOrder.orderNumber}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 no-print">
              <button type="button" onClick={() => setBarcodeOrder(null)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">بستن</button>
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg">
                <Printer className="w-3.5 h-3.5" />
                <span>چاپ برچسب</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HOLOO MODAL: NEW SUBCONTRACT JOB */}
      {showSubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={handleCreateSubcontract} className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="text-sm font-bold">پنجره ارسال نخ به پیمانکار رنگرزی / بافندگی</div>
              <button type="button" onClick={() => setShowSubModal(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">کارگاه / پیمانکار</label>
                  <select value={subContractorId} onChange={(e) => setSubContractorId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                    {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">نوع عملیات پیمانکاری</label>
                  <select value={subProcess} onChange={(e) => setSubProcess(e.target.value as 'dyeing' | 'weaving' | 'twisting')} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                    <option value="dyeing">رنگرزی نخ (تکمیل رنگ)</option>
                    <option value="weaving">کارمزد بافندگی</option>
                    <option value="twisting">دولاتابی و بوبین‌پیچی</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">نخ خام ارسالی از انبار</label>
                <select value={subRawProductId} onChange={(e) => setSubRawProductId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} (موجودی: {formatWeight(p.stock)} kg)</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">وزن ارسالی (kg)</label>
                  <input type="number" step="0.1" value={subSentKg} onChange={(e) => setSubSentKg(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">افت مجاز (٪)</label>
                  <input type="number" step="0.1" value={subLossPct} onChange={(e) => setSubLossPct(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">اجرت هر کیلو (ریال)</label>
                  <input type="number" value={subFeePerKg} onChange={(e) => setSubFeePerKg(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-500 mb-1">نام محصول نهایی رنگ‌شده/تکمیل‌شده</label>
                  <input value={subFinishedName} onChange={(e) => setSubFinishedName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">شماره لات جدید</label>
                  <input value={subFinishedLot} onChange={(e) => setSubFinishedLot(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code" />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button type="button" onClick={() => setShowSubModal(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700">انصراف</button>
              <button type="submit" className="px-4 py-2 font-semibold text-white bg-teal-700 rounded-lg">ثبت حواله پیمانکاری</button>
            </div>
          </form>
        </div>
      )}

      {/* HOLOO MODAL: COMPLETE SUBCONTRACT */}
      {completingSub && (() => {
        const normalLossKg = Number(
          (completingSub.sentWeightKg * (completingSub.expectedLossPct / 100)).toFixed(2)
        );
        const actualLossKg = Math.max(
          0,
          Number((completingSub.sentWeightKg - compReturnedKg).toFixed(2))
        );
        const abnormalLossKg = Math.max(0, Number((actualLossKg - normalLossKg).toFixed(2)));
        const abnormalCostIrr = Math.round(abnormalLossKg * completingSub.rawUnitCostIrr);
        const serviceFeeIrr = Math.round(compReturnedKg * completingSub.serviceFeePerKgIrr);
        const serviceVatIrr = compIncludeVat ? Math.round(serviceFeeIrr * 0.1) : 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
              <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
                <div className="text-sm font-bold">
                  دریافت محصول تکمیل‌شده ({completingSub.jobNumber})
                </div>
                <button type="button" onClick={() => setCompletingSub(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="block text-slate-500 mb-1">
                    وزن واقعی برگشتی از کارگاه (کیلوگرم) — ارسالی:{' '}
                    <span className="font-code">{formatWeight(completingSub.sentWeightKg)}</span> کیلو
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={compReturnedKg}
                    onChange={(e) => setCompReturnedKg(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code font-bold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">تاریخ ورود به انبار</label>
                    <input
                      value={compDate}
                      onChange={(e) => setCompDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">شماره لات رنگ نهایی</label>
                    <input
                      value={compLot}
                      onChange={(e) => setCompLot(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-code"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={compIncludeVat}
                    onChange={(e) => setCompIncludeVat(e.target.checked)}
                    className="rounded border-slate-300 text-teal-700"
                  />
                  <span className="text-slate-700 dark:text-slate-200">
                    شمول ۱۰٪ مالیات ارزش افزوده روی اجرت پیمانکاری (ثبت اعتبار در معین ۳۰۳۰۲)
                  </span>
                </label>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">افت مجاز ({toPersianDigits(completingSub.expectedLossPct)}٪):</span>
                    <span className="font-code tabular-nums">{formatWeight(normalLossKg)} کیلوگرم</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">افت واقعی:</span>
                    <span className="font-code tabular-nums">{formatWeight(actualLossKg)} کیلوگرم</span>
                  </div>
                  {abnormalLossKg > 0 && (
                    <div className="flex justify-between text-rose-700 dark:text-rose-400 font-semibold">
                      <span>افت غیرعادی (سند هزینه ضایعات ۸۰۴۰۱):</span>
                      <span className="font-code tabular-nums">
                        {formatWeight(abnormalLossKg)} کیلو ({formatMoney(abnormalCostIrr, unit)})
                      </span>
                    </div>
                  )}
                  {serviceVatIrr > 0 && (
                    <div className="flex justify-between text-indigo-700 dark:text-indigo-400 font-semibold">
                      <span>۱۰٪ ارزش افزوده اجرت (معین ۳۰۳۰۲):</span>
                      <span className="font-code tabular-nums">{formatMoney(serviceVatIrr, unit)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCompletingSub(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await completeSubcontractJob(completingSub.id, {
                      returnedWeightKg: compReturnedKg,
                      completionDate: compDate,
                      finishedLotNumber: compLot,
                      includeServiceVat: compIncludeVat,
                    });
                    setCompletingSub(null);
                    setCompIncludeVat(false);
                  }}
                  className="px-4 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  ثبت ورود محصول و سند کارمزد
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
