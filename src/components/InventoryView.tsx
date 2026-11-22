import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  Barcode,
  Calculator,
  CheckSquare,
  ClipboardCheck,
  Download,
  Edit3,
  FileSpreadsheet,
  Layers,
  Maximize2,
  Percent,
  Plus,
  Printer,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { useWorkspaceExtensions } from '../context/WorkspaceExtensionsContext';
import { Product } from '../types/accounting';
import {
  exportToCsv,
  formatMoney,
  formatNumber,
  formatWeight,
  toPersianDigits,
} from '../lib/format';
import { fuzzyFilterAndRank } from '../lib/fuzzySearch';
import {
  BulkParsedProductRow,
  computeInventoryIntelligence,
  generateSmartBarcode,
  generateSmartSku,
  parseBulkProductsCsv,
  ProductApexMeta,
} from '../lib/smartIntelligence';
import { FuzzyTableOption, FuzzyTableSearch } from './FuzzyTableSearch';

const YARN_CATEGORIES = [
  'نخ پلی‌استر DTY',
  'نخ پنبه شانه (Combed)',
  'نخ اسپاندکس / لاکرا',
  'نخ ویسکوز رینگ',
  'نخ فیلامنت FDY',
  'نخ ملانژ و پنبه-پلی‌استر',
  'نخ نایلون و صنعتی',
];

const YARN_WAREHOUSES = [
  'انبار مرکزی نخ شادآباد',
  'انبار گمرکی بندرعباس',
  'انبار پخش یزد',
  'انبار نساجی کاشان',
];

const ORIGIN_COUNTRIES = [
  'چین',
  'هند',
  'کره جنوبی',
  'اندونزی',
  'ترکیه',
  'تایوان',
  'پاکستان',
  'ایران',
];

function computeCartons(stockKg: number, kgPerCarton?: number): number {
  if (!kgPerCarton || kgPerCarton <= 0) return 0;
  return Math.round((stockKg / kgPerCarton) * 100) / 100;
}

function computeBobbins(stockKg: number, kgPerCarton?: number, bobbinsPerCarton?: number): number {
  if (!kgPerCarton || kgPerCarton <= 0 || !bobbinsPerCarton || bobbinsPerCarton <= 0) return 0;
  return Math.round((stockKg / kgPerCarton) * bobbinsPerCarton);
}

