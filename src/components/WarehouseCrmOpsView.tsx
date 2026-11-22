import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Factory,
  Layers,
  Loader2,
  MessageCircle,
  Percent,
  Play,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { useWorkspaceExtensions } from '../context/WorkspaceExtensionsContext';
import {
  BomFormula,
  buildInstallmentSchedule,
  buildSmsUrl,
  buildWhatsAppUrl,
  InstallmentPlan,
  SLIP_TYPE_LABELS,
  VolumeDiscountRule,
  WarehouseSlip,
  WarehouseSlipType,
  YarnDyeLot,
} from '../lib/apexExtensions';
import {
  formatCompactMoney,
  formatMoney,
  formatNumber,
  generateSafeId,
  getTodayShamsi,
  toPersianDigits,
} from '../lib/format';
import { VoucherLine } from '../types/accounting';

type WarehouseCrmTab = 'dye-lots' | 'slips' | 'bom' | 'installments';

export const WarehouseCrmOpsView: React.FC<{
  initialIntent?: string;
  clearIntent?: () => void;
}> = ({ initialIntent, clearIntent }) => {
  const {
    profile,
    accounts,
    parties,
    products,
    invoices,
    adjustProductStock,
    updateProduct,
    createVoucher,
    showToast,
  } = useAccounting();

  const {
    dyeLots,
    warehouseSlips,
    bomFormulas,
    installmentPlans,
    volumeDiscountRules,
    updateExtensions,
  } = useWorkspaceExtensions();

  const unit = profile.currencyUnit;
  const displayFactor = unit === 'IRT' ? 10 : 1;
  const unitName = unit === 'IRT' ? 'تومان' : 'ریال';

  const [activeTab, setActiveTab] = useState<WarehouseCrmTab>('dye-lots');

  useEffect(() => {
    if (
      initialIntent === 'dye-lots' ||
      initialIntent === 'slips' ||
      initialIntent === 'bom' ||
      initialIntent === 'installments'
    ) {
      setActiveTab(initialIntent);
      clearIntent?.();
    }
  }, [initialIntent, clearIntent]);

  // ==================== TAB 1: DYE-LOT / BATCH TRACKING ====================
  const [lotProductId, setLotProductId] = useState(products[0]?.id || '');
  const [lotCode, setLotCode] = useState('');
  const [lotShade, setLotShade] = useState('RAW-WHITE');
  const [lotWeight, setLotWeight] = useState('');
  const [lotCartons, setLotCartons] = useState('');
  const [lotFilterProd, setLotFilterProd] = useState('all');

  const handleAddDyeLot = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find((p) => p.id === lotProductId);
    const kg = Number(lotWeight) || 0;
    if (!prod || !lotCode.trim() || kg <= 0) {
      showToast('کالا، شماره لات و وزن معتبر را وارد کنید.');
      return;
    }
    const newLot: YarnDyeLot = {
      id: generateSafeId('lot'),
      productId: prod.id,
      productSku: prod.sku,
      productName: prod.name,
      lotCode: lotCode.trim().toUpperCase(),
      shadeCode: lotShade.trim() || 'RAW',
      originCountry: prod.originCountry,
      warehouse: prod.warehouse,
      arrivalDate: getTodayShamsi(),
      initialWeightKg: kg,
      remainingWeightKg: kg,
      cartonCount:
        Number(lotCartons) ||
        (prod.kgPerCarton && prod.kgPerCarton > 0 ? Math.round(kg / prod.kgPerCarton) : 0),
    };
    updateExtensions((prev) => ({
      ...prev,
      dyeLots: [newLot, ...prev.dyeLots],
    }));
    setLotCode('');
    setLotWeight('');
    setLotCartons('');
    showToast(`لات «${newLot.lotCode}» با شید ${newLot.shadeCode} ثبت شد و در فرم فاکتور در دسترس است.`);
  };

  const filteredDyeLots = useMemo(
    () =>
      lotFilterProd === 'all'
        ? dyeLots
        : dyeLots.filter((l) => l.productId === lotFilterProd),
    [dyeLots, lotFilterProd]
  );

  // ==================== TAB 2: INDEPENDENT WAREHOUSE SLIPS & CONSIGNMENT ====================
  const [slipType, setSlipType] = useState<WarehouseSlipType>('receipt');
  const [slipPartyId, setSlipPartyId] = useState(parties[0]?.id || '');
  const [slipProductId, setSlipProductId] = useState(products[0]?.id || '');
  const [slipWeight, setSlipWeight] = useState('');
  const [slipCartons, setSlipCartons] = useState('');
  const [slipDriver, setSlipDriver] = useState('');
  const [slipPlate, setSlipPlate] = useState('');
  const [slipNotes, setSlipNotes] = useState('');
  const [confirmingSlipId, setConfirmingSlipId] = useState<string | null>(null);
  const [printingSlip, setPrintingSlip] = useState<WarehouseSlip | null>(null);

  const handleCreateWarehouseSlip = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find((p) => p.id === slipProductId);
    const party = parties.find((p) => p.id === slipPartyId);
    const kg = Number(slipWeight) || 0;
    if (!prod || kg <= 0) {
      showToast('کالا و وزن معتبر برای برگ انبار وارد کنید.');
      return;
    }
    const prefix =
      slipType === 'receipt'
        ? 'WR'
        : slipType === 'dispatch'
          ? 'WD'
          : slipType === 'consignment_out'
            ? 'CO'
            : 'CI';
    const slip: WarehouseSlip = {
      id: generateSafeId('slip'),
      slipNumber: `${prefix}-${profile.fiscalYear}-${String(warehouseSlips.length + 101)}`,
      slipType,
      date: getTodayShamsi(),
      warehouse: prod.warehouse,
      partyId: party?.id,
      partyName: party?.name || 'عملیات داخلی انبار',
      driverName: slipDriver.trim() || undefined,
      plateNumber: slipPlate.trim() || undefined,
      status: 'draft',
      items: [
        {
          productId: prod.id,
          sku: prod.sku,
          productName: prod.name,
          lotCode: prod.lotNumber,
          weightKg: kg,
          cartonCount:
            Number(slipCartons) ||
            (prod.kgPerCarton && prod.kgPerCarton > 0 ? Math.round(kg / prod.kgPerCarton) : 0),
        },
      ],
      notes: slipNotes.trim() || undefined,
    };
    updateExtensions((prev) => ({
      ...prev,
      warehouseSlips: [slip, ...prev.warehouseSlips],
    }));
    setSlipWeight('');
    setSlipCartons('');
    setSlipNotes('');
    showToast(`${SLIP_TYPE_LABELS[slipType].label} به شماره ${slip.slipNumber} ایجاد شد.`);
  };

  const handleConfirmWarehouseSlip = async (slip: WarehouseSlip) => {
    if (slip.status === 'confirmed') return;
    setConfirmingSlipId(slip.id);
    try {
      const sign = SLIP_TYPE_LABELS[slip.slipType].sign;
      for (const item of slip.items) {
        const prod = products.find((p) => p.id === item.productId);
        if (prod) {
          const nextStock = Math.max(0, Math.round((prod.stock + sign * item.weightKg) * 100) / 100);
          await adjustProductStock(prod.id, nextStock);
        }
      }
      updateExtensions((prev) => ({
        ...prev,
        warehouseSlips: prev.warehouseSlips.map((s) =>
          s.id === slip.id ? { ...s, status: 'confirmed' } : s
        ),
      }));
      showToast(`برگ انبار ${slip.slipNumber} تایید شد و موجودی انبار به‌روزرسانی گردید.`);
    } finally {
      setConfirmingSlipId(null);
    }
  };

  // ==================== TAB 3: BOM PRODUCTION FORMULAS ====================
  const [bomTitle, setBomTitle] = useState('');
  const [bomFinishedId, setBomFinishedId] = useState(products[0]?.id || '');
  const [bomRawId, setBomRawId] = useState(products[1]?.id || products[0]?.id || '');
  const [bomRatio, setBomRatio] = useState('1.04');
  const [bomWastePct, setBomWastePct] = useState('4');
  const [bomLaborDisplay, setBomLaborDisplay] = useState('45000');
  const [runQtyByBom, setRunQtyByBom] = useState<Record<string, string>>({});
  const [runningBomId, setRunningBomId] = useState<string | null>(null);

  const handleCreateBom = (e: React.FormEvent) => {
    e.preventDefault();
    const fin = products.find((p) => p.id === bomFinishedId);
    const raw = products.find((p) => p.id === bomRawId);
    if (!bomTitle.trim() || !fin || !raw) {
      showToast('عنوان فرمول، محصول نهایی و ماده اولیه را مشخص کنید.');
      return;
    }
    const formula: BomFormula = {
      id: generateSafeId('bom'),
      code: `BOM-${String(bomFormulas.length + 101)}`,
      title: bomTitle.trim(),
      finishedProductId: fin.id,
      finishedProductName: fin.name,
      wastePct: Math.max(0, Math.min(50, Number(bomWastePct) || 0)),
      laborOverheadPerKgIrr: Math.max(0, Math.round((Number(bomLaborDisplay) || 0) * displayFactor)),
      ingredients: [
        {
          productId: raw.id,
          sku: raw.sku,
          productName: raw.name,
          kgPerOutputKg: Math.max(0.01, Number(bomRatio) || 1),
        },
      ],
    };
    updateExtensions((prev) => ({
      ...prev,
      bomFormulas: [formula, ...prev.bomFormulas],
    }));
    setBomTitle('');
    showToast(`فرمول تولید ${formula.code} ثبت شد.`);
  };

  const handleExecuteBomProduction = async (bom: BomFormula) => {
    const outKg = Number(runQtyByBom[bom.id] || '100') || 0;
    if (outKg <= 0) {
      showToast('مقدار تولید (کیلوگرم) باید بزرگ‌تر از صفر باشد.');
      return;
    }
    setRunningBomId(bom.id);
    try {
      let totalMaterialCost = 0;
      for (const ing of bom.ingredients) {
        const rawProd = products.find((p) => p.id === ing.productId);
        if (!rawProd) continue;
        const neededKg = Math.round(outKg * ing.kgPerOutputKg * 100) / 100;
        totalMaterialCost += Math.round(neededKg * rawProd.buyPrice);
        const nextRawStock = Math.max(0, Math.round((rawProd.stock - neededKg) * 100) / 100);
        await adjustProductStock(rawProd.id, nextRawStock);
      }

      const laborTotal = Math.round(outKg * bom.laborOverheadPerKgIrr);
      const totalProdCost = totalMaterialCost + laborTotal;
      const finishedUnitCost = Math.round(totalProdCost / outKg);

      const finProd = products.find((p) => p.id === bom.finishedProductId);
      if (finProd) {
        const oldVal = finProd.stock * finProd.buyPrice;
        const newStock = Math.round((finProd.stock + outKg) * 100) / 100;
        const weightedAvgBuy =
          newStock > 0 ? Math.round((oldVal + totalProdCost) / newStock) : finishedUnitCost;
        await updateProduct(finProd.id, { stock: newStock, buyPrice: weightedAvgBuy });
      }

      const invAcc = accounts.find((a) => a.code.startsWith('105')) || accounts[0];
      const laborAcc =
        accounts.find((a) => a.code.startsWith('701') || a.code.startsWith('801')) || accounts[0];

      const lines: VoucherLine[] = [
        {
          accountCode: invAcc.code,
          accountTitle: invAcc.title,
          description: `ورود ${formatNumber(outKg)} کیلو محصول تولیدی ${bom.finishedProductName} (${bom.code})`,
          debit: totalProdCost,
          credit: 0,
        },
        {
          accountCode: invAcc.code,
          accountTitle: invAcc.title,
          description: `مصرف مواد اولیه طبق فرمول ${bom.code}`,
          debit: 0,
          credit: totalMaterialCost,
        },
      ];
      if (laborTotal > 0) {
        lines.push({
          accountCode: laborAcc.code,
          accountTitle: laborAcc.title,
          description: `جذب دستمزد و سربار تولید (${bom.code})`,
          debit: 0,
          credit: laborTotal,
        });
      }

      const voucher = await createVoucher({
        date: getTodayShamsi(),
        description: `سند تولید BOM: ${bom.title} — ${formatNumber(outKg)} کیلوگرم`,
        voucherType: 'general',
        status: 'permanent',
        lines,
      });

      showToast(
        `تولید ${formatNumber(outKg)} کیلو ثبت شد (بهای تمام‌شده: ${formatMoney(finishedUnitCost, unit)}/کیلو · سند #${toPersianDigits(voucher.voucherNumber)}).`
      );
    } finally {
      setRunningBomId(null);
    }
  };

  // ==================== TAB 4: INSTALLMENT SALES & VOLUME TIER DISCOUNTS ====================
  const customerParties = useMemo(
    () => parties.filter((p) => p.partyType === 'customer' || p.partyType === 'both'),
    [parties]
  );
  const saleInvoices = useMemo(
    () => invoices.filter((inv) => inv.invoiceType === 'sale' && inv.status !== 'cancelled'),
    [invoices]
  );

  const [instInvoiceId, setInstInvoiceId] = useState('');
  const [instPartyId, setInstPartyId] = useState(customerParties[0]?.id || '');
  const [instTotalDisplay, setInstTotalDisplay] = useState('');
  const [instDownDisplay, setInstDownDisplay] = useState('0');
  const [instCount, setInstCount] = useState('6');
  const [instMonthlyPct, setInstMonthlyPct] = useState('2.5');
  const [collectingInstKey, setCollectingInstKey] = useState<string | null>(null);

  // Volume discount rule form
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleMinKg, setRuleMinKg] = useState('1000');
  const [ruleDiscountPct, setRuleDiscountPct] = useState('3');
  const [rulePartyId, setRulePartyId] = useState('');

  const handleSelectInvoiceForInstallment = (invId: string) => {
    setInstInvoiceId(invId);
    const inv = saleInvoices.find((i) => i.id === invId);
    if (inv) {
      setInstPartyId(inv.partyId);
      const base = inv.creditAmount > 0 ? inv.creditAmount : inv.grandTotal;
      setInstTotalDisplay(String(Math.round(base / displayFactor)));
      setInstDownDisplay('0');
    }
  };

  const handleCreateInstallmentPlan = (e: React.FormEvent) => {
    e.preventDefault();
    const party = parties.find((p) => p.id === instPartyId);
    const totalIrr = Math.round((Number(instTotalDisplay) || 0) * displayFactor);
    const downIrr = Math.round((Number(instDownDisplay) || 0) * displayFactor);
    const count = Math.max(1, Math.min(60, parseInt(instCount, 10) || 6));
    const rate = Math.max(0, Number(instMonthlyPct) || 0);
    if (!party || totalIrr <= 0) {
      showToast('مشتری و مبلغ قابل تقسیط را وارد کنید.');
      return;
    }
    const inv = saleInvoices.find((i) => i.id === instInvoiceId);
    const schedule = buildInstallmentSchedule({
      totalAmountIrr: totalIrr,
      downPaymentIrr: downIrr,
      installmentCount: count,
      monthlyRatePct: rate,
      startDate: getTodayShamsi(),
    });
    const plan: InstallmentPlan = {
      id: generateSafeId('inst'),
      planNumber: `INS-${profile.fiscalYear}-${String(installmentPlans.length + 101)}`,
      invoiceId: inv?.id,
      invoiceNumber: inv?.invoiceNumber,
      partyId: party.id,
      partyName: party.name,
      partyPhone: party.phone,
      startDate: getTodayShamsi(),
      totalAmountIrr: totalIrr,
      downPaymentIrr: downIrr,
      monthlyRatePct: rate,
      installments: schedule,
    };
    updateExtensions((prev) => ({
      ...prev,
      installmentPlans: [plan, ...prev.installmentPlans],
    }));
    setInstInvoiceId('');
    setInstTotalDisplay('');
    showToast(`دفترچه قسط ${plan.planNumber} با ${toPersianDigits(count)} قسط ماهانه ایجاد شد.`);
  };

  const handleCollectInstallment = async (plan: InstallmentPlan, idx: number) => {
    const item = plan.installments.find((i) => i.index === idx);
    if (!item || item.paid) return;
    const key = `${plan.id}-${idx}`;
    setCollectingInstKey(key);
    try {
      const bankAcc =
        accounts.find((a) => a.code.startsWith('102')) ||
        accounts.find((a) => a.code.startsWith('101')) ||
        accounts[0];
      const recAcc = accounts.find((a) => a.code.startsWith('103')) || accounts[0];
      const voucher = await createVoucher({
        date: getTodayShamsi(),
        description: `وصول قسط #${toPersianDigits(idx)} دفترچه ${plan.planNumber} — ${plan.partyName}`,
        voucherType: 'treasury',
        status: 'permanent',
        lines: [
          {
            accountCode: bankAcc.code,
            accountTitle: bankAcc.title,
            description: `واریز قسط ${toPersianDigits(idx)} از ${plan.partyName}`,
            debit: item.amountIrr,
            credit: 0,
          },
          {
            accountCode: recAcc.code,
            accountTitle: recAcc.title,
            partyId: plan.partyId,
            partyName: plan.partyName,
            description: `تسویه قسط ${toPersianDigits(idx)} دفترچه ${plan.planNumber}`,
            debit: 0,
            credit: item.amountIrr,
          },
        ],
      });
      updateExtensions((prev) => ({
        ...prev,
        installmentPlans: prev.installmentPlans.map((p) =>
          p.id !== plan.id
            ? p
            : {
                ...p,
                installments: p.installments.map((x) =>
                  x.index === idx
                    ? { ...x, paid: true, paidDate: getTodayShamsi(), voucherId: voucher.id }
                    : x
                ),
              }
        ),
      }));
      showToast(`وصول قسط #${toPersianDigits(idx)} ثبت و سند #${toPersianDigits(voucher.voucherNumber)} صادر شد.`);
    } finally {
      setCollectingInstKey(null);
    }
  };

  const handleAddVolumeRule = (e: React.FormEvent) => {
    e.preventDefault();
    const minKg = Number(ruleMinKg) || 0;
    const pct = Number(ruleDiscountPct) || 0;
    if (!ruleTitle.trim() || minKg <= 0 || pct <= 0 || pct > 50) {
      showToast('عنوان، حداقل وزن (کیلو) و درصد تخفیف معتبر (۱ تا ۵۰٪) را وارد کنید.');
      return;
    }
    const party = parties.find((p) => p.id === rulePartyId);
    const rule: VolumeDiscountRule = {
      id: generateSafeId('vol'),
      title: ruleTitle.trim(),
      minWeightKg: minKg,
      discountPct: pct,
      partyId: party?.id,
      partyName: party?.name,
      active: true,
    };
    updateExtensions((prev) => ({
      ...prev,
      volumeDiscountRules: [rule, ...prev.volumeDiscountRules],
    }));
    setRuleTitle('');
    showToast('قانون تخفیف پلکانی ذخیره شد و به‌صورت خودکار در پنجره فاکتور فروش اعمال می‌شود.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
          انبار تخصصی لات/BOM و فروش اقساطی هلو اپکس ۹.۶
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          ردیابی شماره لات و شید رنگ نخ، برگه‌های مستقل انبار و کالای امانی، فرمول تولید (BOM)، دفترچه قسط و تخفیف پلکانی حجمی
        </p>
      </div>

      {/* 4-Tab Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 flex flex-wrap gap-1.5">
        {[
          { id: 'dye-lots' as const, label: 'شماره لات و شید رنگ', icon: Layers },
          { id: 'slips' as const, label: 'رسید/حواله مستقل و امانی', icon: ClipboardList },
          { id: 'bom' as const, label: 'فرمول تولید (BOM)', icon: Factory },
          { id: 'installments' as const, label: 'فروش اقساطی و تخفیف پلکانی', icon: CreditCard },
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

      {/* ==================== TAB 1: DYE-LOT / BATCH ==================== */}
      {activeTab === 'dye-lots' && (
        <div className="space-y-5 text-xs">
          <form
            onSubmit={handleAddDyeLot}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              ثبت پارت / شماره لات و شید رنگ جدید (جلوگیری از اختلاط رنگ در بافت)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-slate-500 mb-1">کالای نخ</label>
                <select
                  value={lotProductId}
                  onChange={(e) => setLotProductId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">شماره لات (Batch/Lot)</label>
                <input
                  value={lotCode}
                  onChange={(e) => setLotCode(e.target.value)}
                  placeholder="مثلاً: LOT-1405-C22"
                  className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">کد شید / رنگ</label>
                <input
                  value={lotShade}
                  onChange={(e) => setLotShade(e.target.value)}
                  placeholder="RAW-WHITE / NAVY-12"
                  className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">وزن (کیلو) · کارتن</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.1"
                    value={lotWeight}
                    onChange={(e) => setLotWeight(e.target.value)}
                    placeholder="کیلو"
                    className="flex-1 min-w-0 px-2.5 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    value={lotCartons}
                    onChange={(e) => setLotCartons(e.target.value)}
                    placeholder="کارتن"
                    className="w-16 px-2 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                  <span>ثبت لات</span>
                </button>
              </div>
            </div>
          </form>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-900 dark:text-white">
                موجودی تفکیکی به لات و شید ({toPersianDigits(filteredDyeLots.length)} پارت)
              </span>
              <select
                value={lotFilterProd}
                onChange={(e) => setLotFilterProd(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="all">همه کالاها</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">شماره لات</th>
                    <th className="py-2.5 px-4">شید رنگ</th>
                    <th className="py-2.5 px-4">کالا</th>
                    <th className="py-2.5 px-4">انبار</th>
                    <th className="py-2.5 px-4 text-left">مانده / اولیه (کیلو)</th>
                    <th className="py-2.5 px-4 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredDyeLots.map((lot) => (
                    <tr key={lot.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-code font-bold text-teal-700 dark:text-teal-400">
                        {lot.lotCode}
                      </td>
                      <td className="py-2.5 px-4 font-code text-slate-700 dark:text-slate-200">
                        {lot.shadeCode}
                      </td>
                      <td className="py-2.5 px-4 font-medium">{lot.productName}</td>
                      <td className="py-2.5 px-4 text-slate-500">{lot.warehouse}</td>
                      <td className="py-2.5 px-4 text-left font-code tabular-nums">
                        <strong className={lot.remainingWeightKg <= 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}>
                          {formatNumber(lot.remainingWeightKg)}
                        </strong>{' '}
                        <span className="text-slate-400">/ {formatNumber(lot.initialWeightKg)}</span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            updateExtensions((prev) => ({
                              ...prev,
                              dyeLots: prev.dyeLots.filter((x) => x.id !== lot.id),
                            }))
                          }
                          className="p-1 text-slate-400 hover:text-rose-600"
                          aria-label="حذف لات"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: WAREHOUSE SLIPS & CONSIGNMENT ==================== */}
      {activeTab === 'slips' && (
        <div className="space-y-5 text-xs">
          <form
            onSubmit={handleCreateWarehouseSlip}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              صدور رسید ورود، حواله خروج مستقل از فاکتور یا برگه کالای امانی
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-500 mb-1">نوع برگه انبار</label>
                <select
                  value={slipType}
                  onChange={(e) => setSlipType(e.target.value as WarehouseSlipType)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {(Object.keys(SLIP_TYPE_LABELS) as WarehouseSlipType[]).map((k) => (
                    <option key={k} value={k}>
                      {SLIP_TYPE_LABELS[k].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">طرف‌حساب / رنگرز / تحویل‌گیرنده</label>
                <select
                  value={slipPartyId}
                  onChange={(e) => setSlipPartyId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">کالا</label>
                <select
                  value={slipProductId}
                  onChange={(e) => setSlipProductId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (موجودی: {formatNumber(p.stock)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">وزن (کیلو)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={slipWeight}
                    onChange={(e) => setSlipWeight(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">کارتن</label>
                  <input
                    type="number"
                    value={slipCartons}
                    onChange={(e) => setSlipCartons(e.target.value)}
                    placeholder="خودکار"
                    className="w-full px-2.5 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={slipDriver}
                  onChange={(e) => setSlipDriver(e.target.value)}
                  placeholder="نام راننده (اختیاری)"
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 w-40"
                />
                <input
                  value={slipPlate}
                  onChange={(e) => setSlipPlate(e.target.value)}
                  placeholder="پلاک خودرو"
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 w-36"
                />
                <input
                  value={slipNotes}
                  onChange={(e) => setSlipNotes(e.target.value)}
                  placeholder="توضیحات برگه انبار..."
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 w-56"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                <span>صدور برگه انبار</span>
              </button>
            </div>
          </form>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">شماره برگه</th>
                    <th className="py-2.5 px-4">نوع</th>
                    <th className="py-2.5 px-4">تاریخ</th>
                    <th className="py-2.5 px-4">طرف‌حساب</th>
                    <th className="py-2.5 px-4">کالا و وزن</th>
                    <th className="py-2.5 px-4">وضعیت</th>
                    <th className="py-2.5 px-4 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {warehouseSlips.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        برگه رسید یا حواله مستقلی ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    warehouseSlips.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-code font-bold">{s.slipNumber}</td>
                        <td className={`py-2.5 px-4 font-semibold ${SLIP_TYPE_LABELS[s.slipType].badgeClass}`}>
                          {SLIP_TYPE_LABELS[s.slipType].label}
                        </td>
                        <td className="py-2.5 px-4 font-code">{toPersianDigits(s.date)}</td>
                        <td className="py-2.5 px-4">{s.partyName}</td>
                        <td className="py-2.5 px-4">
                          {s.items.map((it) => `${it.productName} (${formatNumber(it.weightKg)} کیلو)`).join('، ')}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={
                              s.status === 'confirmed'
                                ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                : 'text-amber-700 dark:text-amber-400 font-semibold'
                            }
                          >
                            {s.status === 'confirmed' ? 'قطعی (اعمال در انبار)' : 'موقت'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            {s.status === 'draft' && (
                              <button
                                type="button"
                                disabled={confirmingSlipId === s.id}
                                onClick={() => handleConfirmWarehouseSlip(s)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-teal-700 hover:bg-teal-800 text-white font-semibold"
                              >
                                {confirmingSlipId === s.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3" />
                                )}
                                <span>اعمال موجودی</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setPrintingSlip(s);
                                setTimeout(() => window.print(), 120);
                              }}
                              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="چاپ برگه انبار"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {printingSlip && (
            <div className="bg-white text-slate-900 border-2 border-slate-800 rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-300 pb-3">
                <div>
                  <div className="font-bold text-base">{profile.companyName}</div>
                  <div className="text-xs text-slate-600">
                    {SLIP_TYPE_LABELS[printingSlip.slipType].label} — شماره {printingSlip.slipNumber}
                  </div>
                </div>
                <div className="text-left text-xs font-code">
                  <div>تاریخ: {toPersianDigits(printingSlip.date)}</div>
                  <div>انبار: {printingSlip.warehouse}</div>
                </div>
              </div>
              <div className="text-xs">
                طرف‌حساب / تحویل‌گیرنده: <strong>{printingSlip.partyName}</strong>
                {printingSlip.driverName ? ` | راننده: ${printingSlip.driverName}` : ''}
                {printingSlip.plateNumber ? ` | پلاک: ${printingSlip.plateNumber}` : ''}
              </div>
              <table className="w-full text-xs border border-slate-300">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-2 border border-slate-300">کد کالا</th>
                    <th className="p-2 border border-slate-300">شرح کالا</th>
                    <th className="p-2 border border-slate-300">وزن (کیلو)</th>
                    <th className="p-2 border border-slate-300">کارتن</th>
                  </tr>
                </thead>
                <tbody>
                  {printingSlip.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2 border border-slate-300 font-code">{it.sku}</td>
                      <td className="p-2 border border-slate-300">{it.productName}</td>
                      <td className="p-2 border border-slate-300 font-code">{formatNumber(it.weightKg)}</td>
                      <td className="p-2 border border-slate-300 font-code">{formatNumber(it.cartonCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end no-print">
                <button
                  type="button"
                  onClick={() => setPrintingSlip(null)}
                  className="px-3 py-1 rounded bg-slate-200 text-slate-800 text-xs"
                >
                  بستن پیش‌نمایش چاپ
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: BOM PRODUCTION ==================== */}
      {activeTab === 'bom' && (
        <div className="space-y-5 text-xs">
          <form
            onSubmit={handleCreateBom}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              تعریف فرمول تولید (BOM) — دولاتابی، رنگرزی یا مونتاژ نخ با محاسبه خودکار بهای تمام‌شده
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-slate-500 mb-1">عنوان فرمول تولید</label>
                <input
                  value={bomTitle}
                  onChange={(e) => setBomTitle(e.target.value)}
                  placeholder="مثلاً: دولاتابی نخ ۱۵۰/۴۸ به ۳۰۰/۹۶"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">محصول نهایی</label>
                <select
                  value={bomFinishedId}
                  onChange={(e) => setBomFinishedId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">ماده اولیه مصرفی</label>
                <select
                  value={bomRawId}
                  onChange={(e) => setBomRawId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">ضریب مصرف · افت٪</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={bomRatio}
                    onChange={(e) => setBomRatio(e.target.value)}
                    title="مقدار ماده اولیه به ازای ۱ کیلو محصول"
                    className="flex-1 min-w-0 px-2 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    step="0.5"
                    value={bomWastePct}
                    onChange={(e) => setBomWastePct(e.target.value)}
                    title="درصد ضایعات مجاز"
                    className="w-14 px-2 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">سربار/دستمزد ({unitName}/کیلو)</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    value={bomLaborDisplay}
                    onChange={(e) => setBomLaborDisplay(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shrink-0"
                  >
                    ثبت
                  </button>
                </div>
              </div>
            </div>
          </form>

          {bomFormulas.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500">
              هنوز فرمول تولید (BOM) تعریف نشده است.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bomFormulas.map((bom) => {
                const matCostPerKg = bom.ingredients.reduce((s, ing) => {
                  const p = products.find((x) => x.id === ing.productId);
                  return s + Math.round((p?.buyPrice ?? 0) * ing.kgPerOutputKg);
                }, 0);
                const estUnitCost = matCostPerKg + bom.laborOverheadPerKgIrr;
                return (
                  <div
                    key={bom.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white">
                          {bom.title}{' '}
                          <span className="font-code text-xs text-teal-700 dark:text-teal-400">
                            ({bom.code})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          خروجی: {bom.finishedProductName} · افت مجاز: {toPersianDigits(bom.wastePct)}٪
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateExtensions((prev) => ({
                            ...prev,
                            bomFormulas: prev.bomFormulas.filter((x) => x.id !== bom.id),
                          }))
                        }
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
                      {bom.ingredients.map((ing, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span>{ing.productName}</span>
                          <span className="font-code">
                            {toPersianDigits(ing.kgPerOutputKg)} کیلو به ازای هر ۱ کیلو
                          </span>
                        </div>
                      ))}
                      <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between font-semibold">
                        <span>بهای تمام‌شده برآوردی هر کیلو:</span>
                        <span className="font-code text-teal-700 dark:text-teal-400">
                          {formatMoney(estUnitCost, unit)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        value={runQtyByBom[bom.id] ?? '100'}
                        onChange={(e) =>
                          setRunQtyByBom((prev) => ({ ...prev, [bom.id]: e.target.value }))
                        }
                        placeholder="وزن تولید (کیلو)"
                        className="w-28 px-2.5 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                      <button
                        type="button"
                        disabled={runningBomId === bom.id}
                        onClick={() => handleExecuteBomProduction(bom)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg"
                      >
                        {runningBomId === bom.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        <span>اجرای تولید و صدور سند خودکار</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 4: INSTALLMENTS & VOLUME DISCOUNTS ==================== */}
      {activeTab === 'installments' && (
        <div className="space-y-6 text-xs">
          {/* Installment Builder */}
          <form
            onSubmit={handleCreateInstallmentPlan}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              صدور دفترچه فروش اقساطی هلو (تبدیل مانده فاکتور یا قرارداد قسطی جدید)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-slate-500 mb-1">اتصال به فاکتور فروش (اختیاری)</label>
                <select
                  value={instInvoiceId}
                  onChange={(e) => handleSelectInvoiceForInstallment(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="">قرارداد مستقل...</option>
                  {saleInvoices.slice(0, 30).map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — {inv.partyName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">مشتری</label>
                <select
                  value={instPartyId}
                  onChange={(e) => setInstPartyId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {customerParties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">مبلغ کل ({unitName})</label>
                <input
                  type="number"
                  value={instTotalDisplay}
                  onChange={(e) => setInstTotalDisplay(e.target.value)}
                  placeholder="0"
                  className="w-full px-2.5 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">پیش‌پرداخت ({unitName})</label>
                <input
                  type="number"
                  value={instDownDisplay}
                  onChange={(e) => setInstDownDisplay(e.target.value)}
                  className="w-full px-2.5 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">تعداد قسط · کارمزد ماهانه٪</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={instCount}
                    onChange={(e) => setInstCount(e.target.value)}
                    className="w-16 px-2 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    step="0.5"
                    value={instMonthlyPct}
                    onChange={(e) => setInstMonthlyPct(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                  <span>صدور دفترچه قسط</span>
                </button>
              </div>
            </div>
          </form>

          {/* Active Installment Plans */}
          {installmentPlans.length > 0 && (
            <div className="space-y-4">
              {installmentPlans.map((plan) => {
                const paidCnt = plan.installments.filter((i) => i.paid).length;
                return (
                  <div
                    key={plan.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
                  >
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white">
                          {plan.partyName}{' '}
                          <span className="font-code text-xs text-teal-700 dark:text-teal-400">
                            ({plan.planNumber})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          کل قرارداد: {formatCompactMoney(plan.totalAmountIrr, unit)} · وصول‌شده:{' '}
                          {toPersianDigits(paidCnt)} از {toPersianDigits(plan.installments.length)} قسط
                          {plan.invoiceNumber ? ` · فاکتور ${plan.invoiceNumber}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateExtensions((prev) => ({
                            ...prev,
                            installmentPlans: prev.installmentPlans.filter((x) => x.id !== plan.id),
                          }))
                        }
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="py-2 px-3">قسط</th>
                            <th className="py-2 px-3">سررسید</th>
                            <th className="py-2 px-3 text-left">مبلغ قسط</th>
                            <th className="py-2 px-3 text-center">وصول / یادآور واتساپ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {plan.installments.map((inst) => {
                            const key = `${plan.id}-${inst.index}`;
                            const msg = `یادآور قسط #${toPersianDigits(inst.index)} (${plan.planNumber}) — ${profile.companyName}\nمشتری گرامی ${plan.partyName}\nسررسید: ${toPersianDigits(inst.dueDate)}\nمبلغ قسط: ${formatMoney(inst.amountIrr, unit)}`;
                            return (
                              <tr key={inst.index}>
                                <td className="py-2 px-3 font-code font-semibold">
                                  #{toPersianDigits(inst.index)}
                                </td>
                                <td className="py-2 px-3 font-code">{toPersianDigits(inst.dueDate)}</td>
                                <td className="py-2 px-3 text-left font-code tabular-nums font-bold">
                                  {formatMoney(inst.amountIrr, unit)}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {inst.paid ? (
                                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                      وصول‌شده ({toPersianDigits(inst.paidDate || '')})
                                    </span>
                                  ) : (
                                    <div className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={collectingInstKey === key}
                                        onClick={() => handleCollectInstallment(plan, inst.index)}
                                        className="px-2.5 py-1 rounded bg-teal-700 hover:bg-teal-800 text-white font-semibold disabled:opacity-50"
                                      >
                                        ثبت وصول و سند
                                      </button>
                                      <a
                                        href={buildWhatsAppUrl(plan.partyPhone, msg)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                        title="ارسال یادآور در واتساپ"
                                      >
                                        <MessageCircle className="w-3 h-3" />
                                        <span>واتساپ</span>
                                      </a>
                                      <a
                                        href={buildSmsUrl(plan.partyPhone, msg)}
                                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                                      >
                                        پیامک
                                      </a>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Volume Tiered Discount Rules */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Percent className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                قوانین تخفیف پلکانی حجمی و قرارداد اختصاصی مشتریان (اعمال خودکار در فاکتور فروش)
              </h2>
            </div>

            <form onSubmit={handleAddVolumeRule} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <input
                value={ruleTitle}
                onChange={(e) => setRuleTitle(e.target.value)}
                placeholder="عنوان تخفیف (مثلاً: خرید بالای ۵ تن)"
                className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="number"
                value={ruleMinKg}
                onChange={(e) => setRuleMinKg(e.target.value)}
                placeholder="حداقل وزن (کیلو)"
                className="px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="number"
                step="0.5"
                value={ruleDiscountPct}
                onChange={(e) => setRuleDiscountPct(e.target.value)}
                placeholder="درصد تخفیف ٪"
                className="px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <div className="flex gap-1.5">
                <select
                  value={rulePartyId}
                  onChange={(e) => setRulePartyId(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="">همه مشتریان</option>
                  {customerParties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-3 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shrink-0"
                >
                  افزودن
                </button>
              </div>
            </form>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {volumeDiscountRules.map((rule) => (
                <div key={rule.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">{rule.title}</span>
                    <span className="text-slate-500 mr-2 font-code">
                      حداقل {formatNumber(rule.minWeightKg)} کیلو ← {toPersianDigits(rule.discountPct)}٪ تخفیف
                      {rule.partyName ? ` (اختصاصی: ${rule.partyName})` : ' (عمومی)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateExtensions((prev) => ({
                          ...prev,
                          volumeDiscountRules: prev.volumeDiscountRules.map((r) =>
                            r.id === rule.id ? { ...r, active: !r.active } : r
                          ),
                        }))
                      }
                      className={`px-2.5 py-1 rounded font-semibold ${
                        rule.active
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {rule.active ? 'فعال' : 'غیرفعال'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateExtensions((prev) => ({
                          ...prev,
                          volumeDiscountRules: prev.volumeDiscountRules.filter((r) => r.id !== rule.id),
                        }))
                      }
                      className="p-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
