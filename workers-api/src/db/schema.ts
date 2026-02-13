import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── Users ───
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role').notNull().default('staff'),
  department: text('department'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Emails ───
export const emails = sqliteTable('emails', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  externalId: text('external_id').unique(),
  subject: text('subject'),
  sender: text('sender'),
  recipient: text('recipient'),
  body: text('body'),
  bodyHtml: text('body_html'),
  category: text('category').default('기타'),
  priority: text('priority').default('medium'),
  status: text('status').default('unread'),
  aiSummary: text('ai_summary'),
  aiDraftResponse: text('ai_draft_response'),
  aiConfidence: integer('ai_confidence'),
  draftResponse: text('draft_response'),
  draftSubject: text('draft_subject'),
  processedBy: integer('processed_by').references(() => users.id),
  receivedAt: text('received_at'),
  processedAt: text('processed_at'),
  sentAt: text('sent_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_emails_status').on(table.status),
  index('idx_emails_category').on(table.category),
  index('idx_emails_received').on(table.receivedAt),
]);

// ─── Email Approvals ───
export const emailApprovals = sqliteTable('email_approvals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  emailId: integer('email_id').notNull().references(() => emails.id),
  stage: text('stage').notNull(),
  approverId: integer('approver_id').references(() => users.id),
  status: text('status').default('pending'),
  comments: text('comments'),
  approvedAt: text('approved_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_email_approvals_email').on(table.emailId),
]);

// ─── Email Attachments ───
export const emailAttachments = sqliteTable('email_attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  emailId: integer('email_id').notNull().references(() => emails.id),
  fileName: text('file_name').notNull(),
  filePath: text('file_path'),
  fileSize: integer('file_size'),
  contentType: text('content_type'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── File Index ───
export const fileIndex = sqliteTable('file_index', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull().unique(),
  fileType: text('file_type'),
  fileSize: integer('file_size'),
  directory: text('directory'),
  lastModified: text('last_modified'),
  isAccessible: integer('is_accessible', { mode: 'boolean' }).default(true),
  aiTags: text('ai_tags'),
  indexedAt: text('indexed_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_file_index_name').on(table.fileName),
]);

// ─── Archived Documents ───
export const archivedDocuments = sqliteTable('archived_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  emailId: integer('email_id').references(() => emails.id),
  documentType: text('document_type').notNull(),
  fileName: text('file_name').notNull(),
  filePath: text('file_path'),
  fileSize: integer('file_size'),
  companyName: text('company_name'),
  category: text('category'),
  description: text('description'),
  archivedDate: text('archived_date').notNull().default(sql`(date('now'))`),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_archives_type').on(table.documentType),
  index('idx_archives_company').on(table.companyName),
]);

// ─── Daily Reports ───
export const dailyReports = sqliteTable('daily_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reportDate: text('report_date').notNull(),
  reportType: text('report_type').notNull(),
  filePath: text('file_path'),
  fileName: text('file_name'),
  generatedBy: integer('generated_by').references(() => users.id),
  emailCount: integer('email_count').default(0),
  inventoryTransactionCount: integer('inventory_transactions').default(0),
  summaryText: text('summary_text'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Exchange Rate History ───
export const exchangeRateHistory = sqliteTable('exchange_rate_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  currencyPair: text('currency_pair').notNull(),
  rate: real('rate').notNull(),
  rateDate: text('rate_date').notNull(),
  source: text('source').default('exchangerate-api'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_exchange_pair_date').on(table.currencyPair, table.rateDate),
]);

// ─── Inventory Items ───
export const inventoryItems = sqliteTable('inventory_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemCode: text('item_code').unique(),
  itemName: text('item_name').notNull(),
  unit: text('unit'),
  currentStock: integer('current_stock').notNull().default(0),
  minStock: integer('min_stock').default(0),
  maxStock: integer('max_stock').default(0),
  unitPrice: real('unit_price').default(0),
  supplier: text('supplier'),
  category: text('category'),
  location: text('location'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_inventory_name').on(table.itemName),
]);

// ─── Inventory Transactions ───
export const inventoryTransactions = sqliteTable('inventory_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => inventoryItems.id),
  transactionType: text('transaction_type').notNull(),
  quantity: integer('quantity').notNull(),
  referenceNumber: text('reference_number'),
  note: text('note'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_inventory_tx_item').on(table.itemId),
]);
