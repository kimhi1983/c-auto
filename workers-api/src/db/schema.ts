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
  aiAnalysis: text('ai_analysis'),
  dropboxPath: text('dropbox_path'),
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

// ─── Commodity Trend Reports (원료가격트렌드 이력) ───
export const commodityTrendReports = sqliteTable('commodity_trend_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reportDate: text('report_date').notNull(),
  commoditiesData: text('commodities_data').notNull(),
  exchangeRates: text('exchange_rates'),
  analysis: text('analysis'),
  generatedAt: text('generated_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_ctr_date').on(table.reportDate),
]);

// ─── Order Workflows (주문처리 워크플로우) ───
export const orderWorkflows = sqliteTable('order_workflows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workflowType: text('workflow_type').notNull(),
  status: text('status').notNull().default('ERP_SUBMITTED'),
  ioDate: text('io_date').notNull(),
  custCd: text('cust_cd'),
  custName: text('cust_name'),
  itemsData: text('items_data').notNull(),
  totalAmount: real('total_amount').default(0),
  erpResult: text('erp_result'),
  erpSubmittedAt: text('erp_submitted_at'),
  step2At: text('step2_at'),
  step3At: text('step3_at'),
  step4At: text('step4_at'),
  step5At: text('step5_at'),
  note: text('note'),
  createdBy: integer('created_by'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_ow_type').on(table.workflowType),
  index('idx_ow_status').on(table.status),
  index('idx_ow_date').on(table.ioDate),
]);

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

// ─── Companies (거래처) ───
export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyCd: text('company_cd'),
  companyNm: text('company_nm').notNull(),
  ceoNm: text('ceo_nm'),
  bizNo: text('biz_no'),
  tel: text('tel'),
  fax: text('fax'),
  email: text('email'),
  addr: text('addr'),
  memo: text('memo'),
  managerNm: text('manager_nm'),
  managerTel: text('manager_tel'),
  managerEmail: text('manager_email'),
  companyType: text('company_type'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  kprosIdx: integer('kpros_idx'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_companies_name').on(table.companyNm),
  index('idx_companies_cd').on(table.companyCd),
  index('idx_companies_biz_no').on(table.bizNo),
]);

// ═══════════════════════════════════════════
// KPROS 물류관리 테이블 (7개)
// ═══════════════════════════════════════════

// ─── 매입등록 (Purchase Orders) ───
export const kprosPurchases = sqliteTable('kpros_purchases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kprosIdx: integer('kpros_idx').unique(),
  productNm: text('product_nm').notNull(),
  braNm: text('bra_nm'),
  companyNm: text('company_nm'),
  cost: real('cost'),
  incomeCost: real('income_cost'),
  incomeCostUnitNm: text('income_cost_unit_nm'),
  lotNo: text('lot_no'),
  purchaseDate: text('purchase_date'),
  purchaseStatus: text('purchase_status'),
  warehouseNm: text('warehouse_nm'),
  totalPurchaseQty: real('total_purchase_qty'),
  pkgUnitNm: text('pkg_unit_nm'),
  manuDate: text('manu_date'),
  validDate: text('valid_date'),
  expectWearingDate: text('expect_wearing_date'),
  realWearingDate: text('real_wearing_date'),
  prchNo: text('prch_no'),
  syncedAt: text('synced_at').notNull().default(sql`(datetime('now'))`),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_kp_purchases_date').on(table.purchaseDate),
  index('idx_kp_purchases_company').on(table.companyNm),
  index('idx_kp_purchases_product').on(table.productNm),
  index('idx_kp_purchases_lot').on(table.lotNo),
]);

// ─── 납품등록 (Delivery Orders) ───
export const kprosDeliveries = sqliteTable('kpros_deliveries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kprosIdx: integer('kpros_idx').unique(),
  companyFromNm: text('company_from_nm'),
  companyToNm: text('company_to_nm'),
  productNm: text('product_nm'),
  dueDate: text('due_date'),
  deliveryStatus: text('delivery_status'),
  deliveryStatusStr: text('delivery_status_str'),
  deliveryBigo: text('delivery_bigo'),
  warehouseNm: text('warehouse_nm'),
  expectQty: real('expect_qty'),
  realQty: real('real_qty'),
  lotNo: text('lot_no'),
  dvrNo: text('dvr_no'),
  orderDate: text('order_date'),
  orderMethod: text('order_method'),
  pkgUnitNm: text('pkg_unit_nm'),
  syncedAt: text('synced_at').notNull().default(sql`(datetime('now'))`),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_kp_deliveries_due').on(table.dueDate),
  index('idx_kp_deliveries_company').on(table.companyToNm),
  index('idx_kp_deliveries_product').on(table.productNm),
]);

