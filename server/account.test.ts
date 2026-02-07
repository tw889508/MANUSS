import { describe, expect, it, vi, beforeEach } from "vitest";
import { encrypt, decrypt } from "./crypto";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Crypto Module Tests ────────────────────────────────────────

describe("crypto", () => {
  it("encrypts and decrypts a string correctly", () => {
    const plaintext = "sk-test-api-key-12345";
    const encrypted = encrypt(plaintext);

    // Encrypted should be different from plaintext
    expect(encrypted).not.toBe(plaintext);
    // Encrypted should be a hex string
    expect(encrypted).toMatch(/^[0-9a-f]+$/);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const plaintext = "same-key-twice";
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);

    // Different IVs should produce different ciphertexts
    expect(encrypted1).not.toBe(encrypted2);

    // But both should decrypt to the same value
    expect(decrypt(encrypted1)).toBe(plaintext);
    expect(decrypt(encrypted2)).toBe(plaintext);
  });

  it("handles empty string", () => {
    const encrypted = encrypt("");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  it("handles unicode characters", () => {
    const plaintext = "密钥测试-🔑-key";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("test-key");
    // Tamper with the ciphertext portion (after IV + tag = 64 hex chars)
    const tampered = encrypted.slice(0, 64) + "ff" + encrypted.slice(66);
    expect(() => decrypt(tampered)).toThrow();
  });
});

// ─── Account Router Tests ───────────────────────────────────────

// Mock the database functions
vi.mock("./db", () => {
  let accountStore: any[] = [];
  let idCounter = 1;

  return {
    createAccount: vi.fn(async (data: any) => {
      const account = { id: idCounter++, ...data };
      accountStore.push(account);
      return account;
    }),
    listAccountsByUser: vi.fn(async (userId: number) => {
      return accountStore
        .filter((a) => a.userId === userId)
        .map(({ apiKeyEncrypted, ...rest }) => rest);
    }),
    getAccountById: vi.fn(async (accountId: number, userId: number) => {
      return accountStore.find((a) => a.id === accountId && a.userId === userId) || null;
    }),
    deleteAccount: vi.fn(async (accountId: number, userId: number) => {
      accountStore = accountStore.filter((a) => !(a.id === accountId && a.userId === userId));
    }),
    setDefaultAccount: vi.fn(async (accountId: number, userId: number) => {
      accountStore.forEach((a) => {
        if (a.userId === userId) a.isDefault = a.id === accountId ? 1 : 0;
      });
    }),
    // Also mock other db exports that routers.ts might import transitively
    upsertUser: vi.fn(),
    getUserByOpenId: vi.fn(),
    getDb: vi.fn(),
    createTask: vi.fn(),
    getTaskById: vi.fn(),
    getTaskByManusId: vi.fn(),
    listTasksByUser: vi.fn(async () => []),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  };
});

// Mock the MANUS proxy
vi.mock("./manusProxy", () => ({
  listManusTasks: vi.fn(async () => ({ data: [], has_more: false })),
  createManusTask: vi.fn(),
  continueManusTask: vi.fn(),
  getManusTask: vi.fn(),
  deleteManusTask: vi.fn(),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `user${userId}@test.com`,
    name: `Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

function createUnauthContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("account router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication for account.create", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.account.create({ name: "Test", apiKey: "sk-test" })
    ).rejects.toThrow();
  });

  it("creates an account with encrypted API key", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.account.create({
      name: "My MANUS Account",
      apiKey: "sk-real-api-key-123",
    });

    expect(result).toHaveProperty("id");
    expect(result.name).toBe("My MANUS Account");
    expect(result.apiBaseUrl).toBe("https://api.manus.im");
    // Should NOT return the encrypted key
    expect(result).not.toHaveProperty("apiKeyEncrypted");
    expect(result).not.toHaveProperty("apiKey");
  });

  it("creates an account with custom base URL", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.account.create({
      name: "Custom Endpoint",
      apiKey: "sk-custom-key",
      apiBaseUrl: "https://custom.manus.api/v1",
    });

    expect(result.apiBaseUrl).toBe("https://custom.manus.api/v1");
  });

  it("lists accounts for the current user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.account.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("requires authentication for account.list", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.account.list()).rejects.toThrow();
  });

  it("deletes an account", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create first
    const created = await caller.account.create({
      name: "To Delete",
      apiKey: "sk-delete-me",
    });

    const result = await caller.account.delete({ accountId: created.id });
    expect(result).toEqual({ success: true });
  });

  it("throws NOT_FOUND when deleting non-existent account", async () => {
    const { ctx } = createAuthContext(99);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.account.delete({ accountId: 99999 })
    ).rejects.toThrow("Account not found");
  });

  it("sets an account as default", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const created = await caller.account.create({
      name: "Default Account",
      apiKey: "sk-default",
    });

    const result = await caller.account.setDefault({ accountId: created.id });
    expect(result).toEqual({ success: true });
  });

  it("tests an account connection", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const created = await caller.account.create({
      name: "Test Connection",
      apiKey: "sk-test-connection",
    });

    const result = await caller.account.test({ accountId: created.id });
    // The mock returns success
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("message");
    expect(result.success).toBe(true);
  });

  it("validates input: rejects empty account name", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.account.create({ name: "", apiKey: "sk-test" })
    ).rejects.toThrow();
  });

  it("validates input: rejects empty API key", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.account.create({ name: "Test", apiKey: "" })
    ).rejects.toThrow();
  });

  it("validates input: rejects invalid base URL", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.account.create({
        name: "Test",
        apiKey: "sk-test",
        apiBaseUrl: "not-a-url",
      })
    ).rejects.toThrow();
  });
});
