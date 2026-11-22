/**
 * Phase 0 Security Rules Verification Specification (Dirty Dozen Test Matrix)
 * Validates all 12 adversarial payloads against firestore.rules.
 * Run with Firebase Emulator Suite & @firebase/rules-unit-testing when executing locally.
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedOutcome: 'PERMISSION_DENIED';
  payloadSummary: Record<string, unknown>;
}

export const DIRTY_DOZEN_TESTS: AdversarialTestCase[] = [
  {
    id: 1,
    name: 'Unverified Email Write',
    collection: 'accounts',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payloadSummary: { email_verified: false, ownerId: 'userA', code: '101' },
  },
  {
    id: 2,
    name: 'Identity Spoofing on Create',
    collection: 'vouchers',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payloadSummary: { authUid: 'userA', ownerId: 'userB', totalDebit: 100, totalCredit: 100 },
  },
  {
    id: 3,
    name: 'Shadow Field Injection',
    collection: 'products',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payloadSummary: { ownerId: 'userA', sku: 'P-1', ghostFlag: true },
  },
  {
    id: 4,
    name: 'Oversized Document ID Poisoning',
    collection: 'parties',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payloadSummary: { docIdLength: 200, ownerId: 'userA' },
  },
  {
    id: 5,
    name: 'Unbalanced Double-Entry Voucher',
    collection: 'vouchers',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payloadSummary: { ownerId: 'userA', totalDebit: 500000, totalCredit: 400000 },
  },
  {
    id: 6,
    name: 'Terminal State Violation on Permanent Voucher',
    collection: 'vouchers',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    payloadSummary: { existingStatus: 'permanent', incomingDescription: 'Tampered' },
  },
  {
    id: 7,
    name: 'PII Blanket Scrape across Users',
    collection: 'users',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    payloadSummary: { authUid: 'userA', targetUserId: 'userB' },
  },
  {
    id: 8,
    name: 'Unscoped List Query on Invoices',
    collection: 'invoices',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED',
    payloadSummary: { authUid: 'userA', whereClause: 'none' },
  },
  {
    id: 9,
    name: 'Client Timestamp Forgery',
    collection: 'cheques',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payloadSummary: { createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 10,
    name: 'Immutable Owner Tampering on Update',
    collection: 'cheques',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    payloadSummary: { existingOwnerId: 'userA', incomingOwnerId: 'userB' },
  },
  {
    id: 11,
    name: 'Value Poisoning on Allowed Update Field',
    collection: 'products',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    payloadSummary: { stock: 'MALICIOUS_STRING_VALUE' },
  },
  {
    id: 12,
    name: 'Self-Assigned Admin Escalation',
    collection: 'admins',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payloadSummary: { targetAdminId: 'userA', role: 'admin' },
  },
];