// ─── 입고반영 (Inbound Confirmation) ───
export const kprosInbound = sqliteTable('kpros_inbound', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kprosIdx: integer('kpros_idx').unique(),
  purchaseIdx: integer('purchase_idx'),
  productNm: text('product_nm'),
  braNm: text('bra_nm'),
  companyNm: text('company_nm'),
  warehouseNm: text('warehouse_nm'),
  totalPurchaseQty: real('total_purchase_qty'),
  lotNo: text('lot_no'),
  purchaseDate: text('purchase_date'),
  purchaseStatus: text('purchase_status'),
  expectWearingDate: text('expect_wearing_date'),
  realWearingDate: text('real_wearing_date'),
  syncedAt: text('synced_at').notNull().default(sql`(datetime('now'))`),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_kp_inbound_date').on(table.realWearingDate),
  index('idx_kp_inbound_purchase').on(table.purchaseIdx),
]);

// ─── 출고반영 (Outbound Confirmation) ───
export const kprosOutbound = sqliteTable('kpros_outbound', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kprosIdx: integer('kpros_idx').unique(),
  deliveryIdx: integer('delivery_idx'),
  companyToNm: text('company_to_nm'),
  productNm: text('product_nm'),
  warehouseNm: text('warehouse_nm'),
  expectQty: real('expect_qty'),
  realQty: real('real_qty'),
  lotNo: text('lot_no'),
  dueDate: text('due_date'),
  deliveryStatus: text('delivery_status'),
  syncedAt: text('synced_at').notNull().default(sql`(datetime('now'))`),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_kp_outbound_date').on(table.dueDate),
  index('idx_kp_outbound_delivery').on(table.deliveryIdx),
]);

// ─── 창고입고 (Warehouse Receipt) ───
export const kprosWarehouseIn = sqliteTable('kpros_warehouse_in', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kprosIdx: integer('kpros_idx').unique(),
  productNm: text('product_nm'),
  braNm: text('bra_nm'),
  warehouseNm: text('warehouse_nm'),
  companyNm: text('company_nm'),
  totalPurchaseQty: real('total_purchase_qty'),
  lotNo: text('lot_no'),
  purchaseDate: text('purchase_date'),
  realWearingDate: text('real_wearing_date'),
  purchaseStatus: text('purchase_status'),
  syncedAt: text('synced_at').notNull().default(sql`(datetime('now'))`),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_kp_wh_in_date').on(table.realWearingDate),
]);

// ─── 창고출고 (Warehouse Release) ───
export const kprosWarehouseOut = sqliteTable('kpros_warehouse_out', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kprosIdx: integer('kpros_idx').unique(),
  companyToNm: text('company_to_nm'),
  productNm: text('product_nm'),
  warehouseNm: text('warehouse_nm'),
  expectQty: real('expect_qty'),
  realQty: real('real_qty'),
  lotNo: text('lot_no'),
  dueDate: text('due_date'),
  deliveryStatus: text('delivery_status'),
  dvrNo: text('dvr_no'),
  syncedAt: text('synced_at').notNull().default(sql`(datetime('now'))`),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_kp_wh_out_date').on(table.dueDate),
]);

// ─── 성적서 CoA (Certificates of Analysis) ───
export const kprosCoa = sqliteTable('kpros_coa', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productIdx: integer('product_idx'),
  productNm: text('product_nm').notNull(),
  warehouseNm: text('warehouse_nm'),
  lotNo: text('lot_no'),
  companyNm: text('company_nm'),
  manuDate: text('manu_date'),
  validDate: text('valid_date'),
  braNm: text('bra_nm'),
  reportsExist: integer('reports_exist').default(0),
  pkgAmount: real('pkg_amount'),
  pkgUnitNm: text('pkg_unit_nm'),
  totalAmount: real('total_amount'),
  syncedAt: text('synced_at').notNull().default(sql`(datetime('now'))`),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_kp_coa_product').on(table.productNm),
  index('idx_kp_coa_lot').on(table.lotNo),
  index('idx_kp_coa_valid').on(table.validDate),
]);
