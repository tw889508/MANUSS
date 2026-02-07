import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, accounts, tasks, type InsertAccount, type InsertTask, type ConversationMessage } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── User Helpers ───────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Account Helpers ────────────────────────────────────────────

export async function createAccount(data: Omit<InsertAccount, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(accounts).values(data);
  const insertId = result[0].insertId;
  return { id: insertId, ...data };
}

export async function listAccountsByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select({
      id: accounts.id,
      name: accounts.name,
      apiBaseUrl: accounts.apiBaseUrl,
      isDefault: accounts.isDefault,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(desc(accounts.isDefault), desc(accounts.createdAt));
}

export async function getAccountById(accountId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function deleteAccount(accountId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(accounts).where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
}

export async function setDefaultAccount(accountId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Clear all defaults for this user
  await db.update(accounts).set({ isDefault: 0 }).where(eq(accounts.userId, userId));
  // Set the new default
  await db.update(accounts).set({ isDefault: 1 }).where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
}

// ─── Task Helpers ───────────────────────────────────────────────

export async function createTask(data: Omit<InsertTask, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(tasks).values(data);
  const insertId = result[0].insertId;
  return { id: insertId, ...data };
}

export async function getTaskById(taskId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getTaskByManusId(manusTaskId: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.manusTaskId, manusTaskId), eq(tasks.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function listTasksByUser(userId: number, accountId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(tasks.userId, userId)];
  if (accountId) {
    conditions.push(eq(tasks.accountId, accountId));
  }

  return db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.updatedAt));
}

export async function updateTask(
  taskId: number,
  userId: number,
  data: Partial<Pick<InsertTask, "title" | "status" | "taskUrl" | "shareUrl" | "creditUsage" | "conversationHistory">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(tasks)
    .set(data)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
}

export async function deleteTask(taskId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
}
