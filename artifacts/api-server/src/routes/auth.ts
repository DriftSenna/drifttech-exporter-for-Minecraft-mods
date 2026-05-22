import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

export async function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token));
  const session = sessions[0];
  if (!session || session.expiresAt < new Date()) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  const users = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  const user = users[0];
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  req.user = user;
  next();
}

router.post("/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: "Username and password required" });
      return;
    }
    if (username.length < 3 || username.length > 30) {
      res.status(400).json({ error: "Username must be 3–30 characters" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }
    const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (existing.length > 0) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(usersTable).values({ username, passwordHash }).returning();
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(sessionsTable).values({ userId: user.id, token, expiresAt });
    res.json({ user: { id: user.id, username: user.username }, token });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: "Username and password required" });
      return;
    }
    const users = await db.select().from(usersTable).where(eq(usersTable.username, username));
    const user = users[0];
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(sessionsTable).values({ userId: user.id, token, expiresAt });
    res.json({ user: { id: user.id, username: user.username }, token });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/auth/me", requireAuth, (req: any, res) => {
  const { id, username } = req.user;
  res.json({ user: { id, username } });
});

router.post("/auth/logout", requireAuth, async (req: any, res) => {
  try {
    const token = (req.headers.authorization as string).slice(7);
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Logout failed" });
  }
});

export default router;
