# Holoo Corporate Apex ERP — Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Tenant Ownership**: Every accounting record (`accounts`, `parties`, `products`, `vouchers`, `invoices`, `cheques`, `employees`, `assets`, `costCenters`) MUST contain `ownerId == request.auth.uid` and can only be read, queried, created, updated, or deleted by its verified owner (`request.auth.token.email_verified == true`) or a verified admin.
2. **PII Isolation**: `users/{userId}` stores personal/company contact metadata and is strictly restricted to `request.auth.uid == userId` (no blanket `isSignedIn()` reads).
3. **Balanced Double-Entry Integrity**: Every `vouchers` document must contain `lines` with between 2 and 100 entries, `totalDebit >= 0`, `totalCredit >= 0`, and `totalDebit == totalCredit`. Permanent (`status == 'permanent'`) vouchers are terminally locked from modification by non-admins.
4. **Invoice & Cheque Terminal Locks**: Cancelled invoices and cancelled cheques cannot be mutated by non-admins.
5. **Temporal Integrity & Immutability**: `createdAt == request.time` on create, `updatedAt == request.time` on update, and `ownerId` + `createdAt` are immutable after creation.
6. **Zero Privilege Escalation**: `users/{userId}` creation restricts `role == 'accountant'` and `admins/{adminId}` forbids all client writes.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Write**: Authenticated user with `email_verified: false` tries to create an `accounts` document -> MUST FAIL (`PERMISSION_DENIED`).
2. **Identity Spoofing on Create**: User A tries to create a `vouchers` doc with `ownerId: "user_B"` -> MUST FAIL.
3. **Shadow Field Injection**: User creates a `products` doc with extra ghost field `isAdminApproved: true` -> MUST FAIL (`hasOnly`).
4. **Oversized Document ID Poisoning**: User creates `parties/<200-char-id>` -> MUST FAIL (`isValidId`).
5. **Unbalanced Double-Entry Voucher**: User creates a `vouchers` doc with `totalDebit: 1000, totalCredit: 500` -> MUST FAIL.
6. **Terminal State Violation (Permanent Voucher)**: Non-admin updates a `vouchers` doc whose `existing().status == 'permanent'` -> MUST FAIL.
7. **PII Blanket Scrape**: User A attempts `get` on `/users/user_B` -> MUST FAIL.
8. **Unscoped List Query**: User A runs an unfiltered `list` on `/invoices` without matching `ownerId == userA` -> MUST FAIL.
9. **Client Timestamp Forgery**: User submits `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()` -> MUST FAIL.
10. **Immutable Owner Tampering**: User A updates their `cheques` doc trying to change `ownerId` to `user_B` -> MUST FAIL.
11. **Value Poisoning on Allowed Update Field**: User updates `products.stock` to `"not-a-number"` -> MUST FAIL (`isValidProduct`).
12. **Self-Assigned Admin Escalation**: User creates `/users/{uid}` with `role: "admin"` or writes to `/admins/{uid}` -> MUST FAIL.
