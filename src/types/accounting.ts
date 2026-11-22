export type AccountLevel = 'group' | 'kol' | 'moein' | 'tafsili';
export type AccountCategory = 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense' | 'memo';
export type AccountNature = 'debit' | 'credit' | 'both';
export type CurrencyUnit = 'IRR' | 'IRT';

export type ActiveModule =
  | 'dashboard'
  | 'invoices'
  | 'vouchers'
  | 'audit'
  | 'accounts'
  | 'parties'
  | 'inventory'
  | 'treasury'
  | 'currencies'
  | 'commercial'
  | 'corporate'
  | 'reports'
  | 'studio'
  | 'finance-ops'
  | 'warehouse-crm'
  | 'settings';

export type ExchangeRateType = 'market' | 'exchange_center' | 'nima' | 'agreed';

export interface CurrencyDefinition {
  id: string;
  ownerId: string;
  code: string; // ISO 4217 code e.g. IRR, USD, EUR, AED, CNY, TRY
  name: string; // Persian display name
  symbol: string; // $, €, د.إ, ¥, ریال
  isBase: boolean; // Base accounting currency (IRR)
  decimalPlaces: number; // 0 for IRR, 2 for major foreign currencies
  defaultRateToIrr: number; // Default/fallback parity rate to 1 IRR (1 for IRR)
  active: boolean;
}

export interface ExchangeRateEntry {
  id: string;
  ownerId: string;
  currencyCode: string; // e.g. USD, EUR, AED, CNY
  date: string; // Shamsi YYYY/MM/DD
  rateToIrr: number; // 1 unit of foreign currency in IRR (ریال)
  rateType: ExchangeRateType;
  notes?: string;
}

export interface CompanyProfile {
  uid: string;
  displayName: string;
  email?: string;
  companyName: string;
  economicCode?: string;
  nationalId?: string;
  fiscalYear: string;
  currencyUnit: CurrencyUnit;
  role: 'accountant';
}

export interface Account {
  id: string;
  ownerId: string;
  code: string;
  title: string;
  level: AccountLevel;
  parentCode?: string;
  category: AccountCategory;
  nature: AccountNature;
  isSystem: boolean;
}

export type PartyType = 'customer' | 'vendor' | 'both' | 'intermediary';

export type PartyPricingTier = 'standard' | 'wholesale' | 'factory' | 'cash_vip';

export interface Party {
  id: string;
  ownerId: string;
  code: string;
  name: string;
  partyType: PartyType;
  nationalId?: string;
  economicCode?: string;
  phone?: string;
  address?: string;
  creditLimit: number;
  openingBalance: number; // Positive = debtor (بدهکار), Negative = creditor (بستانکار)
  accountCode: string;
  commissionRate?: number;
  pricingTier?: PartyPricingTier;
  tierDiscountPct?: number; // Automatic % discount (negative = markup) applied in Holoo invoice window
  _version?: number;
  updatedByDevice?: string;
}

export interface Product {
  id: string;
  ownerId: string;
  sku: string;
  name: string;
  category: string;
  warehouse: string;
  unit: string; // Base unit (کیلوگرم)
  secondaryUnit?: string; // Packaging unit (کارتن / عدل)
  kgPerCarton?: number; // Net weight per carton/bale in base unit (kg)
  bobbinUnit?: string; // Inner cone/bobbin unit (بوبین / دوک)
  bobbinsPerCarton?: number; // Number of cones/bobbins inside each carton
  yarnCount?: string; // Yarn count / Denier (e.g., 150/48 DTY, 30/1 شانه)
  lotNumber?: string; // Dye/Import lot number (شماره لات)
  originCountry?: string; // Country of origin (چین، هند، کره جنوبی، اندونزی، ترکیه)
  buyPrice: number; // Buy price per base unit (کیلوگرم) in IRR
  sellPrice: number; // Sell price per base unit (کیلوگرم) in IRR
  stock: number; // Stock in base unit (کیلوگرم — supports decimals)
  reorderPoint: number; // Reorder threshold in base unit (کیلوگرم)
  vatExempt: boolean;
  _version?: number;
  updatedByDevice?: string;
}

export interface VoucherLine {
  accountCode: string;
  accountTitle: string;
  partyId?: string;
  partyName?: string;
  costCenterId?: string;
  description: string;
  debit: number;
  credit: number;
  foreignDebit?: number;
  foreignCredit?: number;
  fxCurrencyCode?: string; // Optional per-line FX tag (used on FX revaluation & mixed-currency clearance vouchers)
}

export type VoucherType =
  | 'opening'
  | 'general'
  | 'sales'
  | 'purchase'
  | 'treasury'
  | 'payroll'
  | 'depreciation'
  | 'closing';

export type VoucherStatus = 'draft' | 'permanent';

