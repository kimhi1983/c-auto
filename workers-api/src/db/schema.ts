/**
 * C-Auto D1 Database Schema (Drizzle ORM)
 * 8개 테이블: users, emails, email_approvals, email_attachments,
 *            file_index, archived_documents, daily_reports,
 *            exchange_rate_history, inventory_items, inventory_transactions
 */
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Users ───
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role", { enum: ["admin", "approver", "staff", "viewer"] })
    .notNull()
    .default("staff"),
  department: text("department"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Emails ───
export const emails = sqliteTable("emails", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  externalId: text("external_id").unique(),
  subject: text("subject"),
  sender: text("sender"),
  recipient: text("recipient"),
  body: text("body"),
  bodyHtml: text("body_html"),
  category: text("category", {
    enum: [
      "발주",
      "요청",
      "견적요청",
      "문의",
      "공지",
      "미팅",
      "클레임",
      "기타",
    ],
  }).default("기타"),
  priority: text("priority", { enum: ["high", "medium", "low"] }).default(
    "medium"
  ),
  status: text("status", {
    enum: [
      "unread",
      "read",
      "draft",
      "in_review",
      "approved",
      "rejected",
      "sent",
      "archived",
    ],
  }).default("unread"),
  aiSummary: text("ai_summary"),
  aiDraftResponse: text("ai_draft_response"),
  aiConfidence: integer("ai_confidence"),
  draftResponse: text("draft_response"),
  draftSubject: text("draft_subject"),
  processedBy: integer("processed_by").references(() => users.id),
  receivedAt: text("received_at"),
  processedAt: text("processed_at"),
  sentAt: text("sent_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Email Approvals ───
export const emailApprovals = sqliteTable("email_approvals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  emailId: integer("email_id")
    .notNull()
    .references(() => emails.id),
  stage: text("stage", {
    enum: ["draft", "review", "approval", "send"],
  }).notNull(),
  approverId: integer("approver_id").references(() => users.id),
  status: text("status", {
    enum: ["pending", "approved", "rejected"],
  }).default("pending"),
  comments: text("comments"),
  approvedAt: text("approved_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Email Attachments ───
export const emailAttachments = sqliteTable("email_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  emailId: integer("email_id")
    .notNull()
    .references(() => emails.id),
  fileName: text("file_name").notNull(),
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  contentType: text("content_type"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── File Index ───
export const fileIndex = sqliteTable("file_index", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull().unique(),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  directory: text("directory"),
  lastModified: text("last_modified"),
  isAccessible: integer("is_accessible", { mode: "boolean" }).default(true),
  aiTags: text("ai_tags"),
  indexedAt: text("indexed_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Archived Documents ───
export const archivedDocuments = sqliteTable("archived_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  emailId: integer("email_id").references(() => emails.id),
  documentType: text("document_type", {
    enum: ["pdf", "excel", "email", "report", "ai_document"],
  }).notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  companyName: text("company_name"),
  category: text("category"),
  description: text("description"),
  archivedDate: text("archived_date")
    .notNull()
    .default(sql`(date('now'))`),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Daily Reports ───
export const dailyReports = sqliteTable("daily_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportDate: text("report_date").notNull(),
  reportType: text("report_type", {
    enum: ["daily", "weekly", "monthly"],
  }).notNull(),
  filePath: text("file_path"),
  fileName: text("file_name"),
  generatedBy: integer("generated_by").references(() => users.id),
  emailCount: integer("email_count").default(0),
  inventoryTransactions: integer("inventory_transactions").default(0),
  summaryText: text("summary_text"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Exchange Rate History ───
export const exchangeRateHistory = sqliteTable("exchange_rate_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  currencyPair: text("currency_pair").notNull(),
  rate: real("rate").notNull(),
  rateDate: text("rate_date").notNull(),
  source: text("source").default("exchangerate-api"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Inventory Items ───
export const inventoryItems = sqliteTable("inventory_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemCode: text("item_code").unique(),
  itemName: text("item_name").notNull(),
  unit: text("unit"),
  currentStock: integer("current_stock").notNull().default(0),
  minStock: integer("min_stock").default(0),
  maxStock: integer("max_stock").default(0),
  unitPrice: real("unit_price").default(0),
  supplier: text("supplier"),
  category: text("category"),
  location: text("location"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Inventory Transactions ───
export const inventoryTransactions = sqliteTable("inventory_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  transactionType: text("transaction_type", {
    enum: ["입고", "출고"],
  }).notNull(),
  quantity: integer("quantity").notNull(),
  referenceNumber: text("reference_number"),
  note: text("note"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Type exports ───
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type ExchangeRate = typeof exchangeRateHistory.$inferSelect;
