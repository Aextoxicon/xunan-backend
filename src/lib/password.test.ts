import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password", () => {
  it("accepts the original password and rejects a wrong one", async () => {
    const stored = await hashPassword("xunan2026");
    await expect(verifyPassword("xunan2026", stored)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", stored)).resolves.toBe(false);
  });
});