export interface Voucher {
  id: string;
  ownerId: string;
  voucherNumber: number;
  date: string; // Shamsi YYYY/MM/DD
  description: string;
  voucherType: VoucherType;
  status: VoucherStatus;
  totalDebit: number;
  totalCredit: number;
  currencyCode?: string; // Undefined or 'IRR' for base currency
  exchangeRate?: number; // Parity rate in IRR per 1 foreign currency unit
  foreignTotalDebit?: number;
  foreignTotalCredit?: number;
  referenceId?: string;
  lines: VoucherLine[];
  _version?: number;
  updatedByDevice?: string;
}

export type InvoiceType = 'sale' | 'purchase' | 'proforma' | 'sale_return' | 'purchase_return' | 'waste';
export type InvoiceStatus = 'issued' | 'settled' | 'cancelled';

export interface InvoiceItem {
  productId: string;
  sku: string;
  productName: string;
  unit: string; // Base unit (کیلوگرم)
  quantity: number; // Total weight in kg (supports decimal scale weight)
  secondaryUnit?: string; // کارتن / عدل
  kgPerCarton?: number; // Weight per carton in kg
  cartonCount?: number; // Number of cartons/bales
  bobbinUnit?: string; // بوبین / دوک
  bobbinCount?: number; // Total cones/bobbins
  lotNumber?: string; // شماره لات
  unitPrice: number; // Unit price per kg (IRR)
  unitCostSnapshot?: number; // Weighted-average buyPrice frozen at invoice time for accurate historical COGS
  discount: number;
  vatAmount: number;
  lineTotal: number;
  foreignUnitPrice?: number;
  foreignDiscount?: number;
  foreignVatAmount?: number;
  foreignLineTotal?: number;
}

export interface Invoice {
  id: string;
  ownerId: string;
  invoiceNumber: string;
  taxSerial?: string;
  invoiceType: InvoiceType;
  date: string;
  partyId: string;
  partyName: string;
  warehouse: string;
  costCenterId?: string;
  intermediaryId?: string; // بازاریاب / واسطه برای محاسبه خودکار پورسانت
  intermediaryName?: string;
  currencyCode?: string; // Undefined or 'IRR' for base currency
  exchangeRate?: number; // Parity rate in IRR per 1 foreign currency unit
  foreignSubtotal?: number;
  foreignDiscount?: number;
  foreignVatAmount?: number;
  foreignGrandTotal?: number;
  subtotal: number;
  discount: number;
  vatAmount: number;
  grandTotal: number;
  paidCash: number;
  paidBank: number;
  paidCheque: number;
  creditAmount: number;
  status: InvoiceStatus;
  voucherId?: string;
  items: InvoiceItem[];
  _version?: number;
  updatedByDevice?: string;
}

export type ChequeDirection = 'receivable' | 'payable';
export type ChequeStatus = 'in_box' | 'deposited' | 'endorsed' | 'cleared' | 'bounced' | 'cancelled';

export interface Cheque {
  id: string;
  ownerId: string;
  sayadiId: string;
  serial: string;
  direction: ChequeDirection;
  partyId: string;
  partyName: string;
  bankName: string;
  branch?: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  status: ChequeStatus;
  notes?: string;
  _version?: number;
  updatedByDevice?: string;
}

export interface Employee {
  id: string;
  ownerId: string;
  personnelCode: string;
  fullName: string;
  department: string;
  baseSalary: number;
  housingAllowance: number;
  foodAllowance: number;
  childrenCount: number;
  overtimeHours: number;
  costCenterId?: string;
  active: boolean;
}

export interface FixedAsset {
  id: string;
  ownerId: string;
  assetCode: string;
  title: string;
  purchaseDate: string;
  purchaseCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  accumulatedDepreciation: number;
  costCenterId?: string;
}

export interface CostCenter {
  id: string;
  ownerId: string;
  code: string;
  name: string;
  budget: number;
  manager?: string;
  active: boolean;
}

export interface TrialBalanceRow {
  accountCode: string;
  accountTitle: string;
  category: AccountCategory;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  totalDebit: number;
  totalCredit: number;
  balanceDebit: number;
  balanceCredit: number;
}

// ---------------- ENTERPRISE YARN IMPORT & LANDED COST ----------------
export type ImportCostAllocationMethod = 'weight' | 'value';
export type ImportDossierStatus = 'in_transit' | 'customs' | 'cleared';

export interface ImportDossierItem {
  productId: string;
  sku: string;
  productName: string;
  lotNumber: string;
  weightKg: number;
  cartonCount: number;
  foreignUnitPrice: number; // FOB/CIF unit price per kg in foreign currency
  foreignTotal: number;
  allocatedLandedCostIrr: number;
  totalItemLandedIrr?: number; // Exact integer IRR (fobIrr + allocatedLandedCostIrr) to avoid rounding drift
  finalUnitCostIrr: number;
}