export const InventoryView: React.FC<{ initialIntent?: string; clearIntent?: () => void }> = ({
  initialIntent,
  clearIntent,
}) => {
  const {
    products,
    invoices,
    importDossiers,
    subcontractJobs,
    vouchers,
    profile,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustProductStockWithVoucher,
    bulkStocktakingWithVoucher,
    bulkUpdateProductPrices,
    transferProductWarehouse,
    showToast,
  } = useAccounting();
  const unit = profile.currencyUnit;

  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id ?? '');
  const [stockEditValue, setStockEditValue] = useState<string>('');
  const [stockInputMode, setStockInputMode] = useState<'kg' | 'carton'>('kg');
  const [stockReason, setStockReason] = useState('شمارش باسکول و انبارگردانی دوره‌ای نخ');
  const [targetWarehouse, setTargetWarehouse] = useState('انبار پخش یزد');
  const [panelTab, setPanelTab] = useState<'kardex' | 'stocktake' | 'transfer'>('stocktake');
  const stockInputRef = useRef<HTMLInputElement | null>(null);

  // Bulk Stocktaking & Bulk Price Update states (Holoo Sherkati Apex)
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkCounts, setBulkCounts] = useState<Record<string, number>>({});
  const [bulkReason, setBulkReason] = useState('انبارگردانی گروهی باسکول انبارهای نخ');
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showFullKardexModal, setShowFullKardexModal] = useState(false);
  const [priceTarget, setPriceTarget] = useState<'sellPrice' | 'buyPrice'>('sellPrice');
  const [pricePercent, setPricePercent] = useState(10);

  // Holoo Apex 9.6 Cloud-Synced Extension Meta (barcode, multi-tier prices, maxStock, binLocation)
  const { productMetaMap: apexMetaMap, upsertProductMetaSynced } = useWorkspaceExtensions();
  const [formTab, setFormTab] = useState<'main' | 'units' | 'pricing' | 'stock'>('main');
  const [barcode, setBarcode] = useState('');
  const [binLocation, setBinLocation] = useState('');
  const [maxStock, setMaxStock] = useState(12000);
  const [wholesalePrice, setWholesalePrice] = useState(2_100_000);
  const [partnerPrice, setPartnerPrice] = useState(2_040_000);
  const [factoryPrice, setFactoryPrice] = useState(1_990_000);

  // Holoo 9.6 Bulk Excel/CSV Product Import & Barcode Label Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvInput, setCsvInput] = useState('');
  const [importingBulk, setImportingBulk] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [barcodeCopies, setBarcodeCopies] = useState(4);

  const parsedImportRows: BulkParsedProductRow[] = useMemo(
    () => parseBulkProductsCsv(csvInput),
    [csvInput]
  );

  const inventoryIntel = useMemo(
    () => computeInventoryIntelligence(products, invoices),
    [products, invoices]
  );

  // Product form (Textile Yarn Multi-Unit)
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState(YARN_CATEGORIES[0]);
  const [warehouse, setWarehouse] = useState(YARN_WAREHOUSES[0]);
  const [itemUnit, setItemUnit] = useState('کیلوگرم');
  const [secondaryUnit, setSecondaryUnit] = useState('کارتن');
  const [kgPerCarton, setKgPerCarton] = useState<number>(30);
  const [bobbinUnit, setBobbinUnit] = useState('بوبین');
  const [bobbinsPerCarton, setBobbinsPerCarton] = useState<number>(6);
  const [yarnCount, setYarnCount] = useState('150/48 DTY');
  const [lotNumber, setLotNumber] = useState('');
  const [originCountry, setOriginCountry] = useState('چین');
  const [buyPrice, setBuyPrice] = useState(1_850_000);
  const [sellPrice, setSellPrice] = useState(2_180_000);
  const [stock, setStock] = useState(3000);
  const [reorderPoint, setReorderPoint] = useState(600);
  const [vatExempt, setVatExempt] = useState(false);

  const applySmartPricingMargin = (marginPct: number) => {
    const base = Math.max(0, buyPrice);
    if (base <= 0) return;
    const cashSell = Math.round((base * (1 + marginPct / 100)) / 1000) * 1000;
    const wholesale = Math.round((cashSell * 0.96) / 1000) * 1000;
    const partner = Math.round((cashSell * 0.93) / 1000) * 1000;
    const factory = Math.round((cashSell * 0.9) / 1000) * 1000;
    setSellPrice(cashSell);
    setWholesalePrice(wholesale);
    setPartnerPrice(partner);
    setFactoryPrice(factory);
  };

  const openCreate = () => {
    const autoSku = generateSmartSku(YARN_CATEGORIES[0], products);
    setEditingProduct(null);
    setFormTab('main');
    setSku(autoSku);
    setBarcode(generateSmartBarcode(autoSku));
    setBinLocation('ردیف A — قفسه ۰۱');
    setName('');
    setCategory(YARN_CATEGORIES[0]);
    setWarehouse(YARN_WAREHOUSES[0]);
    setItemUnit('کیلوگرم');
    setSecondaryUnit('کارتن');
    setKgPerCarton(30);
    setBobbinUnit('بوبین');
    setBobbinsPerCarton(6);
    setYarnCount('150/48');
    setLotNumber('');
    setOriginCountry('چین');
    setBuyPrice(1_850_000);
    setSellPrice(2_180_000);
    setWholesalePrice(2_090_000);
    setPartnerPrice(2_030_000);
    setFactoryPrice(1_970_000);
    setStock(3000);
    setReorderPoint(600);
    setMaxStock(12000);
    setVatExempt(false);
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    const meta = apexMetaMap[p.id] || apexMetaMap[p.sku] || {};
    setEditingProduct(p);
    setFormTab('main');
    setSku(p.sku);
    setBarcode(meta.barcode || generateSmartBarcode(p.sku));
    setBinLocation(meta.binLocation || '');
    setName(p.name);
    setCategory(p.category);
    setWarehouse(p.warehouse);
    setItemUnit(p.unit || 'کیلوگرم');
    setSecondaryUnit(p.secondaryUnit || 'کارتن');
    setKgPerCarton(p.kgPerCarton ?? 30);
    setBobbinUnit(p.bobbinUnit || 'بوبین');
    setBobbinsPerCarton(p.bobbinsPerCarton ?? 6);
    setYarnCount(p.yarnCount || '');
    setLotNumber(p.lotNumber || '');
    setOriginCountry(p.originCountry || '');
    setBuyPrice(p.buyPrice);
    setSellPrice(p.sellPrice);
    setWholesalePrice(meta.wholesalePrice ?? Math.round((p.sellPrice * 0.96) / 1000) * 1000);
    setPartnerPrice(meta.partnerPrice ?? Math.round((p.sellPrice * 0.93) / 1000) * 1000);
    setFactoryPrice(meta.factoryPrice ?? Math.round((p.sellPrice * 0.9) / 1000) * 1000);
    setStock(p.stock);
    setReorderPoint(p.reorderPoint);
    setMaxStock(meta.maxStock ?? Math.max(p.reorderPoint * 8, p.stock * 2));
    setVatExempt(p.vatExempt);
    setShowForm(true);
  };

  const enterBulkMode = () => {
    const initial: Record<string, number> = {};
    products.forEach((p) => {
      initial[p.id] = p.stock;
    });
    setBulkCounts(initial);
    setBulkMode(true);
  };

  useEffect(() => {
    if (!initialIntent) return;
    if (initialIntent === 'new-product') openCreate();
    else if (initialIntent === 'stocktaking') {
      setPanelTab('stocktake');
      enterBulkMode();
    } else if (initialIntent === 'transfer') setPanelTab('transfer');
    else if (initialIntent === 'kardex') setPanelTab('kardex');
    else if (initialIntent === 'bulk-price') setShowPriceModal(true);
    else if (initialIntent === 'bulk-import') setShowImportModal(true);
    else if (initialIntent === 'barcode-print' && products[0]) setBarcodeProduct(products[0]);
    clearIntent?.();
  }, [initialIntent, clearIntent]);

  const warehouses = useMemo(
    () => Array.from(new Set(products.map((p) => p.warehouse))),
    [products]
  );

  // Global Fuzzy Search options for Yarn Inventory
  const productSearchOptions: FuzzyTableOption[] = useMemo(
    () =>
      products.map((p) => {
        const cartons = computeCartons(p.stock, p.kgPerCarton);
        const packHint =
          cartons > 0
            ? ` (${formatWeight(cartons)} ${p.secondaryUnit || 'کارتن'})`
            : '';
        return {
          id: p.id,
          code: p.sku,
          label: p.name,
          sublabel: [
            p.warehouse,
            p.yarnCount ? `نمره ${p.yarnCount}` : p.category,
            p.lotNumber ? `لات ${p.lotNumber}` : '',
            p.originCountry || '',
          ]
            .filter(Boolean)
            .join(' · '),
          meta: `${formatWeight(p.stock)} ${p.unit}${packHint}`,
          metaTone: p.stock <= p.reorderPoint ? 'warning' : 'positive',
          keywords: [
            p.sku,
            p.name,
            p.category,
            p.warehouse,
            p.yarnCount || '',
            p.lotNumber || '',
            p.originCountry || '',
            p.secondaryUnit || '',
            p.bobbinUnit || '',
            String(p.stock),
          ].join(' '),
        };
      }),
    [products]
  );

  const warehouseScopedProducts = useMemo(
    () =>
      products.filter((p) => warehouseFilter === 'all' || p.warehouse === warehouseFilter),
    [products, warehouseFilter]
  );

  const filtered = useMemo(() => {
    const ranked = fuzzyFilterAndRank(warehouseScopedProducts, search, (p) => [
      { text: p.sku, weight: 1.35 },
      { text: p.name, weight: 1.25 },
      { text: p.yarnCount, weight: 1.15 },
      { text: p.lotNumber, weight: 1.15 },
      { text: p.originCountry, weight: 1.0 },
      { text: p.category, weight: 0.95 },
      { text: p.warehouse, weight: 0.9 },
      { text: p.secondaryUnit, weight: 0.8 },
    ]);
    return ranked.map((r) => r.item);
  }, [warehouseScopedProducts, search]);

  const inventoryStats = useMemo(() => {
    let totalValue = 0;
    let totalKg = 0;
    let totalCartons = 0;
    for (const p of products) {
      totalValue += Math.round(p.stock * p.buyPrice);
      totalKg += p.stock;
      totalCartons += computeCartons(p.stock, p.kgPerCarton);
    }
    return { totalValue, totalKg, totalCartons };
  }, [products]);

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? products[0];

  const kardexRows = useMemo(() => {
    if (!selectedProduct) return [];
    const rawMovements: {
      date: string;
      invoiceNumber: string;
      typeLabel: string;
      partyName: string;
      inQty: number;
      outQty: number;
      cartons?: number;
      secondaryUnit?: string;
      unitCostOverride?: number;
      isCostedInbound?: boolean;
    }[] = [];

    // 1. Invoices (Purchases, Sales, Returns, Waste)
    invoices
      .filter((inv) => inv.invoiceType !== 'proforma' && inv.status !== 'cancelled')
      .forEach((inv) => {
        inv.items.forEach((it) => {
          if (it.productId === selectedProduct.id) {
            const isIn = inv.invoiceType === 'purchase' || inv.invoiceType === 'sale_return';
            const netPurchaseUnit =
              it.quantity > 0
                ? Math.round(Math.max(0, it.quantity * it.unitPrice - (it.discount || 0)) / it.quantity)
                : it.unitPrice;
            rawMovements.push({
              date: inv.date,
              invoiceNumber: inv.invoiceNumber,
              typeLabel:
                inv.invoiceType === 'purchase'
                  ? 'ورود (خرید داخلی)'
                  : inv.invoiceType === 'sale'
                    ? 'خروج (فروش)'
                    : inv.invoiceType === 'sale_return'
                      ? 'ورود (برگشت فروش)'
                      : inv.invoiceType === 'waste'
                        ? 'خروج (ضایعات نخ)'
                        : 'خروج (برگشت خرید)',
              partyName: inv.partyName,
              inQty: isIn ? it.quantity : 0,
              outQty: isIn ? 0 : it.quantity,
              cartons: it.cartonCount ?? computeCartons(it.quantity, selectedProduct.kgPerCarton),
              secondaryUnit: it.secondaryUnit || selectedProduct.secondaryUnit || 'کارتن',
              unitCostOverride:
                inv.invoiceType === 'purchase'
                  ? netPurchaseUnit
                  : it.unitCostSnapshot,
              isCostedInbound: inv.invoiceType === 'purchase',
            });
          }
        });
      });

    // 2. Cleared Import Dossiers (Landed Cost Inbound)
    importDossiers
      .filter((d) => d.status === 'cleared')
      .forEach((dos) => {
        dos.items.forEach((it) => {
          if (it.productId === selectedProduct.id && it.weightKg > 0) {
            rawMovements.push({
              date: dos.date,
              invoiceNumber: dos.dossierNumber,
              typeLabel: 'ورود (ترخیص واردات — بهای تمام‌شده)',
              partyName: dos.supplierName,
              inQty: it.weightKg,
              outQty: 0,
              cartons: it.cartonCount || computeCartons(it.weightKg, selectedProduct.kgPerCarton),
              secondaryUnit: selectedProduct.secondaryUnit || 'کارتن',
              unitCostOverride: it.finalUnitCostIrr,
              isCostedInbound: true,
            });
          }
        });
      });

    // 3. Completed Subcontracting Jobs (Raw Yarn Outbound)
    subcontractJobs
      .filter((j) => j.status === 'completed')
      .forEach((job) => {
        if (job.rawProductId === selectedProduct.id && job.sentWeightKg > 0) {
          rawMovements.push({
            date: job.completionDate || job.date,
            invoiceNumber: job.jobNumber,
            typeLabel: 'خروج (ارسال پیمانکاری رنگرزی/تکمیل)',
            partyName: job.contractorName,
            inQty: 0,
            outQty: job.sentWeightKg,
            cartons: computeCartons(job.sentWeightKg, selectedProduct.kgPerCarton),
            secondaryUnit: selectedProduct.secondaryUnit || 'کارتن',
            unitCostOverride: job.rawUnitCostIrr,
          });
        }
      });

    // 4. Stocktaking Adjustment Vouchers directly referencing this product
    vouchers
      .filter((v) => v.referenceId === selectedProduct.id)
      .forEach((v) => {
        const invLine = v.lines.find((l) => l.accountCode === '10501');
        if (!invLine || selectedProduct.buyPrice <= 0) return;
        const amt = invLine.debit > 0 ? invLine.debit : invLine.credit;
        const estQty = Number((amt / selectedProduct.buyPrice).toFixed(2));
        if (estQty <= 0) return;
        const isSurplus = invLine.debit > 0;
        rawMovements.push({
          date: v.date,
          invoiceNumber: `سند #${v.voucherNumber}`,
          typeLabel: isSurplus ? 'ورود (اضافی انبارگردانی)' : 'خروج (کسری انبارگردانی)',
          partyName: selectedProduct.warehouse,
          inQty: isSurplus ? estQty : 0,
          outQty: isSurplus ? 0 : estQty,
          cartons: computeCartons(estQty, selectedProduct.kgPerCarton),
          secondaryUnit: selectedProduct.secondaryUnit || 'کارتن',
          unitCostOverride: selectedProduct.buyPrice,
        });
      });

    rawMovements.sort((a, b) => a.date.localeCompare(b.date));

    // Reconstruct opening quantity so ending running quantity reconciles with current stock
    const netDelta = rawMovements.reduce((s, m) => s + m.inQty - m.outQty, 0);
    const openingQty = Math.max(0, Number((selectedProduct.stock - netDelta).toFixed(2)));
    let runningQty = openingQty;
    let avgUnitCost = selectedProduct.buyPrice;
    let runningValue = Math.round(runningQty * avgUnitCost);

    const ledger: {
      date: string;
      invoiceNumber: string;
      typeLabel: string;
      partyName: string;
      inQty: number;
      inRate: number;
      inTotal: number;
      outQty: number;
      outRate: number;
      outTotal: number;
      balQty: number;
      avgRate: number;
      balValue: number;
      cartons?: number;
      secondaryUnit?: string;
    }[] = [];

    if (openingQty > 0) {
      ledger.push({
        date: 'اول دوره',
        invoiceNumber: 'OPEN',
        typeLabel: 'موجودی اول دوره انبار',
        partyName: selectedProduct.warehouse,
        inQty: openingQty,
        inRate: avgUnitCost,
        inTotal: runningValue,
        outQty: 0,
        outRate: 0,
        outTotal: 0,
        balQty: runningQty,
        avgRate: avgUnitCost,
        balValue: runningValue,
        cartons: computeCartons(openingQty, selectedProduct.kgPerCarton),
        secondaryUnit: selectedProduct.secondaryUnit || 'کارتن',
      });
    }

    for (const m of rawMovements) {
      let inRate = 0;
      let inTotal = 0;
      let outRate = 0;
      let outTotal = 0;

      if (m.inQty > 0) {
        inRate =
          m.isCostedInbound && m.unitCostOverride !== undefined
            ? m.unitCostOverride
            : avgUnitCost;
        inTotal = Math.round(m.inQty * inRate);
        runningQty = Number((runningQty + m.inQty).toFixed(2));
        runningValue += inTotal;
        avgUnitCost = runningQty > 0 ? Math.round(runningValue / runningQty) : avgUnitCost;
      } else if (m.outQty > 0) {
        outRate = m.unitCostOverride ?? avgUnitCost;
        outTotal = Math.round(m.outQty * outRate);
        runningQty = Math.max(0, Number((runningQty - m.outQty).toFixed(2)));
        runningValue = Math.max(0, Math.round(runningQty * avgUnitCost));
      }

      ledger.push({
        date: m.date,
        invoiceNumber: m.invoiceNumber,
        typeLabel: m.typeLabel,
        partyName: m.partyName,
        inQty: m.inQty,
        inRate,
        inTotal,
        outQty: m.outQty,
        outRate,
        outTotal,
        balQty: runningQty,
        avgRate: avgUnitCost,
        balValue: runningValue,
        cartons: m.cartons,
        secondaryUnit: m.secondaryUnit,
      });
    }

    return ledger;
  }, [selectedProduct, invoices, importDossiers, subcontractJobs, vouchers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('نام نخ یا کالا را وارد کنید.');
      return;
    }

    const payload = {
      name: name.trim(),
      category: category.trim() || YARN_CATEGORIES[0],
      warehouse: warehouse.trim() || YARN_WAREHOUSES[0],
      unit: itemUnit.trim() || 'کیلوگرم',
      secondaryUnit: secondaryUnit.trim() || undefined,
      kgPerCarton: kgPerCarton > 0 ? kgPerCarton : undefined,
      bobbinUnit: bobbinUnit.trim() || undefined,
      bobbinsPerCarton: bobbinsPerCarton > 0 ? bobbinsPerCarton : undefined,
      yarnCount: yarnCount.trim() || undefined,
      lotNumber: lotNumber.trim() || undefined,
      originCountry: originCountry.trim() || undefined,
      buyPrice,
      sellPrice,
      stock: Math.round(Math.max(0, stock) * 100) / 100,
      reorderPoint: Math.max(0, reorderPoint),
      vatExempt,
    };

    const extraMeta: ProductApexMeta = {
      barcode: barcode.trim() || generateSmartBarcode(sku.trim() || name.trim()),
      binLocation: binLocation.trim() || undefined,
      maxStock: Math.max(reorderPoint, maxStock),
      wholesalePrice: Math.max(0, Math.round(wholesalePrice)),
      partnerPrice: Math.max(0, Math.round(partnerPrice)),
      factoryPrice: Math.max(0, Math.round(factoryPrice)),
    };

    if (editingProduct) {
      await updateProduct(editingProduct.id, payload);
      upsertProductMetaSynced(editingProduct.id, extraMeta);
      upsertProductMetaSynced(editingProduct.sku, extraMeta);
      setEditingProduct(null);
      setShowForm(false);
      return;
    }

    if (!sku.trim()) {
      showToast('کد کالا / SKU نخ را وارد کنید.');
      return;
    }
    const upperSku = sku.trim().toUpperCase();
    await addProduct({
      sku: upperSku,
      ...payload,
    });
    upsertProductMetaSynced(upperSku, extraMeta);
    setShowForm(false);
  };

  const handleBulkImportProducts = async () => {
    if (parsedImportRows.length === 0 || importingBulk) return;
    setImportingBulk(true);
    try {
      let imported = 0;
      for (const row of parsedImportRows) {
        await addProduct({
          sku: row.sku,
          name: row.name,
          category: row.category,
          warehouse: row.warehouse,
          unit: 'کیلوگرم',
          secondaryUnit: 'کارتن',
          kgPerCarton: row.kgPerCarton,
          bobbinUnit: 'بوبین',
          bobbinsPerCarton: 6,
          yarnCount: row.yarnCount,
          buyPrice: row.buyPrice,
          sellPrice: row.sellPrice,
          stock: row.stock,
          reorderPoint: row.reorderPoint,
          vatExempt: false,
        });
        if (row.barcode) {
          upsertProductMetaSynced(row.sku, { barcode: row.barcode });
        }
        imported++;
      }
      showToast(`${toPersianDigits(imported)} قلم کالا با موفقیت از فایل اکسل/CSV وارد انبار شد.`);
      setCsvInput('');
      setShowImportModal(false);
    } finally {
      setImportingBulk(false);
    }
  };

  // Stocktake calculation supporting direct kg OR carton entry
  const countedQtyKg = useMemo(() => {
    if (!selectedProduct) return 0;
    if (stockEditValue === '') return selectedProduct.stock;
    const raw = Math.max(0, Number(stockEditValue) || 0);
    if (stockInputMode === 'carton' && selectedProduct.kgPerCarton && selectedProduct.kgPerCarton > 0) {
      return Math.round(raw * selectedProduct.kgPerCarton * 100) / 100;
    }
    return Math.round(raw * 100) / 100;
  }, [selectedProduct, stockEditValue, stockInputMode]);

  const diffQty = selectedProduct
    ? Math.round((countedQtyKg - selectedProduct.stock) * 100) / 100
    : 0;
  const diffValue = selectedProduct ? Math.round(Math.abs(diffQty) * selectedProduct.buyPrice) : 0;

  // Bulk stocktaking summary
  const bulkSummary = useMemo(() => {
    let changedItems = 0;
    let shortageValue = 0;
    let surplusValue = 0;
    const payload: { productId: string; countedStock: number }[] = [];
    for (const p of products) {
      const counted = bulkCounts[p.id] ?? p.stock;
      const diff = Math.round((counted - p.stock) * 100) / 100;
      if (Math.abs(diff) >= 0.01) {
        changedItems += 1;
        payload.push({ productId: p.id, countedStock: counted });
        if (diff < 0) shortageValue += Math.round(Math.abs(diff) * p.buyPrice);
        else surplusValue += Math.round(diff * p.buyPrice);
      }
    }
    return { changedItems, shortageValue, surplusValue, payload };
  }, [products, bulkCounts]);

  const handleCommitBulkStocktaking = async () => {
    await bulkStocktakingWithVoucher(bulkSummary.payload, bulkReason);
    setBulkMode(false);
  };

  const formCartonPreview = computeCartons(stock, kgPerCarton);
  const formBobbinPreview = computeBobbins(stock, kgPerCarton, bobbinsPerCarton);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            انبارداری چندواحدی نخ نساجی، کاردکس و انبارگردانی (F6)
          </h1>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-2">
            <span>{toPersianDigits(products.length)} نوع نخ</span>
            <span>·</span>
            <span>
              کل موجودی وزنی:{' '}
              <strong className="font-code tabular-nums text-slate-800 dark:text-slate-200">
                {formatWeight(inventoryStats.totalKg)} کیلوگرم
              </strong>
            </span>
            <span>·</span>
            <span>
              معادل:{' '}
              <strong className="font-code tabular-nums text-teal-800 dark:text-teal-400">
                {formatWeight(inventoryStats.totalCartons)} کارتن/عدل
              </strong>
            </span>
            <span>·</span>
            <span>
              ارزش کل موجودی (بهای تمام‌شده):{' '}
              <strong className="font-code tabular-nums text-slate-800 dark:text-slate-200">
                {formatMoney(inventoryStats.totalValue, unit)}
              </strong>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>ورود گروهی اکسل</span>
          </button>
          <button
            onClick={() => (bulkMode ? setBulkMode(false) : enterBulkMode())}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border whitespace-nowrap ${
              bulkMode
                ? 'bg-amber-600 text-white border-amber-600'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>{bulkMode ? 'خروج از انبارگردانی' : 'انبارگردانی گروهی'}</span>
          </button>
          <button
            onClick={() => setShowPriceModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Percent className="w-4 h-4" />
            <span>تغییر گروهی نرخ</span>
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>معرفی کالای جدید</span>
          </button>
        </div>
      </div>

      {/* Global Fuzzy Search Bar for Textile Yarn Inventory */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              جستجوی هوشمند فازی نخ (کد SKU، نوع نخ، نمره/دنیر، شماره لات رنگرزی، کشور مبدأ یا انبار)
            </label>
            <FuzzyTableSearch
              options={productSearchOptions}
              query={search}
              onQueryChange={setSearch}
              totalCount={warehouseScopedProducts.length}
              matchedCount={filtered.length}
              entityLabel="نخ"
              onSelect={(opt) => {
                const found = products.find((p) => p.id === opt.id);
                if (found) {
                  setSelectedProductId(found.id);
                  setStockInputMode('kg');
                  setStockEditValue(String(found.stock));
                  setPanelTab('stocktake');
                  setTimeout(() => stockInputRef.current?.focus(), 60);
                }
              }}
              placeholder="مثلاً DTY، لات CN-2026، اسپاندکس، هند یا کد نخ را تایپ کنید..."
              emptyText="نخ یا کالایی منطبق با جستجوی شما یافت نشد."
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <button
              onClick={() => setWarehouseFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                warehouseFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              همه انبارها
            </button>
            {warehouses.map((w) => (
              <button
                key={w}
                onClick={() => setWarehouseFilter(w)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                  warehouseFilter === w
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk Stocktaking Banner */}
      {bulkMode && (
        <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              <span>حالت انبارگردانی و اصلاح گروهی وزن (کیلوگرم) فعال است</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300">
              وزن شمارش‌شده باسکول (کیلوگرم — حتی با اعشار مثل ۲۴۸.۵) را مستقیم در جدول وارد کنید. سند تجمیعی کسری/اضافی به‌صورت ریالی دقیق صادر می‌شود.
            </p>
            <div className="flex flex-wrap gap-3 pt-1 font-code">
              <span>اقلام تغییریافته: <strong>{toPersianDigits(bulkSummary.changedItems)}</strong></span>
              <span className="text-rose-700 dark:text-rose-400">
                جمع کسری: <strong>{formatMoney(bulkSummary.shortageValue, unit)}</strong>
              </span>
              <span className="text-emerald-700 dark:text-emerald-400">
                جمع اضافی: <strong>{formatMoney(bulkSummary.surplusValue, unit)}</strong>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="شرح سند انبارگردانی..."
              className="w-56 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button
              onClick={handleCommitBulkStocktaking}
              disabled={bulkSummary.changedItems === 0}
              className="px-4 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg whitespace-nowrap"
            >
              ثبت انبارگردانی و صدور سند تعدیل
            </button>
          </div>
        </div>
      )}

      {/* Authentic Holoo Apex 9.6 Product Entry Form (4-Tab Classic Layout) */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 border-2 border-teal-700/25 dark:border-teal-800/70 rounded-xl overflow-hidden shadow-sm"
        >
          {/* Holoo 9.6 Form Title Bar */}
          <div className="px-5 py-3 bg-slate-800 dark:bg-slate-950 text-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Layers className="w-4 h-4 text-teal-400" />
              <span className="font-bold text-sm">
                {editingProduct
                  ? `ویرایش کارت کالا — ${editingProduct.sku}`
                  : 'فرم معرفی کالا و انبار — هلو اپکس ۹.۶'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingProduct(null);
              }}
              className="p-1 text-slate-300 hover:bg-slate-700 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Holoo 9.6 Product Card Section Tabs */}
          <div className="px-5 pt-3 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-1 text-xs">
            {(
              [
                { id: 'main', label: '۱. مشخصات اصلی، گروه و بارکد' },
                { id: 'units', label: '۲. واحدهای چندگانه (کیلو/کارتن/بوبین)' },
                { id: 'pricing', label: '۳. قیمت‌گذاری ۴ سطحی و حاشیه سود' },
                { id: 'stock', label: '۴. کنترل موجودی و مالیات' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFormTab(t.id)}
                className={`px-3.5 py-2 rounded-t-lg font-semibold border border-b-0 transition-colors ${
                  formTab === t.id
                    ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 border-slate-200 dark:border-slate-800'
                    : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4 text-xs">
            {formTab === 'main' && (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-500">کد کالا / SKU</label>
                    {!editingProduct && (
                      <button
                        type="button"
                        onClick={() => setSku(generateSmartSku(category, products))}
                        className="text-[10.5px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                      >
                        تولید کد
                      </button>
                    )}
                  </div>
                  <input
                    value={sku}
                    disabled={!!editingProduct}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="YRN-DTY-300"
                    className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-500">بارکد کالا (EAN-13 / اسکنر)</label>
                    <button
                      type="button"
                      onClick={() => setBarcode(generateSmartBarcode(sku || 'YRN'))}
                      className="text-[10.5px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      تولید بارکد
                    </button>
                  </div>
                  <input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    dir="ltr"
                    placeholder="6260000000001"
                    className="w-full px-3 py-2 font-code text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-slate-500 mb-1">نام کامل کالا / نخ نساجی *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثلاً نخ پلی‌استر DTY 150/48 نیمه‌مات (AA) وارداتی"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">گروه اصلی کالا</label>
                  <input
                    list="yarn-categories-list"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <datalist id="yarn-categories-list">
                    {YARN_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">انبار پیش‌فرض</label>
                  <input
                    list="yarn-warehouses-list"
                    value={warehouse}
                    onChange={(e) => setWarehouse(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <datalist id="yarn-warehouses-list">
                    {YARN_WAREHOUSES.map((w) => (
                      <option key={w} value={w} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">محل قفسه / ردیف انبار (Bin)</label>
                  <input
                    value={binLocation}
                    onChange={(e) => setBinLocation(e.target.value)}
                    placeholder="ردیف B — پالت ۴"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">کشور مبدأ واردات</label>
                  <input
                    list="yarn-origins-list"
                    value={originCountry}
                    onChange={(e) => setOriginCountry(e.target.value)}
                    placeholder="چین / هند / کره جنوبی..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <datalist id="yarn-origins-list">
                    {ORIGIN_COUNTRIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">نمره / دنیر نخ (Count/Denier)</label>
                  <input
                    value={yarnCount}
                    onChange={(e) => setYarnCount(e.target.value)}
                    placeholder="مثلاً 150/48 یا Ne 30/1"
                    className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">شماره لات رنگرزی / پارت</label>
                  <input
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    placeholder="مثلاً CN-2026-418"
                    className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
            )}

            {formTab === 'units' && (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  تنظیمات چندواحدی هلو ۹.۶ (تبدیل خودکار کارتن/عدل ↔ کیلوگرم باسکول ↔ بوبین/دوک)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">واحد مبنای انبار (وزن)</label>
                    <input
                      value={itemUnit}
                      onChange={(e) => setItemUnit(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">واحد بسته‌بندی (دوم)</label>
                    <select
                      value={secondaryUnit}
                      onChange={(e) => setSecondaryUnit(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      <option value="کارتن">کارتن</option>
                      <option value="عدل">عدل (کیسه)</option>
                      <option value="پالت">پالت</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">وزن هر {secondaryUnit} (کیلوگرم)</label>
                    <input
                      type="number"
                      step="0.1"
                      min={0.1}
                      value={kgPerCarton}
                      onChange={(e) => setKgPerCarton(Number(e.target.value))}
                      className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">واحد شمارش (سوم)</label>
                    <select
                      value={bobbinUnit}
                      onChange={(e) => setBobbinUnit(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      <option value="بوبین">بوبین</option>
                      <option value="دوک">دوک</option>
                      <option value="کون">کون</option>
                      <option value="مخروط">مخروط</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">تعداد {bobbinUnit} در هر {secondaryUnit}</label>
                    <input
                      type="number"
                      min={1}
                      value={bobbinsPerCarton}
                      onChange={(e) => setBobbinsPerCarton(Number(e.target.value))}
                      className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
                {formCartonPreview > 0 && (
                  <div className="pt-2 text-teal-800 dark:text-teal-300 font-code">
                    پیش‌نمایش موجودی فعلی: {formatWeight(stock)} {itemUnit} = {formatWeight(formCartonPreview)} {secondaryUnit}
                    {formBobbinPreview > 0 ? ` = ${formatNumber(formBobbinPreview)} ${bobbinUnit}` : ''}
                  </div>
                )}
              </div>
            )}

            {formTab === 'pricing' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-900">
                  <div className="flex items-center gap-1.5 font-semibold text-teal-900 dark:text-teal-200">
                    <Calculator className="w-4 h-4 text-teal-600" />
                    <span>ماشین‌حساب هوشمند قیمت‌گذاری ۴ سطحی هلو ۹.۶:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[12, 18, 22, 28].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => applySmartPricingMargin(pct)}
                        className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-800 text-teal-800 dark:text-teal-300 font-semibold hover:bg-teal-100 dark:hover:bg-teal-950"
                      >
                        حاشیه سود +{toPersianDigits(pct)}٪
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">بهای خرید هر کیلو (ریال)</label>
                    <input
                      type="number"
                      min={0}
                      dir="ltr"
                      value={buyPrice}
                      onChange={(e) => setBuyPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 font-code text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-teal-700 dark:text-teal-400 font-semibold mb-1">
                      نرخ ۱ — فروش نقدی / پایه
                    </label>
                    <input
                      type="number"
                      min={0}
                      dir="ltr"
                      value={sellPrice}
                      onChange={(e) => setSellPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 font-code text-left rounded-lg border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-950"
                    />
                    <div className="text-[10.5px] text-emerald-700 dark:text-emerald-400 mt-0.5 font-code">
                      سود: {sellPrice > 0 ? toPersianDigits((((sellPrice - buyPrice) / sellPrice) * 100).toFixed(1)) : '۰'}٪
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">نرخ ۲ — عمده‌فروشی (ریال)</label>
                    <input
                      type="number"
                      min={0}
                      dir="ltr"
                      value={wholesalePrice}
                      onChange={(e) => setWholesalePrice(Number(e.target.value))}
                      className="w-full px-3 py-2 font-code text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">نرخ ۳ — همکار (ریال)</label>
                    <input
                      type="number"
                      min={0}
                      dir="ltr"
                      value={partnerPrice}
                      onChange={(e) => setPartnerPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 font-code text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">نرخ ۴ — کارخانه / تیراژ</label>
                    <input
                      type="number"
                      min={0}
                      dir="ltr"
                      value={factoryPrice}
                      onChange={(e) => setFactoryPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 font-code text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>
              </div>
            )}

            {formTab === 'stock' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <label className="block text-slate-500 mb-1">موجودی فعلی (کیلوگرم)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={stock}
                    onChange={(e) => setStock(Number(e.target.value))}
                    className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">نقطه سفارش / حداقل موجودی (کیلو)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={reorderPoint}
                    onChange={(e) => setReorderPoint(Number(e.target.value))}
                    className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">حداکثر ظرفیت موجودی (کیلو)</label>
                  <input
                    type="number"
                    step="1"
                    min={0}
                    value={maxStock}
                    onChange={(e) => setMaxStock(Number(e.target.value))}
                    className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={vatExempt}
                      onChange={(e) => setVatExempt(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    معاف از مالیات ارزش افزوده (۱۰٪)
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 font-code">
                بارکد: {barcode || '—'} · فروش پایه: {formatMoney(sellPrice, unit)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingProduct(null);
                  }}
                  className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  {editingProduct ? 'ذخیره تغییرات کالا' : 'ثبت کالا در انبار (هلو ۹.۶)'}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500">
                  <th className="py-3 px-4">کد / لات</th>
                  <th className="py-3 px-4">مشخصات نخ و انبار</th>
                  <th className="py-3 px-4 text-left">نرخ خرید (کیلو)</th>
                  <th className="py-3 px-4 text-left">نرخ فروش (کیلو)</th>
                  <th className="py-3 px-4 text-left">موجودی چندواحدی</th>
                  {bulkMode ? (
                    <th className="py-3 px-4 text-left">شمارش باسکول (کیلو)</th>
                  ) : (
                    <th className="py-3 px-4">وضعیت</th>
                  )}
                  <th className="py-3 px-3">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((p) => {
                  const low = p.stock <= p.reorderPoint;
                  const counted = bulkCounts[p.id] ?? p.stock;
                  const rowDiff = Math.round((counted - p.stock) * 100) / 100;
                  const cartons = computeCartons(p.stock, p.kgPerCarton);
                  const bobbins = computeBobbins(p.stock, p.kgPerCarton, p.bobbinsPerCarton);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => {
                        setSelectedProductId(p.id);
                        setStockInputMode('kg');
                        setStockEditValue(String(p.stock));
                      }}
                      className={`cursor-pointer ${
                        selectedProduct?.id === p.id
                          ? 'bg-teal-50/70 dark:bg-teal-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-4 font-code">
                        <div className="font-semibold text-teal-800 dark:text-teal-400">{p.sku}</div>
                        {p.lotNumber && (
                          <div className="text-[10.5px] text-slate-500 mt-0.5">لات {p.lotNumber}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{p.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-1.5">
                          <span>{p.warehouse}</span>
                          {p.yarnCount && (
                            <>
                              <span>·</span>
                              <span className="font-code">نمره {p.yarnCount}</span>
                            </>
                          )}
                          {p.originCountry && (
                            <>
                              <span>·</span>
                              <span>مبدأ: {p.originCountry}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(p.buyPrice, unit, false)}
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums font-medium text-slate-900 dark:text-white">
                        {formatMoney(p.sellPrice, unit, false)}
                      </td>
                      <td className="py-3 px-4 text-left font-code tabular-nums">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {formatWeight(p.stock)} {p.unit}
                        </div>
                        {cartons > 0 && (
                          <div className="text-[10.5px] text-slate-500 mt-0.5">
                            {formatWeight(cartons)} {p.secondaryUnit || 'کارتن'}
                            {bobbins > 0
                              ? ` · ${formatNumber(bobbins)} ${p.bobbinUnit || 'بوبین'}`
                              : ''}
                          </div>
                        )}
                      </td>
                      {bulkMode ? (
                        <td
                          className="py-2.5 px-4 text-left"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              value={counted}
                              onChange={(e) =>
                                setBulkCounts((prev) => ({
                                  ...prev,
                                  [p.id]: Math.max(0, Number(e.target.value)),
                                }))
                              }
                              className="w-24 px-2 py-1 font-code text-center rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                            {Math.abs(rowDiff) >= 0.01 && (
                              <span
                                className={`font-code text-[11px] font-bold ${
                                  rowDiff < 0
                                    ? 'text-rose-700 dark:text-rose-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                                }`}
                              >
                                {rowDiff > 0 ? `+${formatWeight(rowDiff)}` : `-${formatWeight(Math.abs(rowDiff))}`}
                              </span>
                            )}
                          </div>
                        </td>
                      ) : (
                        <td className="py-3 px-4 whitespace-nowrap">
                          {(() => {
                            const intel = inventoryIntel.get(p.id);
                            return (
                              <div className="space-y-0.5">
                                <div
                                  className={
                                    low || intel?.status === 'critical'
                                      ? 'text-rose-700 dark:text-rose-400 font-semibold'
                                      : intel?.status === 'reorder'
                                        ? 'text-amber-700 dark:text-amber-400 font-semibold'
                                        : 'text-emerald-700 dark:text-emerald-400 font-medium'
                                  }
                                >
                                  {low
                                    ? 'نیاز به سفارش فوری'
                                    : intel?.daysUntilStockout !== null &&
                                        intel?.daysUntilStockout !== undefined &&
                                        intel.daysUntilStockout <= 20
                                      ? `اتمام تا ${toPersianDigits(intel.daysUntilStockout)} روز`
                                      : 'عادی'}
                                </div>
                                {intel && (
                                  <div className="text-[10.5px] font-code text-slate-500">
                                    سود {toPersianDigits(intel.grossMarginPct)}٪
                                    {intel.suggestedReorderKg > 0
                                      ? ` · پیشنهاد +${formatWeight(intel.suggestedReorderKg)} کیلو`
                                      : ''}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      )}
                      <td
                        className="py-3 px-3 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setBarcodeProduct(p)}
                            title="چاپ لیبل بارکد کالا"
                            className="p-1 rounded text-slate-500 hover:text-indigo-700 dark:hover:text-indigo-400"
                          >
                            <Barcode className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEdit(p)}
                            title="ویرایش مشخصات، واحدها و قیمت نخ"
                            className="p-1 rounded text-slate-500 hover:text-teal-700"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteProduct(p.id)}
                            title="حذف کالا"
                            className="p-1 rounded text-slate-500 hover:text-rose-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      نخ یا کالایی مطابق جستجوی شما یافت نشد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side Operations Panel: Multi-Unit Stocktaking, Warehouse Transfer & Kardex */}
        <div className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          {selectedProduct ? (
            <>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedProduct.name}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedProduct.sku} · {selectedProduct.warehouse}
                  {selectedProduct.lotNumber ? ` · لات ${selectedProduct.lotNumber}` : ''}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2 text-[11px]">
                  <div>
                    <div className="text-slate-500">وزن کل</div>
                    <div className="font-code font-bold text-slate-900 dark:text-white mt-0.5">
                      {formatWeight(selectedProduct.stock)} {selectedProduct.unit}
                    </div>
                  </div>
                  <div className="border-r border-slate-200 dark:border-slate-800">
                    <div className="text-slate-500">{selectedProduct.secondaryUnit || 'کارتن'}</div>
                    <div className="font-code font-bold text-teal-700 dark:text-teal-400 mt-0.5">
                      {selectedProduct.kgPerCarton
                        ? formatWeight(computeCartons(selectedProduct.stock, selectedProduct.kgPerCarton))
                        : '—'}
                    </div>
                  </div>
                  <div className="border-r border-slate-200 dark:border-slate-800">
                    <div className="text-slate-500">{selectedProduct.bobbinUnit || 'بوبین'}</div>
                    <div className="font-code font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {selectedProduct.kgPerCarton && selectedProduct.bobbinsPerCarton
                        ? formatNumber(
                            computeBobbins(
                              selectedProduct.stock,
                              selectedProduct.kgPerCarton,
                              selectedProduct.bobbinsPerCarton
                            )
                          )
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg text-[11px]">
                {(
                  [
                    { id: 'stocktake', label: 'اصلاح موجودی / باسکول' },
                    { id: 'transfer', label: 'انتقال انبار' },
                    { id: 'kardex', label: 'کاردکس نخ' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPanelTab(t.id)}
                    className={`flex-1 py-1.5 rounded font-medium ${
                      panelTab === t.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {panelTab === 'stocktake' && (
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <ClipboardCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                      <span>ثبت شمارش + سند تعدیل دوبل</span>
                    </span>
                    {selectedProduct.kgPerCarton && selectedProduct.kgPerCarton > 0 && (
                      <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-0.5 text-[10.5px]">
                        <button
                          type="button"
                          onClick={() => {
                            setStockInputMode('kg');
                            setStockEditValue(String(countedQtyKg));
                          }}
                          className={`px-2 py-0.5 rounded ${
                            stockInputMode === 'kg'
                              ? 'bg-teal-700 text-white font-semibold'
                              : 'text-slate-500'
                          }`}
                        >
                          کیلوگرم
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStockInputMode('carton');
                            setStockEditValue(
                              String(computeCartons(countedQtyKg, selectedProduct.kgPerCarton))
                            );
                          }}
                          className={`px-2 py-0.5 rounded ${
                            stockInputMode === 'carton'
                              ? 'bg-teal-700 text-white font-semibold'
                              : 'text-slate-500'
                          }`}
                        >
                          {selectedProduct.secondaryUnit || 'کارتن'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      {stockInputMode === 'carton'
                        ? `تعداد ${selectedProduct.secondaryUnit || 'کارتن'} شمارش‌شده (هر واحد ${formatWeight(
                            selectedProduct.kgPerCarton ?? 0
                          )} کیلو)`
                        : `وزن شمارش‌شده باسکول (${selectedProduct.unit})`}
                    </label>
                    <input
                      ref={stockInputRef}
                      type="number"
                      step="0.1"
                      min={0}
                      value={
                        stockEditValue !== ''
                          ? stockEditValue
                          : stockInputMode === 'carton'
                            ? computeCartons(selectedProduct.stock, selectedProduct.kgPerCarton)
                            : selectedProduct.stock
                      }
                      onChange={(e) => setStockEditValue(e.target.value)}
                      className="w-full px-3 py-1.5 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    {stockInputMode === 'carton' && (
                      <div className="text-[11px] text-teal-700 dark:text-teal-400 mt-1 font-code">
                        معادل وزنی محاسبه‌شده: {formatWeight(countedQtyKg)} کیلوگرم
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">شرح سند تعدیل</label>
                    <input
                      value={stockReason}
                      onChange={(e) => setStockReason(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  {Math.abs(diffQty) >= 0.01 && (
                    <div className="text-[11px] p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      {diffQty < 0 ? (
                        <span className="text-rose-700 dark:text-rose-400">
                          کسری {formatWeight(Math.abs(diffQty))} {selectedProduct.unit} · سند
                          بدهکار «۸۰۴۰۱ کسری انبار» به مبلغ{' '}
                          <strong className="font-code">{formatMoney(diffValue, unit)}</strong>
                        </span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          اضافی {formatWeight(diffQty)} {selectedProduct.unit} · سند بستانکار
                          «۶۰۳۰۱ اضافی انبار» به مبلغ{' '}
                          <strong className="font-code">{formatMoney(diffValue, unit)}</strong>
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() =>
                      adjustProductStockWithVoucher(selectedProduct.id, countedQtyKg, stockReason)
                    }
                    className="w-full py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                  >
                    ثبت شمارش و صدور سند تعدیل انبار
                  </button>
                </div>
              )}

              {panelTab === 'transfer' && (
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ArrowRightLeft className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                    <span>حواله انتقال نخ بین انبارها</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    انبار فعلی: <strong>{selectedProduct.warehouse}</strong>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">انبار مقصد</label>
                    <input
                      list="yarn-warehouses-list"
                      value={targetWarehouse}
                      onChange={(e) => setTargetWarehouse(e.target.value)}
                      placeholder="نام انبار مقصد..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <button
                    onClick={() => transferProductWarehouse(selectedProduct.id, targetWarehouse)}
                    className="w-full py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                  >
                    ثبت حواله انتقال به انبار مقصد
                  </button>
                </div>
              )}

              {panelTab === 'kardex' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      کاردکس ریالی و تعدادی (میانگین موزون هلو)
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowFullKardexModal(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-teal-700 hover:bg-teal-800 text-white"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>جدول ۴بخشی هلو</span>
                    </button>
                  </div>
                  {kardexRows.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      هنوز گردش فاکتوری برای این نخ ثبت نشده است.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                      {kardexRows.map((kr, idx) => (
                        <div
                          key={idx}
                          className="py-2.5 text-xs flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {kr.typeLabel} · {kr.invoiceNumber}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              <span className="font-code">{toPersianDigits(kr.date)}</span> · {kr.partyName}
                            </div>
                            <div className="text-[10.5px] font-code text-slate-500 mt-0.5">
                              مانده: {formatWeight(kr.balQty)} کیلو · نرخ میانگین: {formatMoney(kr.avgRate, unit, false)}
                            </div>
                          </div>
                          <div className="font-code tabular-nums text-left shrink-0">
                            {kr.inQty > 0 ? (
                              <div className="font-bold text-emerald-700 dark:text-emerald-400">
                                +{formatWeight(kr.inQty)} کیلو
                              </div>
                            ) : (
                              <div className="font-bold text-rose-700 dark:text-rose-400">
                                -{formatWeight(kr.outQty)} کیلو
                              </div>
                            )}
                            <div className="text-[10px] text-slate-500">
                              مانده ریالی: {formatMoney(kr.balValue, unit, false)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Bulk Price Update Modal */}
      {showPriceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await bulkUpdateProductPrices(
                filtered.map((p) => p.id),
                priceTarget,
                pricePercent
              );
              setShowPriceModal(false);
            }}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                تغییر گروهی نرخ کیلوگرم نخ‌ها ({toPersianDigits(filtered.length)} قلم)
              </h3>
              <button type="button" onClick={() => setShowPriceModal(false)}>
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-slate-500 mb-1">نوع قیمت هدف</label>
                <select
                  value={priceTarget}
                  onChange={(e) => setPriceTarget(e.target.value as 'sellPrice' | 'buyPrice')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="sellPrice">قیمت فروش هر کیلوگرم</option>
                  <option value="buyPrice">بهای خرید هر کیلوگرم</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">
                  درصد تغییر (مثبت برای افزایش، منفی برای کاهش)
                </label>
                <input
                  type="number"
                  value={pricePercent}
                  onChange={(e) => setPricePercent(Number(e.target.value))}
                  className="w-full px-3 py-2 font-code rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPriceModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-5 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
              >
                اعمال تغییر نرخ گروهی
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Authentic Holoo 4-Section Weighted-Average Kardex Modal */}
      {showFullKardexModal && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
          <div className="w-full max-w-6xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-xs print-container">
            <div className="px-5 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  کاردکس ۴بخشی تعدادی و ریالی کالا (میانگین موزون هلو) — {selectedProduct.name}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  کد {selectedProduct.sku} · انبار: {selectedProduct.warehouse} · واحد: {selectedProduct.unit}
                  {selectedProduct.lotNumber ? ` · لات ${selectedProduct.lotNumber}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => {
                    exportToCsv(
                      `holoo-kardex-${selectedProduct.sku}.csv`,
                      [
                        'تاریخ',
                        'شماره سند/فاکتور',
                        'شرح',
                        'وارده مقدار',
                        'وارده نرخ',
                        'وارده مبلغ',
                        'صادره مقدار',
                        'صادره نرخ میانگین',
                        'صادره مبلغ',
                        'مانده مقدار',
                        'نرخ میانگین موزون',
                        'مانده ریالی',
                      ],
                      kardexRows.map((r) => [
                        r.date,
                        r.invoiceNumber,
                        `${r.typeLabel} - ${r.partyName}`,
                        r.inQty,
                        r.inRate,
                        r.inTotal,
                        r.outQty,
                        r.outRate,
                        r.outTotal,
                        r.balQty,
                        r.avgRate,
                        r.balValue,
                      ])
                    );
                    showToast('فایل اکسل کاردکس کالا دریافت شد.');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>خروجی اکسل</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>چاپ کاردکس</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullKardexModal(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    <th colSpan={3} className="py-2 px-3 border-l border-slate-200 dark:border-slate-800 text-center">
                      مشخصات سند / فاکتور
                    </th>
                    <th colSpan={3} className="py-2 px-3 border-l border-slate-200 dark:border-slate-800 text-center text-emerald-700 dark:text-emerald-400">
                      وارده (ورودی انبار)
                    </th>
                    <th colSpan={3} className="py-2 px-3 border-l border-slate-200 dark:border-slate-800 text-center text-rose-700 dark:text-rose-400">
                      صادره (خروجی انبار)
                    </th>
                    <th colSpan={3} className="py-2 px-3 text-center text-teal-700 dark:text-teal-400">
                      مانده (میانگین موزون)
                    </th>
                  </tr>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-[10.5px] text-slate-500">
                    <th className="py-2 px-2.5">تاریخ</th>
                    <th className="py-2 px-2.5">شماره</th>
                    <th className="py-2 px-2.5 border-l border-slate-200 dark:border-slate-800">شرح و طرف‌حساب</th>
                    <th className="py-2 px-2 text-left">وزن</th>
                    <th className="py-2 px-2 text-left">نرخ</th>
                    <th className="py-2 px-2 text-left border-l border-slate-200 dark:border-slate-800">مبلغ</th>
                    <th className="py-2 px-2 text-left">وزن</th>
                    <th className="py-2 px-2 text-left">نرخ میانگین</th>
                    <th className="py-2 px-2 text-left border-l border-slate-200 dark:border-slate-800">بها</th>
                    <th className="py-2 px-2 text-left">مانده وزن</th>
                    <th className="py-2 px-2 text-left">میانگین موزون</th>
                    <th className="py-2 px-2.5 text-left">مانده ریالی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-code tabular-nums">
                  {kardexRows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-2.5">{toPersianDigits(r.date)}</td>
                      <td className="py-2 px-2.5 font-semibold">{r.invoiceNumber}</td>
                      <td className="py-2 px-2.5 font-sans border-l border-slate-200 dark:border-slate-800">
                        <div className="font-medium text-slate-900 dark:text-white">{r.typeLabel}</div>
                        <div className="text-[10.5px] text-slate-500">{r.partyName}</div>
                      </td>
                      <td className="py-2 px-2 text-left text-emerald-700 dark:text-emerald-400">
                        {r.inQty > 0 ? formatWeight(r.inQty) : '—'}
                      </td>
                      <td className="py-2 px-2 text-left text-slate-600 dark:text-slate-300">
                        {r.inRate > 0 ? formatMoney(r.inRate, unit, false) : '—'}
                      </td>
                      <td className="py-2 px-2 text-left border-l border-slate-200 dark:border-slate-800">
                        {r.inTotal > 0 ? formatMoney(r.inTotal, unit, false) : '—'}
                      </td>
                      <td className="py-2 px-2 text-left text-rose-700 dark:text-rose-400">
                        {r.outQty > 0 ? formatWeight(r.outQty) : '—'}
                      </td>
                      <td className="py-2 px-2 text-left text-slate-600 dark:text-slate-300">
                        {r.outRate > 0 ? formatMoney(r.outRate, unit, false) : '—'}
                      </td>
                      <td className="py-2 px-2 text-left border-l border-slate-200 dark:border-slate-800">
                        {r.outTotal > 0 ? formatMoney(r.outTotal, unit, false) : '—'}
                      </td>
                      <td className="py-2 px-2 text-left font-bold text-slate-900 dark:text-white">
                        {formatWeight(r.balQty)}
                      </td>
                      <td className="py-2 px-2 text-left text-teal-700 dark:text-teal-400">
                        {formatMoney(r.avgRate, unit, false)}
                      </td>
                      <td className="py-2 px-2.5 text-left font-bold text-slate-900 dark:text-white">
                        {formatMoney(r.balValue, unit, false)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Holoo Apex 9.6 Bulk Excel / CSV Product Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  ورود گروهی کالا از فایل اکسل / CSV (هلو اپکس ۹.۶)
                </h3>
              </div>
              <button type="button" onClick={() => setShowImportModal(false)}>
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>
                ستون‌ها: کد کالا، نام کالا، گروه، انبار، نمره، وزن کارتن، قیمت خرید (ریال)، قیمت فروش (ریال)، موجودی، نقطه سفارش
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCsvInput(
                      'SKU,نام کالا,گروه,انبار,نمره,وزن کارتن,خرید,فروش,موجودی,نقطه سفارش\nYRN-DTY-501,نخ پلی‌استر DTY 150/48 سوپربرایت AA,نخ پلی‌استر DTY,انبار مرکزی نخ شادآباد,150/48,30,1920000,2280000,4500,900\nYRN-CTN-502,نخ پنبه شانه هندی Ne 30/1 کامپکت,نخ پنبه شانه (Combed),انبار پخش یزد,Ne 30/1,45,3100000,3650000,2700,600'
                    )
                  }
                  className="text-teal-700 dark:text-teal-400 font-semibold hover:underline"
                >
                  درج نمونه آماده
                </button>
                <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium">
                  <Upload className="w-3.5 h-3.5" />
                  <span>انتخاب فایل CSV</span>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') setCsvInput(reader.result);
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            <textarea
              rows={5}
              value={csvInput}
              onChange={(e) => setCsvInput(e.target.value)}
              placeholder="ردیف‌های اکسل را مستقیم اینجا Paste کنید یا فایل CSV را انتخاب نمایید..."
              className="w-full p-3 font-code text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />

            {parsedImportRows.length > 0 && (
              <div className="max-h-48 overflow-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-right text-[11px] border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-1.5 px-2.5">کد کالا</th>
                      <th className="py-1.5 px-2.5">نام کالا</th>
                      <th className="py-1.5 px-2.5">انبار</th>
                      <th className="py-1.5 px-2.5 text-left">فروش</th>
                      <th className="py-1.5 px-2.5 text-left">موجودی</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {parsedImportRows.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5 px-2.5 font-code font-semibold text-teal-700 dark:text-teal-400">
                          {r.sku}
                        </td>
                        <td className="py-1.5 px-2.5">{r.name}</td>
                        <td className="py-1.5 px-2.5 text-slate-500">{r.warehouse}</td>
                        <td className="py-1.5 px-2.5 text-left font-code tabular-nums">
                          {formatMoney(r.sellPrice, unit, false)}
                        </td>
                        <td className="py-1.5 px-2.5 text-left font-code tabular-nums">
                          {formatWeight(r.stock)} کیلو
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 font-code">
                {toPersianDigits(parsedImportRows.length)} ردیف معتبر آماده ورود
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  disabled={parsedImportRows.length === 0 || importingBulk}
                  onClick={() => void handleBulkImportProducts()}
                  className="inline-flex items-center gap-1.5 px-5 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{importingBulk ? 'در حال ثبت...' : `ثبت گروهی (${toPersianDigits(parsedImportRows.length)} کالا)`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Holoo Apex 9.6 Printable Barcode Label Modal */}
      {barcodeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 text-xs shadow-2xl print-container">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 no-print">
              <div className="flex items-center gap-2">
                <Barcode className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  طراحی و چاپ لیبل بارکد کارتن/بوبین — هلو اپکس ۹.۶
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-slate-500">تعداد لیبل:</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={barcodeCopies}
                  onChange={(e) => setBarcodeCopies(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                  className="w-16 px-2 py-1 font-code text-center rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>چاپ لیبل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBarcodeProduct(null)}
                  className="p-1 text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {(() => {
              const codeStr =
                apexMetaMap[barcodeProduct.id]?.barcode ||
                apexMetaMap[barcodeProduct.sku]?.barcode ||
                generateSmartBarcode(barcodeProduct.sku);
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto p-1">
                  {Array.from({ length: barcodeCopies }).map((_, i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-lg border-2 border-dashed border-slate-300 bg-white text-slate-900 space-y-2"
                    >
                      <div className="flex items-center justify-between text-[10.5px] font-bold border-b border-slate-200 pb-1">
                        <span className="truncate">{profile.companyName}</span>
                        <span className="font-code">{barcodeProduct.sku}</span>
                      </div>
                      <div className="font-bold text-xs leading-5 line-clamp-2">
                        {barcodeProduct.name}
                      </div>
                      <div className="flex items-center justify-between text-[10.5px] text-slate-600">
                        <span>
                          {barcodeProduct.yarnCount ? `نمره: ${barcodeProduct.yarnCount}` : barcodeProduct.category}
                          {barcodeProduct.lotNumber ? ` · لات: ${barcodeProduct.lotNumber}` : ''}
                        </span>
                        <span className="font-code font-bold text-slate-900">
                          {formatMoney(barcodeProduct.sellPrice, unit)}
                        </span>
                      </div>
                      {/* Crisp SVG Barcode Bars */}
                      <div className="pt-1 flex flex-col items-center">
                        <svg viewBox="0 0 220 42" className="w-full h-10" aria-label={`بارکد ${codeStr}`}>
                          {codeStr.split('').map((ch, idx) => {
                            const v = (ch.charCodeAt(0) + idx * 7) % 5;
                            const x = 8 + idx * 15.5;
                            return (
                              <g key={idx} fill="#0f172a">
                                <rect x={x} y={2} width={v % 2 === 0 ? 3 : 1.8} height={36} />
                                <rect x={x + 5} y={2} width={v > 2 ? 2.5 : 1.4} height={36} />
                                <rect x={x + 10} y={2} width={v === 1 ? 3.2 : 1.6} height={36} />
                              </g>
                            );
                          })}
                        </svg>
                        <div className="font-code text-[11px] tracking-[0.25em] font-bold text-slate-800" dir="ltr">
                          {codeStr}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
