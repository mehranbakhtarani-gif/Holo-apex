import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  Barcode,
  Bookmark,
  Camera,
  Copy,
  CreditCard,
  Download,
  FileCheck2,
  FileEdit,
  Loader2,
  MessageCircle,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  Plus,
  Printer,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { useWorkspaceExtensions } from '../context/WorkspaceExtensionsContext';
import { Invoice, InvoiceItem, InvoiceType } from '../types/accounting';
import { buildMoadianInvoiceJson, PRICING_TIER_LABELS } from '../lib/enterpriseAccounting';
import {
  computePartyInvoiceIntelligence,
  getLastPriceForPartyProduct,
  MOADIAN_PATTERN_LABELS,
  MoadianInvoiceType,
  MoadianPatternCode,
  PRICE_TIER_COLUMN_LABELS,
  PriceTierColumn,
  ReservedInvoice,
} from '../lib/smartIntelligence';
import {
  buildSmsUrl,
  generateMoadianTaxId22,
} from '../lib/apexExtensions';
import {
  buildTelegramShareUrl,
  buildWhatsAppShareUrl,
  exportToCsv,
  formatInvoiceShareText,
  formatMoney,
  formatNumber,
  formatWeight,
  getTodayShamsi,
  numberToPersianWords,
  toPersianDigits,
} from '../lib/format';
import { fuzzyFilterAndRank } from '../lib/fuzzySearch';
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
import {
  ACCENT_THEMES,
  InvoiceAccentColor,
  InvoicePaperSize,
  InvoiceTemplateStyle,
  InvoiceUnitMode,
  PAPER_SIZE_LABELS,
  TEMPLATE_LABELS,
  UNIT_MODE_LABELS,
  useInvoiceSettings,
} from '../lib/invoiceSettings';
import { SmartSearchCombobox, SmartSearchOption } from './SmartSearchCombobox';
import { FuzzyTableOption, FuzzyTableSearch } from './FuzzyTableSearch';
import { VoiceInputButton } from './VoiceInputButton';
import { MoadianQrCode } from './MoadianQrCode';

const TYPE_LABELS: Record<InvoiceType, string> = {
  sale: 'فاکتور فروش رسمی',
  purchase: 'فاکتور خرید / واردات',
  proforma: 'پیش‌فاکتور فروش',
  sale_return: 'برگشت از فروش',
  purchase_return: 'برگشت از خرید',
  waste: 'فاکتور ضایعات انبار',
};

const STATUS_LABELS: Record<Invoice['status'], string> = {
  issued: 'صادرشده',
  settled: 'تسویه‌شده',
  cancelled: 'ابطال‌شده',
};

interface DraftInvoiceRow {
  productId: string;
  quantity: number; // Weight in kg (base unit)
  cartonCount: number; // Secondary unit count (cartons/bales)
  bobbinCount: number; // Tertiary unit count (bobbins/cones)
  unitPrice: number; // Rial per kg
  discount: number; // Rial
  lotCode?: string; // Selected Yarn Dye-Lot code
}