export interface ImportLandedCost {
  id: string;
  title: string; // کرایه حمل دریایی، بیمه، حقوق گمرکی، دموراژ، کارمزد ترخیص‌کار
  amountIrr: number;
  accountCode: string; // Settlement account (10201 Bank or 30101 Payable)
  partyId?: string; // Optional specific broker/carrier party for 30101 credit
  partyName?: string;
  isRecoverableVat?: boolean; // 10% recoverable customs VAT debited to 30302 (excluded from inventory cost)
}

export interface ImportDossier {
  id: string;
  ownerId: string;
  dossierNumber: string; // e.g. IMP-1405-001
  proformaNumber: string;
  cotageNumber?: string; // شماره کوتاژ گمرکی
  supplierId: string;
  supplierName: string;
  originCountry: string;
  warehouse: string;
  date: string;
  currencyCode: string;
  exchangeRate: number;
  allocationMethod: ImportCostAllocationMethod;
  status: ImportDossierStatus;
  items: ImportDossierItem[];
  costs: ImportLandedCost[];
  totalForeignAmount: number;
  totalFobIrr: number;
  totalLandedCostsIrr: number;
  totalRecoverableVatIrr?: number;
  grandTotalLandedIrr: number;
  voucherId?: string;
  _version?: number;
  updatedByDevice?: string;
}

// ---------------- SALES ORDERS & WAREHOUSE DISPATCH (WEIGHBRIDGE) ----------------
export type SalesOrderStatus = 'ordered' | 'dispatched' | 'invoiced' | 'cancelled';

export interface SalesOrderItem {
  productId: string;
  sku: string;
  productName: string;
  lotNumber?: string;
  orderedWeightKg: number;
  orderedCartons: number;
  actualWeighedKg: number; // وزن واقعی باسکول هنگام تحویل
  actualCartons: number;
  unitPriceIrr: number;
}

export interface SalesOrder {
  id: string;
  ownerId: string;
  orderNumber: string;
  dispatchNumber?: string; // شماره حواله خروج انبار
  date: string;
  dispatchDate?: string;
  partyId: string;
  partyName: string;
  warehouse: string;
  driverName?: string;
  plateNumber?: string; // پلاک خودرو حمل
  status: SalesOrderStatus;
  items: SalesOrderItem[];
  invoiceId?: string;
  notes?: string;
  _version?: number;
  updatedByDevice?: string;
}

// ---------------- DYEING / WEAVING SUBCONTRACTING (BOM / KARMOZDI) ----------------
export type SubcontractStatus = 'sent' | 'completed';

export interface SubcontractJob {
  id: string;
  ownerId: string;
  jobNumber: string;
  date: string;
  completionDate?: string;
  contractorPartyId: string;
  contractorName: string;
  processType: 'dyeing' | 'weaving' | 'twisting'; // رنگرزی / بافندگی / دولاتابی
  rawProductId: string;
  rawProductName: string;
  sentWeightKg: number;
  rawUnitCostIrr: number;
  expectedLossPct: number; // درصد افت مجاز
  returnedWeightKg: number;
  abnormalLossKg?: number; // افت غیرعادی مازاد بر حد مجاز
  abnormalLossCostIrr?: number; // هزینه افت غیرعادی (ثبت در ۸۰۴۰۱)
  finishedProductId: string;
  finishedProductName: string;
  finishedLotNumber: string;
  serviceFeePerKgIrr: number; // اجرت کارمزد هر کیلوگرم
  totalServiceFeeIrr: number;
  serviceVatIrr?: number; // ۱۰٪ مالیات ارزش افزوده اجرت پیمانکاری (ثبت در ۳۰۳۰۲)
  finishedUnitCostIrr: number;
  status: SubcontractStatus;
  dispatchVoucherId?: string;
  voucherId?: string;
  notes?: string;
  _version?: number;
  updatedByDevice?: string;
}

// ---------------- RBAC OPERATORS & AUDIT ACTIVITY LOG ----------------
export type RbacRoleKey =
  | 'finance_manager'
  | 'accountant'
  | 'warehouse_keeper'
  | 'sales_officer'
  | 'treasurer'
  | 'auditor_readonly';

export interface RbacPermissions {
  canCreateVoucher: boolean;
  canFinalizeVoucher: boolean;
  canIssueInvoice: boolean;
  canEditInventory: boolean;
  canManageTreasury: boolean;
  canManageCurrencies: boolean;
  canManageSettings: boolean;
  canDeleteRecords: boolean;
}

export interface RbacOperator {
  id: string;
  ownerId: string;
  fullName: string;
  role: RbacRoleKey;
  email?: string;
  active: boolean;
  permissions: RbacPermissions;
}

export interface AuditActivityLog {
  id: string;
  ownerId: string;
  timestamp: string; // Shamsi date + time
  operatorName: string;
  operatorRole: RbacRoleKey;
  module: string;
  action: string;
  details: string;
}

