import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * MANUS API accounts - stores encrypted API keys for each user.
 */
export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  apiKeyEncrypted: text("apiKeyEncrypted").notNull(),
  apiBaseUrl: varchar("apiBaseUrl", { length: 512 }).default("https://api.manus.im").notNull(),
  isDefault: int("isDefault").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

/**
 * Tasks - stores MANUS task info and conversation history.
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  manusTaskId: varchar("manusTaskId", { length: 128 }).notNull(),
  userId: int("userId").notNull(),
  accountId: int("accountId").notNull(),
  title: varchar("title", { length: 512 }).default("Untitled Task"),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "unknown"]).default("unknown").notNull(),
  agentProfile: varchar("agentProfile", { length: 64 }).default("manus-1.6"),
  taskMode: varchar("taskMode", { length: 32 }).default("agent"),
  projectId: varchar("projectId", { length: 128 }),
  taskUrl: varchar("taskUrl", { length: 512 }),
  shareUrl: varchar("shareUrl", { length: 512 }),
  creditUsage: int("creditUsage").default(0),
  conversationHistory: json("conversationHistory").$type<ConversationMessage[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * Conversation message type for JSON column.
 */
export interface ConversationMessage {
  id?: string;
  role: "user" | "assistant";
  content: ConversationContent[];
  timestamp?: number;
}

export interface ConversationContent {
  type: "text" | "file" | "image";
  text?: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
}