export const InvoicesView: React.FC<{ initialIntent?: string; clearIntent?: () => void }> = ({
  initialIntent,
  clearIntent,
}) => {
  const {
    invoices,
    parties,
    products,
    cheques,
    costCenters,
    currencies,
    exchangeRates,
    partyBalances,
    profile,
    createInvoice,
    cancelInvoice,
    convertProformaToSale,
    showToast,
  } = useAccounting();
  const unit = profile.currencyUnit;
  const { settings: printSettings, updateSettings: updatePrintSettings } = useInvoiceSettings();

  const [filterType, setFilterType] = useState<'all' | InvoiceType>('all');
  const [search, setSearch] = useState('');
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [showPrintCustomizer, setShowPrintCustomizer] = useState(false);

  const {
    reservedInvoices,
    setReservedInvoicesSynced,
    productMetaMap,
    dyeLots,
    deductDyeLotStock,
    volumeDiscountRules,
    moadianLinks,
    upsertMoadianMeta,
    setEditingLock,
    getConflictingDevices,
  } = useWorkspaceExtensions();

  const [showReservedDrawer, setShowReservedDrawer] = useState(false);
  const [barcodeScanInput, setBarcodeScanInput] = useState('');
  const [selectedPriceTier, setSelectedPriceTier] = useState<PriceTierColumn>('sellPrice');
  const [moadianType, setMoadianType] = useState<MoadianInvoiceType>('type1');
  const [moadianPattern, setMoadianPattern] = useState<MoadianPatternCode>('sales_goods');
  const [correctiveRefInvoice, setCorrectiveRefInvoice] = useState<Invoice | null>(null);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showAiScanner, setShowAiScanner] = useState(false);
  const [aiInvoiceText, setAiInvoiceText] = useState('');
  const [aiInvoiceImage, setAiInvoiceImage] = useState<string>('');
  const [aiParsing, setAiParsing] = useState(false);

  // Composer state
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('sale');
  const [date, setDate] = useState(getTodayShamsi());

  const invoiceConflictingDevices = useMemo(
    () => (showComposer ? getConflictingDevices('invoice:composer') : []),
    [showComposer, getConflictingDevices]
  );

  useEffect(() => {
    if (!showComposer) {
      setEditingLock('', '');
      return;
    }
    setEditingLock(
      'invoice:composer',
      correctiveRefInvoice
        ? `صدور اصلاحی فاکتور ${correctiveRefInvoice.invoiceNumber}`
        : `صدور ${TYPE_LABELS[invoiceType]}`
    );
    return () => setEditingLock('', '');
  }, [showComposer, invoiceType, correctiveRefInvoice, setEditingLock]);
  const [partyId, setPartyId] = useState(parties[0]?.id ?? '');
  const [warehouse, setWarehouse] = useState('انبار مرکزی نخ شادآباد');
  const [costCenterId, setCostCenterId] = useState(costCenters[1]?.id ?? '');
  const [intermediaryId, setIntermediaryId] = useState('');
  const [currencyCode, setCurrencyCode] = useState<string>(BASE_CURRENCY_CODE);
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [applyVat, setApplyVat] = useState(true);
  const [preventNegativeStock, setPreventNegativeStock] = useState(true);
  const [paidCash, setPaidCash] = useState(0);
  const [paidBank, setPaidBank] = useState(0);
  const [paidCheque, setPaidCheque] = useState(0);

  const brokerParties = useMemo(
    () => parties.filter((p) => p.partyType === 'intermediary' || (p.commissionRate ?? 0) > 0),
    [parties]
  );

  const selectedComposerParty = useMemo(
    () => parties.find((p) => p.id === partyId),
    [parties, partyId]
  );

  const applyTierDiscountToRows = (pct: number) => {
    const safePct = Math.max(0, Math.min(50, pct));
    setDraftItems((prev) =>
      prev.map((row) => {
        const gross = row.quantity * row.unitPrice;
        const disc = isFxMode
          ? roundCurrency((gross * safePct) / 100, fxDecimals)
          : Math.round((gross * safePct) / 100);
        return { ...row, discount: disc };
      })
    );
  };

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

  const makeInitialDraftRow = (
    prodId: string,
    type: InvoiceType = 'sale',
    defaultCartons = 10,
    targetCurrency: string = currencyCode,
    targetRate: number = exchangeRate
  ): DraftInvoiceRow => {
    const prod = products.find((p) => p.id === prodId) ?? products[0];
    const kgPerCtn = prod?.kgPerCarton && prod.kgPerCarton > 0 ? prod.kgPerCarton : 25;
    const bobbinsPerCtn = prod?.bobbinsPerCarton && prod.bobbinsPerCarton > 0 ? prod.bobbinsPerCarton : 6;
    const qtyKg = Math.round(defaultCartons * kgPerCtn * 100) / 100;
    const baseIrrPrice =
      type === 'purchase' || type === 'purchase_return' || type === 'waste'
        ? (prod?.buyPrice ?? 0)
        : (prod?.sellPrice ?? 0);
    const useFx = isForeignCurrency(targetCurrency) && targetRate > 0;
    const curDef = currencies.find((c) => normalizeCurrencyCode(c.code) === normalizeCurrencyCode(targetCurrency));
    const price = useFx
      ? convertIrrToForeign(baseIrrPrice, targetRate, curDef?.decimalPlaces ?? 2)
      : baseIrrPrice;
    return {
      productId: prod?.id ?? '',
      cartonCount: defaultCartons,
      quantity: qtyKg,
      bobbinCount: Math.round(defaultCartons * bobbinsPerCtn),
      unitPrice: price,
      discount: 0,
    };
  };

  const [draftItems, setDraftItems] = useState<DraftInvoiceRow[]>(() => [
    makeInitialDraftRow(products[0]?.id ?? '', 'sale', 10, BASE_CURRENCY_CODE, 1),
  ]);

  const openComposerWithType = (type: InvoiceType) => {
    setCorrectiveRefInvoice(null);
    setInvoiceType(type);
    setApplyVat(type !== 'waste');
    setDraftItems((prev) =>
      prev.map((row) => {
        const prod = products.find((p) => p.id === row.productId);
        const baseIrr =
          type === 'purchase' || type === 'purchase_return' || type === 'waste'
            ? (prod?.buyPrice ?? 0)
            : (prod?.sellPrice ?? 0);
        const nextPrice =
          isFxMode && exchangeRate > 0
            ? convertIrrToForeign(baseIrr, exchangeRate, fxDecimals)
            : baseIrr || row.unitPrice;
        return {
          ...row,
          unitPrice: nextPrice,
        };
      })
    );
    setShowComposer(true);
  };

  const openCorrectiveComposer = (parentInv: Invoice) => {
    setCorrectiveRefInvoice(parentInv);
    setInvoiceType(parentInv.invoiceType);
    setDate(getTodayShamsi());
    setPartyId(parentInv.partyId);
    setWarehouse(parentInv.warehouse);
    setCostCenterId(parentInv.costCenterId || '');
    setIntermediaryId(parentInv.intermediaryId || '');
    setCurrencyCode(normalizeCurrencyCode(parentInv.currencyCode));
    setExchangeRate(
      isForeignCurrency(parentInv.currencyCode) && parentInv.exchangeRate
        ? parentInv.exchangeRate
        : 1
    );
    setApplyVat(parentInv.vatAmount > 0);
    setPaidCash(parentInv.paidCash);
    setPaidBank(parentInv.paidBank);
    setPaidCheque(parentInv.paidCheque);
    setDraftItems(
      parentInv.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        cartonCount: it.cartonCount ?? 0,
        bobbinCount: it.bobbinCount ?? 0,
        unitPrice:
          isForeignCurrency(parentInv.currencyCode) && it.foreignUnitPrice !== undefined
            ? it.foreignUnitPrice
            : it.unitPrice,
        discount:
          isForeignCurrency(parentInv.currencyCode) && it.foreignDiscount !== undefined
            ? it.foreignDiscount
            : it.discount,
        lotCode: it.lotNumber,
      }))
    );
    setPrintInvoice(null);
    setShowComposer(true);
    showToast(`فرم صورتحساب اصلاحی مودیان متصل به ${parentInv.invoiceNumber} باز شد.`);
  };

  const handleInvoiceCurrencyChange = (nextCode: string) => {
    const norm = normalizeCurrencyCode(nextCode);
    const prevIsFx = isFxMode;
    const prevRate = prevIsFx ? exchangeRate : 1;
    const nextIsFx = isForeignCurrency(norm);
    const eff = nextIsFx
      ? getEffectiveExchangeRate(norm, date, exchangeRates, currencies)
      : { rateToIrr: 1, rateDate: date };
    const nextRate = nextIsFx && eff.rateToIrr > 0 ? eff.rateToIrr : 1;
    const nextDef = currencies.find((c) => normalizeCurrencyCode(c.code) === norm);
    const nextDec = nextDef?.decimalPlaces ?? 2;

    setCurrencyCode(norm);
    setExchangeRate(nextRate);

    // Convert existing draft unit prices & discounts smoothly to the newly selected currency
    setDraftItems((prev) =>
      prev.map((row) => {
        const irrUnit = prevIsFx ? row.unitPrice * prevRate : row.unitPrice;
        const irrDisc = prevIsFx ? row.discount * prevRate : row.discount;
        return {
          ...row,
          unitPrice: nextIsFx ? convertIrrToForeign(irrUnit, nextRate, nextDec) : Math.round(irrUnit),
          discount: nextIsFx ? convertIrrToForeign(irrDisc, nextRate, nextDec) : Math.round(irrDisc),
        };
      })
    );
  };

  const handleRefreshInvoiceRate = () => {
    if (!isFxMode) return;
    const eff = getEffectiveExchangeRate(currencyCode, date, exchangeRates, currencies);
    if (eff.rateToIrr > 0) {
      setExchangeRate(eff.rateToIrr);
      showToast(
        eff.rateDate
          ? `نرخ ${currencyCode} از تاریخ ${toPersianDigits(eff.rateDate)} اعمال شد.`
          : `نرخ پیش‌فرض ${currencyCode} اعمال شد.`
      );
    }
  };

  useEffect(() => {
    if (!initialIntent) return;
    if (initialIntent === 'new-sale') openComposerWithType('sale');
    else if (initialIntent === 'new-purchase') openComposerWithType('purchase');
    else if (initialIntent === 'new-proforma') openComposerWithType('proforma');
    else if (initialIntent === 'new-sale-return') openComposerWithType('sale_return');
    else if (initialIntent === 'new-purchase-return') openComposerWithType('purchase_return');
    else if (initialIntent === 'new-waste') openComposerWithType('waste');
    else if (initialIntent === 'reserved') setShowReservedDrawer(true);
    else if (initialIntent === 'filter-proforma') setFilterType('proforma');
    else if (initialIntent === 'filter-sale') setFilterType('sale');
    else if (initialIntent === 'filter-purchase') setFilterType('purchase');
    clearIntent?.();
  }, [initialIntent, clearIntent]);

  // Holoo 9.6 Helper: Get 4-tier price for product
  const getTierPriceIrr = (prodId: string, tier: PriceTierColumn): number => {
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return 0;
    if (invoiceType === 'purchase' || invoiceType === 'purchase_return' || invoiceType === 'waste') {
      return prod.buyPrice;
    }
    const meta = productMetaMap[prod.id] || productMetaMap[prod.sku];
    if (tier === 'wholesalePrice') return meta?.wholesalePrice ?? Math.round((prod.sellPrice * 0.96) / 1000) * 1000;
    if (tier === 'partnerPrice') return meta?.partnerPrice ?? Math.round((prod.sellPrice * 0.93) / 1000) * 1000;
    if (tier === 'factoryPrice') return meta?.factoryPrice ?? Math.round((prod.sellPrice * 0.9) / 1000) * 1000;
    return prod.sellPrice;
  };

  const handlePriceTierChange = (tier: PriceTierColumn) => {
    setSelectedPriceTier(tier);
    setDraftItems((prev) =>
      prev.map((row) => {
        const irr = getTierPriceIrr(row.productId, tier);
        return {
          ...row,
          unitPrice: isFxMode && exchangeRate > 0 ? convertIrrToForeign(irr, exchangeRate, fxDecimals) : irr,
        };
      })
    );
    showToast(`سطح قیمت فاکتور به «${PRICE_TIER_COLUMN_LABELS[tier]}» به‌روزرسانی شد.`);
  };

  // Holoo 9.6 Barcode Scanner Handler (matches EAN-13 barcode or SKU)
  const handleBarcodeScanSubmit = () => {
    const q = barcodeScanInput.trim().toLowerCase();
    if (!q) return;
    const matched = products.find((p) => {
      const meta = productMetaMap[p.id] || productMetaMap[p.sku];
      return (
        p.sku.toLowerCase() === q ||
        (meta?.barcode && meta.barcode.toLowerCase() === q) ||
        p.sku.toLowerCase().includes(q)
      );
    });
    if (!matched) {
      showToast(`کالایی با بارکد یا کد «${barcodeScanInput}» در انبار یافت نشد.`);
      return;
    }
    const existingIdx = draftItems.findIndex((r) => r.productId === matched.id);
    if (existingIdx >= 0) {
      handleCartonChange(existingIdx, draftItems[existingIdx].cartonCount + 1);
      showToast(`۱ ${matched.secondaryUnit || 'کارتن'} به ردیف «${matched.name}» اضافه شد.`);
    } else {
      const nextRow = makeInitialDraftRow(matched.id, invoiceType, 1, currencyCode, exchangeRate);
      const tierIrr = getTierPriceIrr(matched.id, selectedPriceTier);
      nextRow.unitPrice =
        isFxMode && exchangeRate > 0
          ? convertIrrToForeign(tierIrr, exchangeRate, fxDecimals)
          : tierIrr;
      setDraftItems((prev) => [...prev, nextRow]);
      showToast(`کالای «${matched.name}» با بارکدخوان به فاکتور اضافه شد.`);
    }
    setBarcodeScanInput('');
  };

  // Holoo 9.6 Reserve (Park) Current Invoice
  const handleReserveCurrentInvoice = () => {
    const party = parties.find((p) => p.id === partyId);
    const reserved: ReservedInvoice = {
      id: `res-${Date.now()}`,
      label: `${TYPE_LABELS[invoiceType]} — ${party?.name || 'مشتری'} (${toPersianDigits(draftItems.length)} قلم)`,
      savedAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      invoiceType,
      date,
      partyId,
      partyName: party?.name || 'مشتری',
      warehouse,
      costCenterId,
      intermediaryId,
      currencyCode,
      exchangeRate,
      applyVat,
      moadianType,
      moadianPattern,
      draftItems,
      paidCash,
      paidBank,
      paidCheque,
      estimatedTotalIrr: grandTotal,
    };
    const next = [reserved, ...reservedInvoices].slice(0, 12);
    setReservedInvoicesSynced(next);
    setShowComposer(false);
    setShowReservedDrawer(true);
    showToast('فاکتور در صف ابری «فاکتورهای رزرو هلو ۹.۶» ذخیره موقت شد؛ روی همه دستگاه‌ها در دسترس است.');
  };

  const handleResumeReservedInvoice = (res: ReservedInvoice) => {
    setCorrectiveRefInvoice(null);
    setInvoiceType(res.invoiceType);
    setDate(res.date);
    setPartyId(res.partyId);
    setWarehouse(res.warehouse);
    setCostCenterId(res.costCenterId);
    setIntermediaryId(res.intermediaryId);
    setCurrencyCode(res.currencyCode);
    setExchangeRate(res.exchangeRate);
    setApplyVat(res.applyVat);
    setMoadianType(res.moadianType);
    setMoadianPattern(res.moadianPattern);
    setDraftItems(res.draftItems);
    setPaidCash(res.paidCash);
    setPaidBank(res.paidBank);
    setPaidCheque(res.paidCheque);
    const remaining = reservedInvoices.filter((x) => x.id !== res.id);
    setReservedInvoicesSynced(remaining);
    setShowReservedDrawer(false);
    setShowComposer(true);
    showToast(`فاکتور رزرو شده «${res.partyName}» برای تکمیل و ثبت بازخوانی شد.`);
  };

  const handleDeleteReservedInvoice = (id: string) => {
    const remaining = reservedInvoices.filter((x) => x.id !== id);
    setReservedInvoicesSynced(remaining);
  };

  // Gemini Multimodal AI Invoice / Proforma Reader
  const handleAiParseInvoice = async () => {
    if (!aiInvoiceText.trim() && !aiInvoiceImage) {
      showToast('متن سفارش را وارد کنید یا تصویر فاکتور را انتخاب نمایید.');
      return;
    }
    setAiParsing(true);
    try {
      const resp = await fetch('/api/ai/parse-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: aiInvoiceText.trim(),
          imageDataUrl: aiInvoiceImage,
          invoiceType,
          currencyUnit: unit,
          products: products.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            sellPrice: p.sellPrice,
            buyPrice: p.buyPrice,
            kgPerCarton: p.kgPerCarton,
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
        showToast(data?.error || 'خطا در تحلیل هوشمند فاکتور.');
        return;
      }
      if (data.partyId && parties.some((p) => p.id === data.partyId)) {
        setPartyId(data.partyId);
      }
      const parsedItems = Array.isArray(data.items) ? data.items : [];
      if (parsedItems.length > 0) {
        const mapped: DraftInvoiceRow[] = parsedItems.map(
          (it: {
            productId: string;
            cartonCount?: number;
            quantityKg: number;
            unitPriceIrr: number;
            discountIrr?: number;
          }) => {
            const prod = products.find((p) => p.id === it.productId) ?? products[0];
            const kgPerCtn = prod?.kgPerCarton && prod.kgPerCarton > 0 ? prod.kgPerCarton : 25;
            const bobbinsPerCtn = prod?.bobbinsPerCarton && prod.bobbinsPerCarton > 0 ? prod.bobbinsPerCarton : 6;
            const qty = Math.max(0.1, Number(it.quantityKg) || kgPerCtn);
            const cartons =
              it.cartonCount && it.cartonCount > 0
                ? it.cartonCount
                : Math.round((qty / kgPerCtn) * 100) / 100;
            const priceIrr = Math.max(0, Math.round(Number(it.unitPriceIrr) || prod?.sellPrice || 0));
            const discIrr = Math.max(0, Math.round(Number(it.discountIrr) || 0));
            return {
              productId: prod?.id || '',
              quantity: qty,
              cartonCount: cartons,
              bobbinCount: Math.round(cartons * bobbinsPerCtn),
              unitPrice:
                isFxMode && exchangeRate > 0
                  ? convertIrrToForeign(priceIrr, exchangeRate, fxDecimals)
                  : priceIrr,
              discount:
                isFxMode && exchangeRate > 0
                  ? convertIrrToForeign(discIrr, exchangeRate, fxDecimals)
                  : discIrr,
            };
          }
        );
        setDraftItems(mapped);
        setShowAiScanner(false);
        setAiInvoiceText('');
        setAiInvoiceImage('');
        showToast(
          `${toPersianDigits(mapped.length)} قلم کالا با هوش مصنوعی استخراج و در جدول فاکتور تکمیل شد.`
        );
      } else {
        showToast('قلم کالایی در متن یا تصویر شناسایی نشد.');
      }
    } catch {
      showToast('ارتباط با سرویس هوش مصنوعی برقرار نشد.');
    } finally {
      setAiParsing(false);
    }
  };

  // Exact integer Rial computation alongside foreign-currency equivalents (zero rounding drift)
  const computedItems: InvoiceItem[] = useMemo(() => {
    const effRate = isFxMode ? Math.max(1, exchangeRate) : 1;
    return draftItems
      .map((di): InvoiceItem | null => {
        const prod = products.find((p) => p.id === di.productId);
        if (!prod) return null;
        const safeQty = Math.round(Math.max(0.01, di.quantity) * 100) / 100;

        if (isFxMode) {
          const fUnit = roundCurrency(Math.max(0, di.unitPrice), fxDecimals);
          const fGross = roundCurrency(safeQty * fUnit, fxDecimals);
          const fDisc = Math.min(fGross, roundCurrency(Math.max(0, di.discount), fxDecimals));
          const fNet = roundCurrency(Math.max(0, fGross - fDisc), fxDecimals);
          const fVat =
            invoiceType !== 'waste' && applyVat && !prod.vatExempt
              ? roundCurrency(fNet * 0.1, fxDecimals)
              : 0;
          const fTotal = roundCurrency(fNet + fVat, fxDecimals);

          const irrUnit = convertForeignToIrr(fUnit, effRate);
          const irrGross = convertForeignToIrr(fGross, effRate);
          const irrDisc = Math.min(irrGross, convertForeignToIrr(fDisc, effRate));
          const irrNet = Math.max(0, irrGross - irrDisc);
          const irrVat =
            invoiceType !== 'waste' && applyVat && !prod.vatExempt
              ? convertForeignToIrr(fVat, effRate)
              : 0;
          const irrTotal = irrNet + irrVat;

          return {
            productId: prod.id,
            sku: prod.sku,
            productName: prod.name,
            unit: prod.unit,
            quantity: safeQty,
            ...(prod.secondaryUnit ? { secondaryUnit: prod.secondaryUnit } : {}),
            ...(prod.kgPerCarton ? { kgPerCarton: prod.kgPerCarton } : {}),
            ...(di.cartonCount > 0
              ? { cartonCount: Math.round(di.cartonCount * 100) / 100 }
              : {}),
            ...(prod.bobbinUnit ? { bobbinUnit: prod.bobbinUnit } : {}),
            ...(di.bobbinCount > 0 ? { bobbinCount: Math.round(di.bobbinCount) } : {}),
            ...(di.lotCode || prod.lotNumber ? { lotNumber: di.lotCode || prod.lotNumber } : {}),
            unitPrice: irrUnit,
            discount: irrDisc,
            vatAmount: irrVat,
            lineTotal: irrTotal,
            foreignUnitPrice: fUnit,
            foreignDiscount: fDisc,
            foreignVatAmount: fVat,
            foreignLineTotal: fTotal,
          };
        }

        const gross = Math.round(safeQty * Math.max(0, di.unitPrice));
        const safeDiscount = Math.min(gross, Math.round(Math.max(0, di.discount)));
        const net = Math.max(0, gross - safeDiscount);
        const vat =
          invoiceType !== 'waste' && applyVat && !prod.vatExempt ? Math.round(net * 0.1) : 0;
        return {
          productId: prod.id,
          sku: prod.sku,
          productName: prod.name,
          unit: prod.unit,
          quantity: safeQty,
          ...(prod.secondaryUnit ? { secondaryUnit: prod.secondaryUnit } : {}),
          ...(prod.kgPerCarton ? { kgPerCarton: prod.kgPerCarton } : {}),
          ...(di.cartonCount > 0
            ? { cartonCount: Math.round(di.cartonCount * 100) / 100 }
            : {}),
          ...(prod.bobbinUnit ? { bobbinUnit: prod.bobbinUnit } : {}),
          ...(di.bobbinCount > 0 ? { bobbinCount: Math.round(di.bobbinCount) } : {}),
          ...(di.lotCode || prod.lotNumber ? { lotNumber: di.lotCode || prod.lotNumber } : {}),
          unitPrice: Math.round(Math.max(0, di.unitPrice)),
          discount: safeDiscount,
          vatAmount: vat,
          lineTotal: net + vat,
        };
      })
      .filter((x): x is InvoiceItem => x !== null);
  }, [draftItems, products, applyVat, invoiceType, isFxMode, exchangeRate, fxDecimals]);

  // Ensure exact Rial identity: subtotal - totalDiscount + vatTotal === grandTotal
  const subtotal = computedItems.reduce(
    (s, i) => s + (i.lineTotal - i.vatAmount + i.discount),
    0
  );
  const totalDiscount = computedItems.reduce((s, i) => s + i.discount, 0);
  const vatTotal = computedItems.reduce((s, i) => s + i.vatAmount, 0);
  const grandTotal = subtotal - totalDiscount + vatTotal;

  const foreignSubtotal = isFxMode
    ? roundCurrency(
        computedItems.reduce(
          (s, i) =>
            s + ((i.foreignLineTotal ?? 0) - (i.foreignVatAmount ?? 0) + (i.foreignDiscount ?? 0)),
          0
        ),
        fxDecimals
      )
    : 0;
  const foreignDiscountTotal = isFxMode
    ? roundCurrency(
        computedItems.reduce((s, i) => s + (i.foreignDiscount ?? 0), 0),
        fxDecimals
      )
    : 0;
  const foreignVatTotal = isFxMode
    ? roundCurrency(
        computedItems.reduce((s, i) => s + (i.foreignVatAmount ?? 0), 0),
        fxDecimals
      )
    : 0;
  const foreignGrandTotal = isFxMode
    ? roundCurrency(foreignSubtotal - foreignDiscountTotal + foreignVatTotal, fxDecimals)
    : 0;

  const totalWeightKg = computedItems.reduce((s, i) => s + i.quantity, 0);
  const totalCartons = computedItems.reduce((s, i) => s + (i.cartonCount ?? 0), 0);
  const totalBobbins = computedItems.reduce((s, i) => s + (i.bobbinCount ?? 0), 0);
  const totalPaid = invoiceType === 'waste' ? 0 : paidCash + paidBank + paidCheque;
  const creditAmount = invoiceType === 'waste' ? 0 : Math.max(0, grandTotal - totalPaid);

  // Automatic Volume Tiered Discount match
  const matchedVolumeDiscountRule = useMemo(() => {
    if (invoiceType !== 'sale' && invoiceType !== 'proforma') return null;
    const eligible = volumeDiscountRules
      .filter(
        (r) =>
          r.active &&
          totalWeightKg >= r.minWeightKg &&
          (!r.partyId || r.partyId === partyId)
      )
      .sort((a, b) => b.discountPct - a.discountPct);
    return eligible[0] || null;
  }, [invoiceType, volumeDiscountRules, totalWeightKg, partyId]);

  const invoiceSearchOptions: FuzzyTableOption[] = useMemo(
    () =>
      invoices.map((inv) => {
        const kg = inv.items.reduce((s, it) => s + it.quantity, 0);
        const ctns = inv.items.reduce((s, it) => s + (it.cartonCount ?? 0), 0);
        return {
          id: inv.id,
          code: inv.invoiceNumber,
          label: `${inv.partyName} — ${TYPE_LABELS[inv.invoiceType]}`,
          sublabel: `${toPersianDigits(inv.date)} · ${formatWeight(kg)} کیلو${
            ctns > 0 ? ` (${formatWeight(ctns)} کارتن)` : ''
          } · ${STATUS_LABELS[inv.status]}`,
          meta: formatMoney(inv.grandTotal, unit),
          metaTone:
            inv.status === 'cancelled'
              ? 'negative'
              : inv.creditAmount > 0
                ? 'warning'
                : 'positive',
          keywords: [
            inv.invoiceNumber,
            inv.taxSerial || '',
            inv.partyName,
            inv.date,
            TYPE_LABELS[inv.invoiceType],
            STATUS_LABELS[inv.status],
            String(inv.grandTotal),
            ...inv.items.map((it) => `${it.sku} ${it.productName} ${it.lotNumber || ''}`),
          ].join(' '),
        };
      }),
    [invoices, unit]
  );

  const partyPickerOptions: SmartSearchOption[] = useMemo(
    () =>
      parties.map((p) => ({
        id: p.id,
        code: p.code,
        label: p.name,
        sublabel: p.nationalId ? `شناسه ملی: ${p.nationalId}` : p.phone || '',
        keywords: `${p.code} ${p.name} ${p.nationalId || ''} ${p.phone || ''}`,
      })),
    [parties]
  );

  const productPickerOptions: SmartSearchOption[] = useMemo(
    () =>
      products.map((p) => {
        const ctns =
          p.kgPerCarton && p.kgPerCarton > 0
            ? Math.round((p.stock / p.kgPerCarton) * 10) / 10
            : 0;
        return {
          id: p.id,
          code: p.sku,
          label: p.name,
          sublabel: [
            p.lotNumber ? `لات ${p.lotNumber}` : '',
            p.kgPerCarton ? `هر ${p.secondaryUnit || 'کارتن'} ${formatWeight(p.kgPerCarton)} کیلو` : '',
            `فروش: ${formatMoney(p.sellPrice, unit)}`,
          ]
            .filter(Boolean)
            .join(' · '),
          meta: `${formatWeight(p.stock)} کیلو${ctns > 0 ? ` (${formatWeight(ctns)} ${p.secondaryUnit || 'کارتن'})` : ''}`,
          metaTone: p.stock <= 0 ? 'negative' : p.stock <= p.reorderPoint ? 'warning' : 'positive',
          keywords: `${p.sku} ${p.name} ${p.category} ${p.warehouse} ${p.yarnCount || ''} ${p.lotNumber || ''} ${p.originCountry || ''}`,
        };
      }),
    [products, unit]
  );

  const typeScopedInvoices = useMemo(
    () => invoices.filter((inv) => filterType === 'all' || inv.invoiceType === filterType),
    [invoices, filterType]
  );

  const filteredInvoices = useMemo(() => {
    const ranked = fuzzyFilterAndRank(typeScopedInvoices, search, (inv) => [
      { text: inv.invoiceNumber, weight: 1.4 },
      { text: inv.partyName, weight: 1.25 },
      { text: inv.taxSerial, weight: 1.15 },
      { text: inv.date, weight: 1.0 },
      { text: TYPE_LABELS[inv.invoiceType], weight: 0.9 },
      { text: STATUS_LABELS[inv.status], weight: 0.8 },
      { text: String(inv.grandTotal), weight: 0.85 },
      {
        text: inv.items.map((it) => `${it.sku} ${it.productName} ${it.lotNumber || ''}`).join(' '),
        weight: 0.95,
      },
    ]);
    return ranked.map((r) => r.item);
  }, [typeScopedInvoices, search]);

  const handleProductChange = (idx: number, newProdId: string) => {
    const prod = products.find((p) => p.id === newProdId);
    setDraftItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const kgPerCtn = prod?.kgPerCarton && prod.kgPerCarton > 0 ? prod.kgPerCarton : 25;
        const bobbinsPerCtn = prod?.bobbinsPerCarton && prod.bobbinsPerCarton > 0 ? prod.bobbinsPerCarton : 6;
        const cartons = row.cartonCount > 0 ? row.cartonCount : 1;
        const baseIrr =
          invoiceType === 'purchase' ||
          invoiceType === 'purchase_return' ||
          invoiceType === 'waste'
            ? (prod?.buyPrice ?? 0)
            : (prod?.sellPrice ?? 0);
        return {
          ...row,
          productId: newProdId,
          cartonCount: cartons,
          quantity: Math.round(cartons * kgPerCtn * 100) / 100,
          bobbinCount: Math.round(cartons * bobbinsPerCtn),
          unitPrice:
            isFxMode && exchangeRate > 0
              ? convertIrrToForeign(baseIrr, exchangeRate, fxDecimals)
              : baseIrr,
        };
      })
    );
  };

  const handleCartonChange = (idx: number, nextCartons: number) => {
    setDraftItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const prod = products.find((p) => p.id === row.productId);
        const kgPerCtn = prod?.kgPerCarton && prod.kgPerCarton > 0 ? prod.kgPerCarton : 25;
        const bobbinsPerCtn = prod?.bobbinsPerCarton && prod.bobbinsPerCarton > 0 ? prod.bobbinsPerCarton : 6;
        const safeCtn = Math.max(0, nextCartons);
        return {
          ...row,
          cartonCount: safeCtn,
          quantity: Math.round(safeCtn * kgPerCtn * 100) / 100,
          bobbinCount: Math.round(safeCtn * bobbinsPerCtn),
        };
      })
    );
  };

  const handleKgChange = (idx: number, nextKg: number) => {
    setDraftItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const prod = products.find((p) => p.id === row.productId);
        const safeKg = Math.max(0, nextKg);
        const kgPerCtn = prod?.kgPerCarton && prod.kgPerCarton > 0 ? prod.kgPerCarton : 0;
        const bobbinsPerCtn = prod?.bobbinsPerCarton && prod.bobbinsPerCarton > 0 ? prod.bobbinsPerCarton : 0;
        const estCartons = kgPerCtn > 0 ? Math.round((safeKg / kgPerCtn) * 100) / 100 : row.cartonCount;
        const estBobbins = kgPerCtn > 0 && bobbinsPerCtn > 0 ? Math.round((safeKg / kgPerCtn) * bobbinsPerCtn) : row.bobbinCount;
        return {
          ...row,
          quantity: safeKg,
          cartonCount: estCartons,
          bobbinCount: estBobbins,
        };
      })
    );
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (computedItems.length === 0) {
      showToast('حداقل یک قلم نخ به فاکتور اضافه کنید.');
      return;
    }
    if (preventNegativeStock && (invoiceType === 'sale' || invoiceType === 'waste')) {
      const shortageItem = computedItems.find((it) => {
        const prod = products.find((p) => p.id === it.productId);
        return prod && it.quantity > prod.stock + 0.001;
      });
      if (shortageItem) {
        const prod = products.find((p) => p.id === shortageItem.productId);
        showToast(
          `کنترل موجودی انبار: موجودی «${shortageItem.productName}» فقط ${formatWeight(
            prod?.stock ?? 0
          )} ${shortageItem.unit} است. برای فروش منفی تیک کنترل موجودی را بردارید.`
        );
        return;
      }
    }
    if (invoiceType !== 'waste' && totalPaid > grandTotal) {
      showToast('جمع دریافتی نقد، بانک و چک نمی‌تواند بیشتر از مبلغ کل فاکتور باشد.');
      return;
    }
    const party = parties.find((p) => p.id === partyId) ?? parties[0];
    if (!party) {
      showToast('لطفاً طرف‌حساب را انتخاب کنید.');
      return;
    }

    const prefix =
      invoiceType === 'sale'
        ? 'F'
        : invoiceType === 'purchase'
          ? 'P'
          : invoiceType === 'proforma'
            ? 'PF'
            : invoiceType === 'waste'
              ? 'W'
              : 'R';
    const seq = 100 + invoices.length + 1;
    const invoiceNumber = `${prefix}-${profile.fiscalYear}-${seq}`;
    const taxId22 = generateMoadianTaxId22(invoiceNumber, date, profile.economicCode);
    const taxSerial = taxId22;

    const selectedBroker = brokerParties.find((b) => b.id === intermediaryId);

    const createdInvoice = await createInvoice({
      invoiceNumber,
      taxSerial,
      invoiceType,
      date,
      partyId: party.id,
      partyName: invoiceType === 'waste' ? 'انبار ضایعات داخلی شرکت' : party.name,
      warehouse,
      costCenterId: costCenterId || undefined,
      intermediaryId: selectedBroker?.id,
      intermediaryName: selectedBroker?.name,
      ...(isFxMode
        ? {
            currencyCode: normalizeCurrencyCode(currencyCode),
            exchangeRate: Math.max(1, Math.round(exchangeRate)),
            foreignSubtotal,
            foreignDiscount: foreignDiscountTotal,
            foreignVatAmount: foreignVatTotal,
            foreignGrandTotal,
          }
        : {}),
      subtotal,
      discount: totalDiscount,
      vatAmount: vatTotal,
      grandTotal,
      paidCash: invoiceType === 'waste' ? 0 : paidCash,
      paidBank: invoiceType === 'waste' ? 0 : paidBank,
      paidCheque: invoiceType === 'waste' ? 0 : paidCheque,
      creditAmount,
      status:
        invoiceType === 'waste' || (creditAmount === 0 && invoiceType !== 'proforma')
          ? 'settled'
          : 'issued',
      items: computedItems,
    });

    // Deduct dye-lot stock for selected batches on sale / waste
    if (invoiceType === 'sale' || invoiceType === 'waste') {
      draftItems.forEach((row) => {
        if (row.lotCode && row.productId && row.quantity > 0) {
          deductDyeLotStock(row.lotCode, row.productId, row.quantity);
        }
      });
    }

    // Record Moadian 22-char Tax ID & optional corrective linkage
    if (createdInvoice?.id) {
      if (correctiveRefInvoice) {
        const parentTaxId =
          moadianLinks[correctiveRefInvoice.id]?.taxId22 ||
          generateMoadianTaxId22(
            correctiveRefInvoice.invoiceNumber,
            correctiveRefInvoice.date,
            profile.economicCode
          );
        upsertMoadianMeta(createdInvoice.id, {
          taxId22,
          submissionStatus: 'ready',
          subject: 'corrective',
          referenceInvoiceId: correctiveRefInvoice.id,
          referenceTaxId22: parentTaxId,
        });
        upsertMoadianMeta(correctiveRefInvoice.id, {
          ...(moadianLinks[correctiveRefInvoice.id] || {
            taxId22: parentTaxId,
            subject: 'original' as const,
          }),
          submissionStatus: 'corrected',
        });
      } else {
        upsertMoadianMeta(createdInvoice.id, {
          taxId22,
          submissionStatus: 'ready',
          subject: invoiceType === 'sale_return' ? 'return' : 'original',
        });
      }
    }

    setCorrectiveRefInvoice(null);
    setShowSettlementModal(false);
    setShowComposer(false);
    setIntermediaryId('');
    setPaidCash(0);
    setPaidBank(0);
    setPaidCheque(0);
  };

  const handleCancelInvoiceWithMoadian = async (inv: Invoice) => {
    await cancelInvoice(inv.id);
    const existingTaxId =
      moadianLinks[inv.id]?.taxId22 ||
      generateMoadianTaxId22(inv.invoiceNumber, inv.date, profile.economicCode);
    upsertMoadianMeta(inv.id, {
      taxId22: existingTaxId,
      submissionStatus: 'cancelled',
      subject: 'cancellation',
      referenceTaxId22: existingTaxId,
    });
  };

  const handleExportCsv = () => {
    exportToCsv(
      `holoo-yarn-invoices-${profile.fiscalYear}.csv`,
      [
        'شماره فاکتور',
        'شماره مالیاتی مودیان',
        'نوع',
        'وضعیت',
        'تاریخ',
        'طرف‌حساب',
        'ارز',
        'نرخ برابری (ریال)',
        'جمع کل ارزی',
        'جمع وزن (کیلوگرم)',
        'جمع کارتن/عدل',
        'مبلغ خالص',
        'مالیات ۱۰٪',
        'جمع کل (ریال)',
        'مانده نسیه',
      ],
      filteredInvoices.map((inv) => [
        inv.invoiceNumber,
        inv.taxSerial || '-',
        TYPE_LABELS[inv.invoiceType],
        STATUS_LABELS[inv.status],
        inv.date,
        inv.partyName,
        normalizeCurrencyCode(inv.currencyCode),
        isForeignCurrency(inv.currencyCode) && inv.exchangeRate ? inv.exchangeRate : 1,
        isForeignCurrency(inv.currencyCode) && inv.foreignGrandTotal !== undefined
          ? inv.foreignGrandTotal
          : 0,
        inv.items.reduce((s, it) => s + it.quantity, 0),
        inv.items.reduce((s, it) => s + (it.cartonCount ?? 0), 0),
        inv.subtotal - inv.discount,
        inv.vatAmount,
        inv.grandTotal,
        inv.creditAmount,
      ])
    );
  };

  // Build share text & links for any invoice (WhatsApp / Telegram / Copy)
  const buildInvoiceSharePayload = (inv: Invoice) => {
    const party = parties.find((p) => p.id === inv.partyId);
    const currentBalance = party ? partyBalances.get(party.id) : undefined;
    const text = formatInvoiceShareText({
      companyName: profile.companyName,
      invoiceNumber: inv.invoiceNumber,
      invoiceTypeLabel: TYPE_LABELS[inv.invoiceType],
      date: inv.date,
      partyName: inv.partyName,
      warehouse: inv.warehouse,
      items: inv.items,
      subtotal: inv.subtotal,
      discount: inv.discount,
      vatAmount: inv.vatAmount,
      grandTotal: inv.grandTotal,
      creditAmount: inv.creditAmount,
      unit,
      currencyCode: inv.currencyCode,
      exchangeRate: inv.exchangeRate,
      foreignGrandTotal: inv.foreignGrandTotal,
      bankInfo: printSettings.bankInfo,
      partyCurrentBalance: printSettings.showPartyBalance ? currentBalance : undefined,
    });
    return {
      text,
      whatsappUrl: buildWhatsAppShareUrl(text, party?.phone),
      telegramUrl: buildTelegramShareUrl(text),
      party,
      currentBalance,
    };
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} در حافظه کپی شد و آماده ارسال در واتساپ یا تلگرام است.`);
    } catch {
      showToast('دسترسی به کلیپ‌بورد مسدود است؛ از دکمه مستقیم واتساپ یا تلگرام استفاده کنید.');
    }
  };

  const printParty = printInvoice ? parties.find((p) => p.id === printInvoice.partyId) : undefined;
  const printShare = printInvoice ? buildInvoiceSharePayload(printInvoice) : null;
  const accentTheme = ACCENT_THEMES[printSettings.accentColor];
  const showCartonCol = printSettings.unitDisplayMode !== '1_unit';
  const showBobbinCol = printSettings.unitDisplayMode === '3_units';

  // Compute Holoo signature "Previous Balance" vs "Current Balance" for the printed invoice
  const printPartyNewBalance = printParty ? (partyBalances.get(printParty.id) ?? 0) : 0;
  const printInvoiceCreditEffect =
    printInvoice && printInvoice.status !== 'cancelled' && printInvoice.invoiceType !== 'proforma'
      ? printInvoice.invoiceType === 'sale'
        ? printInvoice.creditAmount
        : printInvoice.invoiceType === 'purchase'
          ? -printInvoice.creditAmount
          : printInvoice.invoiceType === 'sale_return'
            ? -printInvoice.creditAmount
            : printInvoice.invoiceType === 'purchase_return'
              ? printInvoice.creditAmount
              : 0
      : 0;
  const printPartyPrevBalance = printPartyNewBalance - printInvoiceCreditEffect;

  const paperMaxWidthClass =
    printSettings.paperSize === 'thermal_80mm'
      ? 'max-w-sm'
      : printSettings.paperSize === 'A5' || printSettings.template === 'compact_a5'
        ? 'max-w-2xl'
        : 'max-w-4xl';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            خرید، فروش چندواحدی نخ، پیش‌فاکتور و سامانه مودیان
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            صدور فاکتور فروش (F2) و خرید (F4) با محاسبه خودکار کارتن/عدل، دوک/بوبین و وزن باسکول، طراحی قالب چاپ و ارسال مستقیم در واتساپ و تلگرام
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReservedDrawer((p) => !p)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border whitespace-nowrap ${
              reservedInvoices.length > 0
                ? 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200 font-semibold'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>فاکتورهای رزرو ({toPersianDigits(reservedInvoices.length)})</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>خروجی اکسل</span>
          </button>
          <button
            onClick={() => openComposerWithType('sale')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>صدور فاکتور هلو ۹.۶</span>
          </button>
        </div>
      </div>

      {/* Holoo Apex 9.6 Reserved Invoices Queue */}
      {showReservedDrawer && (
        <div className="bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/70 rounded-xl p-4 space-y-3 text-xs no-print">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <PauseCircle className="w-4 h-4 text-amber-600" />
              <span>صف فاکتورهای رزرو موقت (هلو اپکس ۹.۶)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowReservedDrawer(false)}
              className="p-1 text-slate-500 hover:text-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {reservedInvoices.length === 0 ? (
            <p className="text-slate-500">
              هیچ فاکتور رزرو شده‌ای وجود ندارد. هنگام صدور فاکتور می‌توانید با دکمه «رزرو موقت فاکتور» آن را پارک کرده و فاکتور مشتری دیگری را ثبت کنید.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {reservedInvoices.map((res) => (
                <div
                  key={res.id}
                  className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">
                      {res.partyName}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-code">
                      {TYPE_LABELS[res.invoiceType]} · {toPersianDigits(res.draftItems.length)} قلم · ساعت {res.savedAt}
                    </div>
                    <div className="text-[11px] font-code font-bold text-teal-700 dark:text-teal-400 mt-0.5">
                      {formatMoney(res.estimatedTotalIrr, unit)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleResumeReservedInvoice(res)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-teal-700 hover:bg-teal-800 text-white font-semibold"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>ادامه</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteReservedInvoice(res.id)}
                      className="p-1.5 rounded text-slate-400 hover:text-rose-600"
                      title="حذف فاکتور رزرو"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filter Bar + Global Fuzzy Table Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg overflow-x-auto border border-slate-200 dark:border-slate-800">
          {(
            ['all', 'sale', 'purchase', 'proforma', 'sale_return', 'purchase_return', 'waste'] as const
          ).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                filterType === t
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t === 'all' ? 'همه فاکتورها' : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="w-full lg:w-96">
          <FuzzyTableSearch
            options={invoiceSearchOptions}
            query={search}
            onQueryChange={setSearch}
            totalCount={typeScopedInvoices.length}
            matchedCount={filteredInvoices.length}
            entityLabel="فاکتور"
            onSelect={(opt) => {
              setHighlightedInvoiceId(opt.id);
              const inv = invoices.find((x) => x.id === opt.id);
              if (inv) setPrintInvoice(inv);
            }}
            placeholder="جستجوی فازی فاکتور (شماره، طرف‌حساب، نوع نخ، لات یا مبلغ)..."
            emptyText="فاکتوری با این مشخصات یافت نشد."
          />
        </div>
      </div>

      {/* Authentic Holoo Apex 9.6 Multi-Unit Yarn Invoice Composer */}
      {showComposer && (
        <form
          onSubmit={handleSaveInvoice}
          onKeyDown={(e) => {
            if (e.key === 'F9') {
              e.preventDefault();
              e.stopPropagation();
              if (invoiceType !== 'waste') setShowSettlementModal(true);
            }
          }}
          className="bg-white dark:bg-slate-900 border-2 border-teal-700/25 dark:border-teal-800/70 rounded-xl overflow-hidden shadow-sm no-print"
        >
          {/* Holoo Apex 9.6 Classic Window Title Bar */}
          <div className="px-5 py-3 bg-slate-800 dark:bg-slate-950 text-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <FileCheck2 className="w-4 h-4 text-teal-400" />
              <span className="font-bold text-sm">
                فرم صدور {TYPE_LABELS[invoiceType]} — هلو اپکس ۹.۶
              </span>
              <span className="text-slate-400 hidden md:inline">·</span>
              <span className="text-[11px] text-slate-300 hidden md:inline font-code">
                F9: پنجره امور مالی فاکتور
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAiScanner((p) => !p)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  showAiScanner
                    ? 'bg-teal-500 text-slate-950'
                    : 'bg-slate-700 text-teal-200 hover:bg-slate-600'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>تکمیل هوشمند از متن / عکس</span>
              </button>
              <button
                type="button"
                onClick={handleReserveCurrentInvoice}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-400/30"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                <span>رزرو موقت</span>
              </button>
              <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-slate-900/90 border border-slate-700 text-[10.5px]">
                {(['1_unit', '2_units', '3_units'] as InvoiceUnitMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updatePrintSettings({ unitDisplayMode: mode })}
                    className={`px-2 py-0.5 rounded font-medium whitespace-nowrap ${
                      printSettings.unitDisplayMode === mode
                        ? 'bg-teal-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode === '1_unit' ? '۱ واحدی' : mode === '2_units' ? '۲ واحدی' : '۳ واحدی'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="p-1 rounded-md text-slate-300 hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Multi-Device Concurrent Edit Warning */}
            {invoiceConflictingDevices.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <div className="font-bold">هشدار ثبت همزمان فاکتور روی دستگاه دیگر</div>
                  <div className="text-[11px] mt-0.5">
                    دستگاه «{invoiceConflictingDevices.map((d) => `${d.deviceLabel} (${d.operatorName})`).join('، ')}» هم‌اکنون در حال ثبت فاکتور است. جهت کنترل موجودی انبار و شماره فاکتور هماهنگ کنید.
                  </div>
                </div>
              </div>
            )}

            {/* Moadian Corrective Invoice Reference Banner */}
            {correctiveRefInvoice && (
              <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-indigo-900 dark:text-indigo-200">
                    صدور صورتحساب اصلاحی سامانه مودیان
                  </span>{' '}
                  <span className="text-indigo-700 dark:text-indigo-300">
                    متصل به فاکتور مرجع <strong className="font-code">{correctiveRefInvoice.invoiceNumber}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCorrectiveRefInvoice(null)}
                  className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:underline"
                >
                  لغو ارتباط اصلاحی
                </button>
              </div>
            )}

            {/* Multimodal Gemini AI Invoice / Proforma Scanner + Persian Voice Input */}
            {showAiScanner && (
              <div className="p-3.5 rounded-lg bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    <span>تکمیل خودکار فاکتور از صدا، پیام واتساپ مشتری یا عکس فاکتور کاغذی (AI)</span>
                  </div>
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-800 text-teal-800 dark:text-teal-300 font-semibold cursor-pointer hover:bg-teal-50">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{aiInvoiceImage ? 'تصویر بارگذاری شد (تغییر)' : 'آپلود عکس فاکتور'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === 'string') setAiInvoiceImage(reader.result);
                        };
                        reader.readAsDataURL(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={aiInvoiceText}
                    onChange={(e) => setAiInvoiceText(e.target.value)}
                    placeholder="بگویید یا بنویسید: سفارش کارخانه بافندگی البرز، ۲۰ کارتن نخ DTY 150/48 کیلویی ۲۱۵ هزار تومان..."
                    className="flex-1 px-3 py-2 rounded-lg border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-950"
                  />
                  <VoiceInputButton
                    compact
                    label="ورود صوتی"
                    onTranscript={(spoken) => {
                      setAiInvoiceText((prev) => (prev ? `${prev} ${spoken}` : spoken));
                      showToast('متن فارسی سفارش از صدای شما دریافت شد.');
                    }}
                    onError={(msg) => showToast(msg)}
                  />
                  <button
                    type="button"
                    disabled={aiParsing}
                    onClick={() => void handleAiParseInvoice()}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg whitespace-nowrap"
                  >
                    {aiParsing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{aiParsing ? 'در حال خواندن...' : 'تکمیل خودکار جدول'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Holoo 9.6 Barcode Scanner, 4-Tier Price Level & Moadian Electronic Pattern Bar */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-xs items-end">
              <div className="md:col-span-4">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  ورودی سریع بارکدخوان / کد کالا (Enter)
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <Barcode className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                    <input
                      value={barcodeScanInput}
                      onChange={(e) => setBarcodeScanInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleBarcodeScanSubmit();
                        }
                      }}
                      placeholder="اسکن بارکد یا کد SKU و کلید Enter..."
                      className="w-full pr-8 pl-2.5 py-1.5 font-code rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleBarcodeScanSubmit}
                    className="px-2.5 py-1.5 rounded-md bg-slate-800 dark:bg-teal-700 text-white font-semibold whitespace-nowrap"
                  >
                    افزودن
                  </button>
                </div>
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  سطح قیمت‌گذاری هلو ۹.۶
                </label>
                <select
                  value={selectedPriceTier}
                  onChange={(e) => handlePriceTierChange(e.target.value as PriceTierColumn)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {(Object.keys(PRICE_TIER_COLUMN_LABELS) as PriceTierColumn[]).map((k) => (
                    <option key={k} value={k}>
                      {PRICE_TIER_COLUMN_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  نوع صورتحساب مودیان
                </label>
                <select
                  value={moadianType}
                  onChange={(e) => setMoadianType(e.target.value as MoadianInvoiceType)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="type1">نوع ۱ (خریدار مشخص)</option>
                  <option value="type2">نوع ۲ (مصرف‌کننده)</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  الگوی سامانه مودیان ۹.۶
                </label>
                <select
                  value={moadianPattern}
                  onChange={(e) => setMoadianPattern(e.target.value as MoadianPatternCode)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {(Object.keys(MOADIAN_PATTERN_LABELS) as MoadianPatternCode[]).map((k) => (
                    <option key={k} value={k}>
                      {MOADIAN_PATTERN_LABELS[k].code} — {MOADIAN_PATTERN_LABELS[k].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                نوع فاکتور
              </label>
              <select
                value={invoiceType}
                onChange={(e) => openComposerWithType(e.target.value as InvoiceType)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                طرف‌حساب (کارخانه بافندگی / تأمین‌کننده)
              </label>
              {invoiceType === 'waste' ? (
                <div className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-500">
                  انبار ضایعات داخلی شرکت
                </div>
              ) : (
                <SmartSearchCombobox
                  mode="picker"
                  options={partyPickerOptions}
                  value={partyId}
                  onSelect={(opt) => {
                    setPartyId(opt.id);
                    const picked = parties.find((p) => p.id === opt.id);
                    if (
                      picked &&
                      (invoiceType === 'sale' || invoiceType === 'proforma') &&
                      (picked.tierDiscountPct ?? 0) > 0
                    ) {
                      applyTierDiscountToRows(picked.tierDiscountPct ?? 0);
                      showToast(
                        `تخفیف ${toPersianDigits(picked.tierDiscountPct ?? 0)}٪ (${PRICING_TIER_LABELS[picked.pricingTier || 'standard'].label.split('—')[0].trim()}) روی اقلام اعمال شد.`
                      );
                    }
                  }}
                  placeholder="نام، کد یا شناسه ملی طرف‌حساب..."
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                انبار تحویل / ورود
              </label>
              <input
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                تاریخ شمسی
              </label>
              <input
                value={date}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  setDate(nextDate);
                  if (isFxMode && /^\d{4}\/\d{2}\/\d{2}$/.test(nextDate)) {
                    const eff = getEffectiveExchangeRate(currencyCode, nextDate, exchangeRates, currencies);
                    if (eff.rateToIrr > 0) setExchangeRate(eff.rateToIrr);
                  }
                }}
                className="w-full px-3 py-2 text-xs font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                مرکز هزینه / پارت
              </label>
              <select
                value={costCenterId}
                onChange={(e) => setCostCenterId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                <option value="">بدون مرکز هزینه</option>
                {costCenters.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} — {cc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Holoo Live Customer Credit, Bounced Cheque Risk, Balance, Pricing Tier & Broker Strip */}
          {invoiceType !== 'waste' && selectedComposerParty && (
            (() => {
              const curBal = partyBalances.get(selectedComposerParty.id) ?? 0;
              const partyRisk = computePartyInvoiceIntelligence({
                party: selectedComposerParty,
                partyBalance: curBal,
                invoices,
                cheques,
                pendingCreditAmount: invoiceType === 'sale' ? creditAmount : 0,
              });
              const exceedsCredit = partyRisk.riskLevel === 'high';
              const tierKey = selectedComposerParty.pricingTier || 'standard';
              const tierDiscount =
                selectedComposerParty.tierDiscountPct ??
                PRICING_TIER_LABELS[tierKey].defaultDiscountPct;

              return (
                <div
                  className={`p-3 rounded-lg border text-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                    exceedsCredit
                      ? 'border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span>
                      <span className="text-slate-500">مانده فعلی مشتری: </span>
                      <strong className="font-code tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(Math.abs(curBal), unit)}{' '}
                        {curBal === 0 ? '(تسویه)' : curBal > 0 ? '(بد)' : '(بس)'}
                      </strong>
                    </span>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                      |
                    </span>
                    <span>
                      <span className="text-slate-500">سقف اعتبار: </span>
                      <strong className="font-code tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(selectedComposerParty.creditLimit, unit)}
                      </strong>
                      {partyRisk.warnings.map((w, wi) => (
                        <span
                          key={wi}
                          className="mr-1.5 inline-flex items-center gap-1 font-bold text-rose-700 dark:text-rose-400"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span>{w}</span>
                        </span>
                      ))}
                    </span>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                      |
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="text-teal-800 dark:text-teal-300 font-semibold">
                        {PRICING_TIER_LABELS[tierKey].label}
                      </span>
                      {(invoiceType === 'sale' || invoiceType === 'proforma') && tierDiscount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            applyTierDiscountToRows(tierDiscount);
                            showToast(`تخفیف ${toPersianDigits(tierDiscount)}٪ تیپ قیمتی روی اقلام اعمال شد.`);
                          }}
                          className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
                        >
                          اعمال تخفیف تیپ قیمتی ({toPersianDigits(tierDiscount)}٪)
                        </button>
                      )}
                    </span>
                  </div>

                  {(invoiceType === 'sale' || invoiceType === 'proforma') && brokerParties.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-[11px] text-slate-500 whitespace-nowrap">
                        واسطه / بازاریاب:
                      </label>
                      <select
                        value={intermediaryId}
                        onChange={(e) => setIntermediaryId(e.target.value)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      >
                        <option value="">فروش مستقیم (بدون واسطه)</option>
                        {brokerParties.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({toPersianDigits(b.commissionRate ?? 1.5)}٪)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })()
          )}

          {/* Multi-Currency Selector & Daily Parity Rate Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center p-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <div className="lg:col-span-4">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                ارز صدور فاکتور
              </label>
              <select
                value={currencyCode}
                onChange={(e) => handleInvoiceCurrencyChange(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                {activeCurrencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.isBase ? `${c.code} — ریال ایران (ارز پایه)` : `${c.code} (${c.symbol}) — ${c.name}`}
                  </option>
                ))}
              </select>
            </div>

            {isFxMode ? (
              <>
                <div className="lg:col-span-4">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      نرخ برابری هر ۱ {currencyCode} (به ریال)
                    </label>
                    <button
                      type="button"
                      onClick={handleRefreshInvoiceRate}
                      className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      بازخوانی نرخ روز
                    </button>
                  </div>
                  <input
                    type="number"
                    min={1}
                    dir="ltr"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-1.5 text-xs font-code tabular-nums rounded-lg border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-left"
                  />
                </div>
                <div className="lg:col-span-4 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5 pt-1">
                  <div className="font-code tabular-nums font-semibold text-teal-800 dark:text-teal-300">
                    معادل تومانی نرخ: {formatMoney(exchangeRate, 'IRT')}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    اقلام به <strong>{currencyCode}</strong> وارد و سند حسابداری معادل ریالی ثبت می‌شود.
                  </div>
                </div>
              </>
            ) : (
              <div className="lg:col-span-8 text-[11px] text-slate-500 dark:text-slate-400 pt-3 lg:pt-4">
                فاکتور با ارز پایه دفاتر (ریال) صادر می‌شود. برای صدور فاکتور ارزی واردات یا صادرات، ارز موردنظر (مثلاً دلار، یورو، درهم یا یوان) را انتخاب کنید.
              </div>
            )}
          </div>

          {/* Multi-Unit Yarn Line Items */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isFxMode
                  ? `اقلام نخ فاکتور (فی هر کیلوگرم به ${currencyCode})`
                  : 'اقلام نخ فاکتور (نرخ هر کیلوگرم به ریال)'}
              </span>
              <div className="flex flex-wrap items-center gap-4">
                {(invoiceType === 'sale' || invoiceType === 'waste') && (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preventNegativeStock}
                      onChange={(e) => setPreventNegativeStock(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    جلوگیری از فروش منفی انبار
                  </label>
                )}
                {invoiceType !== 'waste' && (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyVat}
                      onChange={(e) => setApplyVat(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    محاسبه ۱۰٪ مالیات ارزش افزوده
                  </label>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setDraftItems((prev) => [
                      ...prev,
                      makeInitialDraftRow(products[0]?.id ?? '', invoiceType, 5, currencyCode, exchangeRate),
                    ])
                  }
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                >
                  + افزودن ردیف نخ
                </button>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 overflow-visible">
              <div className="hidden lg:grid lg:grid-cols-12 gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 text-[11px] font-medium text-slate-500 rounded-t-lg">
                <div className={showBobbinCol ? 'col-span-3' : showCartonCol ? 'col-span-4' : 'col-span-5'}>
                  نخ / کالا (جستجوی فازی نام، کد یا لات)
                </div>
                {showCartonCol && <div className="col-span-1">کارتن/عدل</div>}
                {showBobbinCol && <div className="col-span-1">بوبین/دوک</div>}
                <div className="col-span-2">وزن کل (کیلوگرم)</div>
                <div className="col-span-2">
                  {isFxMode ? `فی هر کیلو (${currencyCode})` : 'فی هر کیلو (ریال)'}
                </div>
                <div className="col-span-1">تخفیف</div>
                <div className="col-span-2 text-left">جمع ردیف</div>
              </div>
              {draftItems.map((row, idx) => {
                const comp = computedItems[idx];
                const prod = products.find((p) => p.id === row.productId);
                const exceedsStock =
                  (invoiceType === 'sale' || invoiceType === 'waste') &&
                  prod &&
                  row.quantity > prod.stock + 0.001;
                return (
                  <div
                    key={idx}
                    className="p-3 grid grid-cols-1 lg:grid-cols-12 gap-2 items-start text-xs"
                  >
                    <div
                      className={
                        showBobbinCol
                          ? 'lg:col-span-3'
                          : showCartonCol
                            ? 'lg:col-span-4'
                            : 'lg:col-span-5'
                      }
                    >
                      <label className="lg:hidden block text-[11px] text-slate-500 mb-1">
                        نخ / کالا
                      </label>
                      <SmartSearchCombobox
                        mode="picker"
                        compact
                        options={productPickerOptions}
                        value={row.productId}
                        onSelect={(opt) => handleProductChange(idx, opt.id)}
                        placeholder="جستجوی نام، نمره یا کد نخ..."
                      />
                      {prod && (
                        <div className="text-[10.5px] text-slate-500 mt-1 space-y-1">
                          <div>
                            {row.lotCode || prod.lotNumber ? `لات ${row.lotCode || prod.lotNumber}` : prod.category}
                            {prod.kgPerCarton
                              ? ` · هر ${prod.secondaryUnit || 'کارتن'} ${formatWeight(prod.kgPerCarton)} کیلو`
                              : ''}
                          </div>
                          {(() => {
                            const prodLots = dyeLots.filter(
                              (l) => l.productId === prod.id && l.remainingWeightKg > 0
                            );
                            if (prodLots.length === 0) return null;
                            return (
                              <select
                                value={row.lotCode || ''}
                                onChange={(e) =>
                                  setDraftItems((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, lotCode: e.target.value || undefined } : r
                                    )
                                  )
                                }
                                className="w-full px-2 py-1 text-[10.5px] font-code rounded border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/30 text-slate-800 dark:text-slate-200"
                              >
                                <option value="">انتخاب شماره لات / شید رنگرزی (اختیاری)</option>
                                {prodLots.map((l) => (
                                  <option key={l.id} value={l.lotCode}>
                                    {l.lotCode} · شید {l.shadeCode} ({formatWeight(l.remainingWeightKg)} کیلو)
                                  </option>
                                ))}
                              </select>
                            );
                          })()}
                        </div>
                      )}
                      {exceedsStock && (
                        <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                          هشدار: وزن درخواستی بیشتر از موجودی ({formatWeight(prod.stock)}{' '}
                          {prod.unit}) است.
                        </div>
                      )}
                    </div>

                    {showCartonCol && (
                      <div className="lg:col-span-1">
                        <label className="lg:hidden block text-[11px] text-slate-500 mb-1">
                          {prod?.secondaryUnit || 'کارتن'}
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          value={row.cartonCount}
                          onChange={(e) => handleCartonChange(idx, Number(e.target.value))}
                          className="w-full px-2 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        />
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {prod?.secondaryUnit || 'کارتن'}
                        </div>
                      </div>
                    )}

                    {showBobbinCol && (
                      <div className="lg:col-span-1">
                        <label className="lg:hidden block text-[11px] text-slate-500 mb-1">
                          {prod?.bobbinUnit || 'بوبین'}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={row.bobbinCount}
                          onChange={(e) =>
                            setDraftItems((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, bobbinCount: Number(e.target.value) } : r
                              )
                            )
                          }
                          className="w-full px-2 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        />
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {prod?.bobbinUnit || 'بوبین'}
                        </div>
                      </div>
                    )}

                    <div className="lg:col-span-2">
                      <label className="lg:hidden block text-[11px] text-slate-500 mb-1">
                        وزن کل (کیلوگرم)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min={0.01}
                        value={row.quantity}
                        onChange={(e) => handleKgChange(idx, Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 font-code font-semibold rounded-lg border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      />
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {prod?.unit || 'کیلوگرم'} (باسکول)
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <label className="lg:hidden block text-[11px] text-slate-500 mb-1">
                        {isFxMode ? `فی هر کیلو (${currencyCode})` : 'فی هر کیلو (ریال)'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={isFxMode ? 'any' : 1000}
                        dir="ltr"
                        value={row.unitPrice}
                        onChange={(e) =>
                          setDraftItems((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, unitPrice: Number(e.target.value) } : r
                            )
                          )
                        }
                        className="w-full px-2.5 py-1.5 font-code tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-left"
                      />
                      {isFxMode && comp && (
                        <div className="text-[10px] text-slate-400 mt-0.5 font-code tabular-nums">
                          {formatMoney(comp.unitPrice, unit)}
                        </div>
                      )}
                      {(() => {
                        const effectiveIrr = isFxMode
                          ? convertForeignToIrr(row.unitPrice, exchangeRate)
                          : row.unitPrice;
                        const belowCost =
                          (invoiceType === 'sale' || invoiceType === 'proforma') &&
                          prod &&
                          effectiveIrr > 0 &&
                          effectiveIrr < prod.buyPrice;
                        const lastPrice =
                          prod && partyId
                            ? getLastPriceForPartyProduct(partyId, prod.id, invoiceType, invoices)
                            : null;
                        return (
                          <div className="mt-1 space-y-0.5">
                            {belowCost && (
                              <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                هشدار: زیر بهای خرید ({formatMoney(prod.buyPrice, unit, false)})!
                              </div>
                            )}
                            {lastPrice && (
                              <button
                                type="button"
                                onClick={() => {
                                  const nextVal =
                                    isFxMode && exchangeRate > 0
                                      ? convertIrrToForeign(lastPrice.unitPrice, exchangeRate, fxDecimals)
                                      : lastPrice.unitPrice;
                                  setDraftItems((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, unitPrice: nextVal } : r))
                                  );
                                }}
                                title={`اعمال آخرین نرخ ثبت‌شده در فاکتور ${lastPrice.invoiceNumber} (${lastPrice.date})`}
                                className="text-[10px] text-teal-700 dark:text-teal-400 hover:underline font-code"
                              >
                                آخرین نرخ این مشتری: {formatMoney(lastPrice.unitPrice, unit, false)}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    <div className="lg:col-span-1">
                      <label className="lg:hidden block text-[11px] text-slate-500 mb-1">
                        {isFxMode ? `تخفیف (${currencyCode})` : 'تخفیف'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={isFxMode ? 'any' : 1000}
                        dir="ltr"
                        value={row.discount}
                        onChange={(e) =>
                          setDraftItems((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, discount: Number(e.target.value) } : r
                            )
                          )
                        }
                        className="w-full px-2 py-1.5 font-code tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-left"
                      />
                    </div>

                    <div className="lg:col-span-2 flex items-center justify-between lg:justify-end gap-2 pt-1.5">
                      <div className="text-left">
                        {isFxMode && comp?.foreignLineTotal !== undefined && (
                          <div className="font-code tabular-nums font-bold text-teal-800 dark:text-teal-300">
                            {formatForeignMoney(comp.foreignLineTotal, currencyCode, currencies, fxDecimals)}
                          </div>
                        )}
                        <div
                          className={`font-code tabular-nums ${
                            isFxMode
                              ? 'text-[10.5px] text-slate-500 dark:text-slate-400'
                              : 'font-semibold text-slate-900 dark:text-white'
                          }`}
                        >
                          {formatMoney(comp?.lineTotal ?? 0, unit)}
                        </div>
                      </div>
                      {draftItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraftItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded"
                          title="حذف ردیف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Settlement & Totals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            {invoiceType !== 'waste' ? (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  نحوه تسویه فاکتور (مبالغ به ریال — مابقی به‌صورت نسیه ثبت می‌شود)
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">نقدی (صندوق)</label>
                    <input
                      type="number"
                      min={0}
                      value={paidCash}
                      onChange={(e) => setPaidCash(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">حواله / بانک</label>
                    <input
                      type="number"
                      min={0}
                      value={paidBank}
                      onChange={(e) => setPaidBank(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">چک صیادی</label>
                    <input
                      type="number"
                      min={0}
                      value={paidCheque}
                      onChange={(e) => setPaidCheque(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaidBank(grandTotal);
                      setPaidCash(0);
                      setPaidCheque(0);
                    }}
                    className="text-xs text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    تسویه کامل بانکی
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPaidBank(0);
                      setPaidCash(0);
                      setPaidCheque(0);
                    }}
                    className="text-xs text-slate-600 dark:text-slate-400 hover:underline"
                  >
                    ثبت تماماً نسیه
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
                در فاکتور ضایعات، وزن نخ ضایعاتی به بهای خرید از انبار کسر شده و سند دوبل «بدهکار: هزینه ضایعات (۸۰۴۰۱) / بستانکار: موجودی انبار (۱۰۵۰۱)» به‌صورت خودکار ثبت می‌شود.
              </div>
            )}

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                <span>
                  جمع وزن:{' '}
                  <strong className="font-code text-slate-900 dark:text-white">
                    {formatWeight(totalWeightKg)} کیلوگرم
                  </strong>
                </span>
                {totalCartons > 0 && (
                  <span>
                    جمع بسته‌بندی:{' '}
                    <strong className="font-code text-teal-700 dark:text-teal-400">
                      {formatWeight(totalCartons)} کارتن/عدل
                    </strong>
                  </span>
                )}
                {totalBobbins > 0 && (
                  <span>
                    تعداد:{' '}
                    <strong className="font-code text-slate-800 dark:text-slate-200">
                      {formatNumber(totalBobbins)} بوبین/دوک
                    </strong>
                  </span>
                )}
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>جمع کل اقلام:</span>
                <span className="font-code tabular-nums">{formatMoney(subtotal, unit)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>تخفیف کل:</span>
                <span className="font-code tabular-nums">{formatMoney(totalDiscount, unit)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>مالیات بر ارزش افزوده (۱۰٪):</span>
                <span className="font-code tabular-nums">{formatMoney(vatTotal, unit)}</span>
              </div>
              {isFxMode && (
                <div className="flex justify-between text-sm font-bold text-teal-800 dark:text-teal-300 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span>جمع کل ارزی ({currencyCode}):</span>
                  <span className="font-code tabular-nums">
                    {formatForeignMoney(foreignGrandTotal, currencyCode, currencies, fxDecimals)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
                <span>{isFxMode ? 'معادل کل فاکتور (ریال/تومان):' : 'جمع کل فاکتور:'}</span>
                <span className="font-code tabular-nums text-teal-700 dark:text-teal-400">
                  {formatMoney(grandTotal, unit)}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                به حروف: <strong className="text-slate-700 dark:text-slate-300">{numberToPersianWords(grandTotal, unit)}</strong>
              </div>
              {invoiceType !== 'waste' && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>مانده نسیه طرف‌حساب:</span>
                  <span className="font-code tabular-nums font-semibold">
                    {formatMoney(creditAmount, unit)}
                  </span>
                </div>
              )}
            </div>
          </div>

            {matchedVolumeDiscountRule && (
              <div className="p-3 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-emerald-900 dark:text-emerald-200">
                  <strong>تخفیف پلکانی حجمی فعال شد:</strong> {matchedVolumeDiscountRule.title} (حداقل{' '}
                  {formatWeight(matchedVolumeDiscountRule.minWeightKg)} کیلوگرم ←{' '}
                  <strong className="font-code">{toPersianDigits(matchedVolumeDiscountRule.discountPct)}٪</strong> تخفیف)
                </div>
                <button
                  type="button"
                  onClick={() => {
                    applyTierDiscountToRows(matchedVolumeDiscountRule.discountPct);
                    showToast(
                      `تخفیف پلکانی ${toPersianDigits(matchedVolumeDiscountRule.discountPct)}٪ روی کل اقلام فاکتور اعمال شد.`
                    );
                  }}
                  className="px-3 py-1 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white font-semibold whitespace-nowrap"
                >
                  اعمال تخفیف پلکانی ({toPersianDigits(matchedVolumeDiscountRule.discountPct)}٪)
                </button>
              </div>
            )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-500">
              الگوی مودیان: <strong>{MOADIAN_PATTERN_LABELS[moadianPattern].label}</strong> ({moadianType === 'type1' ? 'نوع ۱' : 'نوع ۲'})
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleReserveCurrentInvoice}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                <span>رزرو موقت فاکتور</span>
              </button>
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              >
                انصراف
              </button>
              {invoiceType !== 'waste' && invoiceType !== 'proforma' && (
                <button
                  type="button"
                  onClick={() => setShowSettlementModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/70"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>پنجره امور مالی (F9)</span>
                </button>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
              >
                <FileCheck2 className="w-4 h-4" />
                <span>
                  {invoiceType === 'proforma'
                    ? 'صدور پیش‌فاکتور'
                    : 'تأیید و صدور سند اتوماتیک'}
                </span>
              </button>
            </div>
          </div>
          </div>

          {/* Authentic Holoo Apex 9.6 Automatic Financial Settlement Modal (F9) */}
          {showSettlementModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
              <div className="w-full max-w-xl rounded-xl bg-white dark:bg-slate-900 border-2 border-teal-700/40 shadow-2xl overflow-hidden text-xs">
                <div className="px-5 py-3 bg-slate-800 dark:bg-slate-950 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CreditCard className="w-4 h-4 text-teal-400" />
                    <span>پنجره امور مالی اتوماتیک فاکتور — هلو اپکس ۹.۶ (F9)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSettlementModal(false)}
                    className="p-1 rounded text-slate-300 hover:bg-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-slate-500">مبلغ قابل تسویه فاکتور ({selectedComposerParty?.name})</div>
                      <div className="text-lg font-bold font-code tabular-nums text-teal-700 dark:text-teal-400 mt-0.5">
                        {formatMoney(grandTotal, unit)}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-slate-500">مانده نسیه نهایی</div>
                      <div
                        className={`text-base font-bold font-code tabular-nums mt-0.5 ${
                          creditAmount > 0
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {formatMoney(creditAmount, unit)}
                      </div>
                    </div>
                  </div>

                  {/* Holoo 9.6 One-Click Split Payment Presets */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPaidCash(grandTotal);
                        setPaidBank(0);
                        setPaidCheque(0);
                      }}
                      className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                    >
                      کل نقدی صندوق
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaidCash(0);
                        setPaidBank(grandTotal);
                        setPaidCheque(0);
                      }}
                      className="px-2.5 py-1.5 rounded-md border border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold"
                    >
                      کل کارتخوان POS / واریز بانکی
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaidCash(0);
                        setPaidBank(Math.round(grandTotal / 2));
                        setPaidCheque(grandTotal - Math.round(grandTotal / 2));
                      }}
                      className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                    >
                      ۵۰٪ بانک + ۵۰٪ چک
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaidCash(0);
                        setPaidBank(0);
                        setPaidCheque(grandTotal);
                      }}
                      className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                    >
                      کل چک صیادی
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaidCash(0);
                        setPaidBank(0);
                        setPaidCheque(0);
                      }}
                      className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                    >
                      تماماً نسیه
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">نقدی (صندوق — ۱۰۱۰۱)</label>
                      <input
                        type="number"
                        min={0}
                        dir="ltr"
                        value={paidCash}
                        onChange={(e) => setPaidCash(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-3 py-2 font-code text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">کارتخوان POS / بانک (۱۰۲۰۱)</label>
                      <input
                        type="number"
                        min={0}
                        dir="ltr"
                        value={paidBank}
                        onChange={(e) => setPaidBank(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-3 py-2 font-code text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">چک صیادی (۱۰۴۰۱/۳۰۲۰۱)</label>
                      <input
                        type="number"
                        min={0}
                        dir="ltr"
                        value={paidCheque}
                        onChange={(e) => setPaidCheque(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-3 py-2 font-code text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowSettlementModal(false)}
                      className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      بازگشت به اقلام
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-5 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                    >
                      <FileCheck2 className="w-4 h-4" />
                      <span>ثبت قطعی فاکتور و سند مالی</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
      )}

      {/* Invoices Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-medium">شماره فاکتور</th>
                <th className="py-3 px-4 font-medium">نوع و وضعیت</th>
                <th className="py-3 px-4 font-medium">تاریخ</th>
                <th className="py-3 px-4 font-medium">طرف‌حساب</th>
                <th className="py-3 px-4 font-medium">وزن / بسته‌بندی</th>
                <th className="py-3 px-4 font-medium text-left">جمع کل</th>
                <th className="py-3 px-4 font-medium text-left">مانده نسیه</th>
                <th className="py-3 px-4 font-medium">عملیات و ارسال</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    هیچ فاکتوری با فیلتر انتخابی یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const isCancelled = inv.status === 'cancelled';
                  const rowKg = inv.items.reduce((s, it) => s + it.quantity, 0);
                  const rowCartons = inv.items.reduce((s, it) => s + (it.cartonCount ?? 0), 0);
                  const quickShare = buildInvoiceSharePayload(inv);
                  return (
                    <tr
                      key={inv.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                        isCancelled
                          ? 'opacity-55'
                          : highlightedInvoiceId === inv.id
                            ? 'bg-teal-50/70 dark:bg-teal-950/30'
                            : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-code font-semibold text-slate-900 dark:text-white">
                        <span className={isCancelled ? 'line-through' : ''}>
                          {inv.invoiceNumber}
                        </span>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {inv.taxSerial || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-slate-800 dark:text-slate-200 font-medium">
                          {TYPE_LABELS[inv.invoiceType]}
                        </div>
                        <div
                          className={`text-[11px] ${
                            isCancelled
                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : inv.status === 'settled'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {STATUS_LABELS[inv.status]}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-code text-slate-600 dark:text-slate-400">
                        {toPersianDigits(inv.date)}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100 max-w-[200px] truncate">
                        {inv.partyName}
                      </td>
                      <td className="py-3 px-4 font-code whitespace-nowrap">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {formatWeight(rowKg)} کیلو
                        </div>
                        {rowCartons > 0 && (
                          <div className="text-[10.5px] text-slate-500">
                            {formatWeight(rowCartons)} کارتن/عدل
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums font-semibold text-slate-900 dark:text-white">
                        <div>{formatMoney(inv.grandTotal, unit, false)}</div>
                        {isForeignCurrency(inv.currencyCode) &&
                          inv.foreignGrandTotal !== undefined && (
                            <div className="text-[10.5px] font-semibold text-teal-700 dark:text-teal-400">
                              {formatForeignMoney(inv.foreignGrandTotal, inv.currencyCode!, currencies)}
                            </div>
                          )}
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums text-amber-700 dark:text-amber-400">
                        {formatMoney(inv.creditAmount, unit, false)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPrintInvoice(inv)}
                            className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 hover:underline font-medium"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>چاپ / طراحی</span>
                          </button>
                          <a
                            href={quickShare.whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="ارسال خلاصه فاکتور در واتساپ"
                            className="p-1 rounded text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                          <a
                            href={quickShare.telegramUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="ارسال خلاصه فاکتور در تلگرام"
                            className="p-1 rounded text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </a>
                          {inv.invoiceType === 'proforma' && !isCancelled && (
                            <button
                              onClick={() => convertProformaToSale(inv.id)}
                              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline font-medium"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span>تبدیل</span>
                            </button>
                          )}
                          {inv.invoiceType === 'sale' && !isCancelled && (
                            <button
                              onClick={() => openCorrectiveComposer(inv)}
                              title="صدور صورتحساب اصلاحی سامانه مودیان متصل به این فاکتور"
                              className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-400 hover:underline font-medium"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                              <span>اصلاحی</span>
                            </button>
                          )}
                          {!isCancelled && (
                            <button
                              onClick={() => void handleCancelInvoiceWithMoadian(inv)}
                              className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 hover:underline font-medium"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>ابطال</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customizable Official Printable & Shareable Invoice Modal */}
      {printInvoice && printShare && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/65 p-3 md:p-6 overflow-y-auto">
          <div className="w-full max-w-5xl space-y-3 my-auto">
            {/* Top Live Customizer & Quick Actions Bar (no-print) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3 no-print">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPrintCustomizer((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                      showPrintCustomizer
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>طراحی و سفارشی‌سازی زنده قالب فاکتور</span>
                  </button>
                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    قالب فعلی: <strong>{TEMPLATE_LABELS[printSettings.template].title}</strong> ·{' '}
                    {UNIT_MODE_LABELS[printSettings.unitDisplayMode].title}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <a
                    href={printShare.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>ارسال واتساپ</span>
                  </a>
                  <a
                    href={printShare.telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>تلگرام</span>
                  </a>
                  <a
                    href={buildSmsUrl(printParty?.phone, printShare.text)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>پیامک</span>
                  </a>
                  {printInvoice.invoiceType === 'sale' && printInvoice.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => openCorrectiveComposer(printInvoice)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                    >
                      <FileEdit className="w-3.5 h-3.5" />
                      <span>اصلاحی مودیان</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopyText(printShare.text, 'متن کامل فاکتور')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>کپی متن</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const json = buildMoadianInvoiceJson(printInvoice, profile, printParty);
                      const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `moadian-${printInvoice.invoiceNumber}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      showToast(`فایل JSON سامانه مودیان فاکتور ${printInvoice.invoiceNumber} دانلود شد.`);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON مودیان</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>چاپ / PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintInvoice(null)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="بستن"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {showPrintCustomizer && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">قالب فاکتور</label>
                    <select
                      value={printSettings.template}
                      onChange={(e) =>
                        updatePrintSettings({ template: e.target.value as InvoiceTemplateStyle })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {Object.entries(TEMPLATE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">تعداد واحد در چاپ</label>
                    <select
                      value={printSettings.unitDisplayMode}
                      onChange={(e) =>
                        updatePrintSettings({ unitDisplayMode: e.target.value as InvoiceUnitMode })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {Object.entries(UNIT_MODE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">ابعاد کاغذ</label>
                    <select
                      value={printSettings.paperSize}
                      onChange={(e) =>
                        updatePrintSettings({ paperSize: e.target.value as InvoicePaperSize })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {Object.entries(PAPER_SIZE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">رنگ سربرگ</label>
                    <div className="flex items-center gap-1.5 pt-1">
                      {(Object.keys(ACCENT_THEMES) as InvoiceAccentColor[]).map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => updatePrintSettings({ accentColor: col })}
                          title={ACCENT_THEMES[col].label}
                          className={`w-6 h-6 rounded-md ${ACCENT_THEMES[col].swatch} ${
                            printSettings.accentColor === col
                              ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-4 flex flex-wrap items-center gap-4 pt-1 text-[11.5px] text-slate-700 dark:text-slate-300">
                    {(
                      [
                        ['showSku', 'کد کالا'],
                        ['showLotAndOrigin', 'شماره لات'],
                        ['showDiscountColumn', 'ستون تخفیف'],
                        ['showVatColumn', 'ستون مالیات ۱۰٪'],
                        ['showPartyBalance', 'مانده قبلی و جدید مشتری'],
                        ['showAmountInWords', 'مبلغ به حروف فارسی'],
                        ['showSignatures', 'کادر مهر و امضا'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={printSettings[key]}
                          onChange={(e) => updatePrintSettings({ [key]: e.target.checked })}
                          className="rounded border-slate-300 text-teal-700"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Live Printable Sheet */}
            <div
              className={`w-full ${paperMaxWidthClass} mx-auto rounded-xl bg-white text-slate-900 border ${
                printSettings.template === 'official_tax'
                  ? 'border-2 border-slate-900'
                  : 'border-slate-300'
              } p-6 md:p-8 space-y-5 print-container shadow-xl`}
            >
              {/* Header */}
              <div
                className={`flex items-start justify-between gap-4 pb-4 ${
                  printSettings.template === 'modern_textile'
                    ? `${accentTheme.headerBg} -mx-6 md:-mx-8 -mt-6 md:-mt-8 px-6 md:px-8 pt-6 pb-5 rounded-t-xl`
                    : `border-b-2 ${accentTheme.border}`
                }`}
              >
                <div className="space-y-1">
                  <h3 className="text-base md:text-lg font-extrabold">{profile.companyName}</h3>
                  <div
                    className={`text-[11px] flex flex-wrap gap-2 ${
                      printSettings.template === 'modern_textile'
                        ? 'text-white/85'
                        : 'text-slate-600'
                    }`}
                  >
                    <span>شناسه ملی: {toPersianDigits(profile.nationalId || '-')}</span>
                    <span>·</span>
                    <span>کد اقتصادی: {toPersianDigits(profile.economicCode || '-')}</span>
                  </div>
                  {printSettings.sellerAddress && (
                    <div
                      className={`text-[11px] ${
                        printSettings.template === 'modern_textile'
                          ? 'text-white/80'
                          : 'text-slate-500'
                      }`}
                    >
                      {printSettings.sellerAddress}
                      {printSettings.sellerPhone ? ` · تلفن: ${printSettings.sellerPhone}` : ''}
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-3 shrink-0">
                  <div className="text-left text-xs space-y-1 font-code">
                    <div className="text-sm font-bold font-sans">
                      {printSettings.customTitle || TYPE_LABELS[printInvoice.invoiceType]}{' '}
                      {printInvoice.status === 'cancelled'
                        ? '(ابطالی مودیان)'
                        : moadianLinks[printInvoice.id]?.subject === 'corrective'
                          ? '(اصلاحی مودیان)'
                          : ''}
                    </div>
                    <div>شماره: {printInvoice.invoiceNumber}</div>
                    <div>تاریخ: {toPersianDigits(printInvoice.date)}</div>
                    {printSettings.showTaxQrBox && (
                      <div className="text-[10.5px] opacity-95">
                        شناسه ۲۲ رقمی مودیان:{' '}
                        <strong>
                          {moadianLinks[printInvoice.id]?.taxId22 ||
                            generateMoadianTaxId22(
                              printInvoice.invoiceNumber,
                              printInvoice.date,
                              profile.economicCode
                            )}
                        </strong>
                      </div>
                    )}
                    {moadianLinks[printInvoice.id]?.referenceTaxId22 && (
                      <div className="text-[10px] opacity-85">
                        شناسه مرجع: {moadianLinks[printInvoice.id]?.referenceTaxId22}
                      </div>
                    )}
                  </div>
                  {printSettings.showTaxQrBox && (
                    <div className="bg-white p-1 rounded border border-slate-300 shrink-0">
                      <MoadianQrCode
                        value={`MOADIAN|${
                          moadianLinks[printInvoice.id]?.taxId22 ||
                          generateMoadianTaxId22(
                            printInvoice.invoiceNumber,
                            printInvoice.date,
                            profile.economicCode
                          )
                        }|${profile.economicCode || ''}|${printInvoice.grandTotal}|${printInvoice.date}`}
                        size={64}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Buyer & Warehouse Details */}
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs p-3.5 rounded-lg border ${
                  printSettings.template === 'holoo_classic'
                    ? 'bg-white border-slate-400'
                    : `${accentTheme.softBg} border-slate-200`
                }`}
              >
                <div className="space-y-1">
                  <div>
                    <span className="text-slate-500">خریدار / طرف‌حساب: </span>
                    <span className="font-bold">{printInvoice.partyName}</span>
                  </div>
                  {printParty?.nationalId && (
                    <div className="text-[11px] text-slate-600 font-code">
                      شناسه ملی: {toPersianDigits(printParty.nationalId)}
                      {printParty.economicCode
                        ? ` · کد اقتصادی: ${toPersianDigits(printParty.economicCode)}`
                        : ''}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <div>
                    <span className="text-slate-500">انبار تحویل: </span>
                    <span className="font-semibold">{printInvoice.warehouse}</span>
                  </div>
                  {isForeignCurrency(printInvoice.currencyCode) && printInvoice.exchangeRate && (
                    <div className="text-[11px] font-code text-teal-800 font-semibold">
                      ارز فاکتور: {printInvoice.currencyCode} · نرخ برابری روز:{' '}
                      {formatMoney(printInvoice.exchangeRate, unit)}
                    </div>
                  )}
                  {printParty?.phone && (
                    <div className="text-[11px] text-slate-600 font-code">
                      تلفن: {toPersianDigits(printParty.phone)}
                      {printParty.address ? ` · ${printParty.address}` : ''}
                    </div>
                  )}
                </div>
              </div>

              {/* Multi-Unit Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border border-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                      <th className="p-2 border-l border-slate-300">ردیف</th>
                      {printSettings.showSku && (
                        <th className="p-2 border-l border-slate-300">کد کالا</th>
                      )}
                      <th className="p-2 border-l border-slate-300">شرح نخ / مشخصات</th>
                      {showCartonCol && (
                        <th className="p-2 border-l border-slate-300 text-center">کارتن/عدل</th>
                      )}
                      {showBobbinCol && (
                        <th className="p-2 border-l border-slate-300 text-center">بوبین/دوک</th>
                      )}
                      <th className="p-2 border-l border-slate-300 text-center">وزن (کیلوگرم)</th>
                      <th className="p-2 border-l border-slate-300 text-left">فی هر کیلو</th>
                      {printSettings.showDiscountColumn && (
                        <th className="p-2 border-l border-slate-300 text-left">تخفیف</th>
                      )}
                      {printSettings.showVatColumn && (
                        <th className="p-2 border-l border-slate-300 text-left">مالیات ۱۰٪</th>
                      )}
                      <th className="p-2 text-left">جمع کل ({unit === 'IRT' ? 'تومان' : 'ریال'})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {printInvoice.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2 border-l border-slate-200 font-code text-center">
                          {toPersianDigits(idx + 1)}
                        </td>
                        {printSettings.showSku && (
                          <td className="p-2 border-l border-slate-200 font-code text-[11px]">
                            {it.sku}
                          </td>
                        )}
                        <td className="p-2 border-l border-slate-200">
                          <div className="font-semibold">{it.productName}</div>
                          {printSettings.showLotAndOrigin && it.lotNumber && (
                            <div className="text-[10.5px] text-slate-500 font-code">
                              لات: {it.lotNumber}
                            </div>
                          )}
                        </td>
                        {showCartonCol && (
                          <td className="p-2 border-l border-slate-200 font-code text-center">
                            {it.cartonCount && it.cartonCount > 0
                              ? `${formatWeight(it.cartonCount)} ${it.secondaryUnit || 'کارتن'}`
                              : '—'}
                          </td>
                        )}
                        {showBobbinCol && (
                          <td className="p-2 border-l border-slate-200 font-code text-center">
                            {it.bobbinCount && it.bobbinCount > 0
                              ? `${formatNumber(it.bobbinCount)} ${it.bobbinUnit || 'بوبین'}`
                              : '—'}
                          </td>
                        )}
                        <td className="p-2 border-l border-slate-200 font-code font-bold text-center">
                          {formatWeight(it.quantity)} {it.unit}
                        </td>
                        <td className="p-2 border-l border-slate-200 font-code tabular-nums text-left">
                          <div>{formatMoney(it.unitPrice, unit, false)}</div>
                          {isForeignCurrency(printInvoice.currencyCode) &&
                            it.foreignUnitPrice !== undefined && (
                              <div className="text-[10px] text-teal-700">
                                {formatForeignNumber(it.foreignUnitPrice, 2)}{' '}
                                {printInvoice.currencyCode}
                              </div>
                            )}
                        </td>
                        {printSettings.showDiscountColumn && (
                          <td className="p-2 border-l border-slate-200 font-code tabular-nums text-left">
                            {it.discount > 0 ? formatMoney(it.discount, unit, false) : '—'}
                          </td>
                        )}
                        {printSettings.showVatColumn && (
                          <td className="p-2 border-l border-slate-200 font-code tabular-nums text-left">
                            {it.vatAmount > 0 ? formatMoney(it.vatAmount, unit, false) : '—'}
                          </td>
                        )}
                        <td className="p-2 text-left font-code tabular-nums font-bold">
                          <div>{formatMoney(it.lineTotal, unit, false)}</div>
                          {isForeignCurrency(printInvoice.currencyCode) &&
                            it.foreignLineTotal !== undefined && (
                              <div className="text-[10px] text-teal-700">
                                {formatForeignNumber(it.foreignLineTotal, 2)}{' '}
                                {printInvoice.currencyCode}
                              </div>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold">
                      <td
                        colSpan={printSettings.showSku ? 3 : 2}
                        className="p-2 border-l border-slate-300"
                      >
                        جمع کل مقادیر و مبالغ
                      </td>
                      {showCartonCol && (
                        <td className="p-2 border-l border-slate-300 font-code text-center">
                          {formatWeight(
                            printInvoice.items.reduce((s, it) => s + (it.cartonCount ?? 0), 0)
                          )}
                        </td>
                      )}
                      {showBobbinCol && (
                        <td className="p-2 border-l border-slate-300 font-code text-center">
                          {formatNumber(
                            printInvoice.items.reduce((s, it) => s + (it.bobbinCount ?? 0), 0)
                          )}
                        </td>
                      )}
                      <td className="p-2 border-l border-slate-300 font-code text-center">
                        {formatWeight(
                          printInvoice.items.reduce((s, it) => s + it.quantity, 0)
                        )}{' '}
                        کیلو
                      </td>
                      <td className="p-2 border-l border-slate-300" />
                      {printSettings.showDiscountColumn && (
                        <td className="p-2 border-l border-slate-300 font-code text-left">
                          {formatMoney(printInvoice.discount, unit, false)}
                        </td>
                      )}
                      {printSettings.showVatColumn && (
                        <td className="p-2 border-l border-slate-300 font-code text-left">
                          {formatMoney(printInvoice.vatAmount, unit, false)}
                        </td>
                      )}
                      <td className="p-2 font-code text-left">
                        {formatMoney(printInvoice.grandTotal, unit, false)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Amount in Words + Financial Summary + Holoo Customer Balance Box */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                <div className="md:col-span-7 space-y-2.5 text-xs">
                  {printSettings.showAmountInWords && (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-slate-500">مبلغ قابل پرداخت به حروف: </span>
                      <strong className="text-slate-900">
                        {numberToPersianWords(printInvoice.grandTotal, unit)}
                      </strong>
                    </div>
                  )}

                  {printSettings.showPartyBalance && printParty && (
                    <div className="p-3 rounded-lg border border-slate-300 grid grid-cols-2 gap-3 text-[11.5px]">
                      <div>
                        <div className="text-slate-500">مانده حساب قبل از این فاکتور:</div>
                        <div className="font-code font-bold mt-0.5">
                          {formatMoney(Math.abs(printPartyPrevBalance), unit)}{' '}
                          {printPartyPrevBalance === 0
                            ? '(تسویه)'
                            : printPartyPrevBalance > 0
                              ? '(بدهکار)'
                              : '(بستانکار)'}
                        </div>
                      </div>
                      <div className="border-r border-slate-200 pr-3">
                        <div className="text-slate-500">مانده کل فعلی طرف‌حساب:</div>
                        <div className={`font-code font-bold mt-0.5 ${accentTheme.text}`}>
                          {formatMoney(Math.abs(printPartyNewBalance), unit)}{' '}
                          {printPartyNewBalance === 0
                            ? '(تسویه)'
                            : printPartyNewBalance > 0
                              ? '(بدهکار)'
                              : '(بستانکار)'}
                        </div>
                      </div>
                    </div>
                  )}

                  {printSettings.bankInfo && (
                    <div className="text-[11px] text-slate-700 p-2.5 rounded border border-dashed border-slate-300">
                      <strong>مشخصات واریز وجه: </strong>
                      {printSettings.bankInfo}
                    </div>
                  )}

                  {printSettings.footerTerms && (
                    <div className="text-[11px] text-slate-500 leading-5">
                      {printSettings.footerTerms}
                    </div>
                  )}
                </div>

                <div className="md:col-span-5 text-xs space-y-1.5 border border-slate-300 rounded-lg p-3.5">
                  <div className="flex justify-between">
                    <span className="text-slate-600">جمع کل اقلام:</span>
                    <span className="font-code tabular-nums">
                      {formatMoney(printInvoice.subtotal, unit)}
                    </span>
                  </div>
                  {printInvoice.discount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">تخفیف:</span>
                      <span className="font-code tabular-nums">
                        {formatMoney(printInvoice.discount, unit)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600">مالیات ارزش افزوده (۱۰٪):</span>
                    <span className="font-code tabular-nums">
                      {formatMoney(printInvoice.vatAmount, unit)}
                    </span>
                  </div>
                  {isForeignCurrency(printInvoice.currencyCode) &&
                    printInvoice.foreignGrandTotal !== undefined && (
                      <div className="flex justify-between font-bold text-xs pt-2 border-t border-slate-200 text-teal-800">
                        <span>جمع کل ارزی ({printInvoice.currencyCode}):</span>
                        <span className="font-code tabular-nums">
                          {formatForeignMoney(
                            printInvoice.foreignGrandTotal,
                            printInvoice.currencyCode!,
                            currencies
                          )}
                        </span>
                      </div>
                    )}
                  <div
                    className={`flex justify-between font-extrabold text-sm pt-2 border-t border-slate-300 ${accentTheme.text}`}
                  >
                    <span>
                      {isForeignCurrency(printInvoice.currencyCode)
                        ? 'معادل قابل پرداخت:'
                        : 'قابل پرداخت:'}
                    </span>
                    <span className="font-code tabular-nums">
                      {formatMoney(printInvoice.grandTotal, unit)}
                    </span>
                  </div>
                  {printInvoice.paidCash + printInvoice.paidBank + printInvoice.paidCheque > 0 && (
                    <div className="flex justify-between text-[11px] text-emerald-700 pt-1">
                      <span>دریافت‌شده (نقد/بانک/چک):</span>
                      <span className="font-code tabular-nums">
                        {formatMoney(
                          printInvoice.paidCash + printInvoice.paidBank + printInvoice.paidCheque,
                          unit
                        )}
                      </span>
                    </div>
                  )}
                  {printInvoice.creditAmount > 0 && (
                    <div className="flex justify-between text-[11px] text-amber-800">
                      <span>مانده نسیه این فاکتور:</span>
                      <span className="font-code tabular-nums font-bold">
                        {formatMoney(printInvoice.creditAmount, unit)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Signatures */}
              {printSettings.showSignatures && (
                <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-200 text-center text-xs text-slate-600">
                  <div>
                    <div className="font-semibold text-slate-800">مهر و امضای فروشنده</div>
                    <div className="mt-8 border-b border-dotted border-slate-400 mx-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">تحویل‌دهنده انبار و باسکول</div>
                    <div className="mt-8 border-b border-dotted border-slate-400 mx-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">مهر و امضای خریدار / راننده</div>
                    <div className="mt-8 border-b border-dotted border-slate-400 mx-4" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
