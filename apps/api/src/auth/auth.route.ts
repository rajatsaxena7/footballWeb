
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { FirebaseAppError } from "firebase-admin/app";
import { DatabaseError } from "pg";


import { pool } from "../db/pool.js";
import { verifyFirebaseToken } from "./verify-firebase-token.js";
import { createAcessToken } from "./acess-token.js";
import { FirebaseAuthError } from "firebase-admin/auth";
import { requireAuth } from "./require-auth.js";
import { generateRefreshToken, hashRefreshToken, getRefreshTokenExpiry } from "./refresh-token.js";
import { setRefreshCookie, clearRefreshCookie } from "./refresh-cookie.js";
import { string } from "zod/v4";

export const authRouter = Router();

authRouter.get("/me",requireAuth,async(req,res,next)=>{
  try{
    const userId=res.locals.userId as string;

    const result =await pool.query(
      `SELECT id,username,display_name,email,phone_number,email_verified,phone_verified,created_at
      
      FROM users
      WHERE id=$1`,
      [userId]
    );
    const user =result.rows[0];

    if(!user){
      res.status(200).json({user});
      return;
    }
  }catch(error){
      next(error);
    }
})

authRouter.post("/refresh", async (req, res, next) => {
  const oldToken: unknown = req.cookies?.refreshToken;

  if (typeof oldToken !== "string" || !oldToken) {
    res.status(401).json({ error: "Refresh token required" });
    return;
  }

  let client;

  try {
    const oldHash = hashRefreshToken(oldToken);
    client = await pool.connect();

    await client.query("BEGIN");

    const result = await client.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_sessions
       WHERE token_hash = $1
       FOR UPDATE`,
      [oldHash],
    );

    const session = result.rows[0];

    if (!session) {
      await client.query("ROLLBACK");
      clearRefreshCookie(res);
      res.status(401).json({ error: "Invalid refresh session" });
      return;
    }

    if (session.revoked_at) {
      // A previously revoked token was reused.
      await client.query(
        `UPDATE refresh_sessions
         SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE user_id = $1`,
        [session.user_id],
      );

      await client.query("COMMIT");
      clearRefreshCookie(res);
      res.status(401).json({ error: "Refresh session revoked" });
      return;
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      clearRefreshCookie(res);
      res.status(401).json({ error: "Refresh session expired" });
      return;
    }

    const newToken = generateRefreshToken();
    const newHash = hashRefreshToken(newToken);
    const expiresAt = getRefreshTokenExpiry();

    // Prepare the access token before committing the rotation.
    const accessToken = await createAcessToken(session.user_id);

    await client.query(
      `UPDATE refresh_sessions
       SET revoked_at = NOW(), last_used_at = NOW()
       WHERE id = $1`,
      [session.id],
    );

    await client.query(
      `INSERT INTO refresh_sessions
         (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [session.user_id, newHash, expiresAt],
    );

    await client.query("COMMIT");

    setRefreshCookie(res, newToken, expiresAt);

    res.status(200).json({
      accessToken,
      tokenType: "Bearer",
      expiresIn: 900,
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => undefined);
    }

    next(error);
  } finally {
    client?.release();
  }
});


authRouter.post("/firebase", async (req, res, next) => {
  const idToken: unknown = req.body?.idToken;

  if (typeof idToken !== "string" || !idToken.trim()) {
    res.status(400).json({
      error: "idToken is required",
    });
    return;
  }

  let firebaseUser;

  try {
    firebaseUser = await verifyFirebaseToken(idToken);
  } catch (error) {
    if (
      error instanceof FirebaseAuthError ||
      (error instanceof Error &&
        "code" in error &&
        typeof error.code === "string" &&
        error.code.startsWith("auth/"))
    ) {
      res.status(401).json({
        error: "Invalid or expired Firebase ID token",
      });
      return;
    }

    next(error);
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const identityResult = await client.query<{
      user_id: string;
    }>(
      `SELECT user_id
       FROM auth_identities
       WHERE provider = $1 AND provider_subject = $2
       FOR UPDATE`,
      ["firebase", firebaseUser.uid],
    );

    let userId: string;

    if (identityResult.rowCount && identityResult.rows[0]) {
      userId = identityResult.rows[0].user_id;

      await client.query(
        `UPDATE users
         SET email = COALESCE(email, $1),
             display_name = COALESCE(display_name, $2),
             phone_number = COALESCE(phone_number, $3),
             email_verified = email_verified OR $4,
             phone_verified = phone_verified OR $5,
             updated_at = NOW()
         WHERE id = $6`,
        [
          firebaseUser.email,
          firebaseUser.name,
          firebaseUser.phoneNumber,
          firebaseUser.emailVerified,
          firebaseUser.signInProvider === "phone",
          userId,
        ],
      );
    } else {
      userId = randomUUID();

      const username = `fan_${randomUUID().replaceAll("-", "").slice(0, 16)}`;

      await client.query(
        `INSERT INTO users (
           id, username, email, display_name, phone_number,
           email_verified, phone_verified, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [
          userId,
          username,
          firebaseUser.email,
          firebaseUser.name,
          firebaseUser.phoneNumber,
          firebaseUser.emailVerified,
          firebaseUser.signInProvider === "phone",
        ],
      );

      await client.query(
        `INSERT INTO auth_identities (
           user_id, provider, provider_subject, created_at
         )
         VALUES ($1, $2, $3, NOW())`,
        [userId, "firebase", firebaseUser.uid],
      );
    }

   const accessToken = await createAcessToken(userId);

const refreshToken = generateRefreshToken();
const refreshTokenHash = hashRefreshToken(refreshToken);
const refreshExpiresAt = getRefreshTokenExpiry();

await client.query(
  `INSERT INTO refresh_sessions (user_id, token_hash, expires_at)
   VALUES ($1, $2, $3)`,
  [userId, refreshTokenHash, refreshExpiresAt],
);

await client.query("COMMIT");

setRefreshCookie(res, refreshToken, refreshExpiresAt);

res.status(200).json({
  user: {
    id: userId,
    email: firebaseUser.email,
    displayName: firebaseUser.name,
    phoneNumber: firebaseUser.phoneNumber,
  },
  accessToken,
  tokenType: "Bearer",
  expiresIn: 900,
});
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);

    if (
      error instanceof DatabaseError &&
      error.code === "23505"
    ) {
      res.status(409).json({
        error:
          "This email or phone number may already belong to another account. Sign in to that account or link identities explicitly.",
      });
      return;
    }

    next(error);
  } finally {
    client.release();
  }
});


authRouter.post("/logout", async (req, res, next) => {
  const refreshToken: unknown = req.cookies?.refreshToken;

  try {
    if (typeof refreshToken === "string" && refreshToken.length > 0) {
      const tokenHash = hashRefreshToken(refreshToken);

      await pool.query(
        `UPDATE refresh_sessions
         SET revoked_at = NOW(), last_used_at = NOW()
         WHERE token_hash = $1
           AND revoked_at IS NULL`,
        [tokenHash],
      );
    }

    clearRefreshCookie(res);
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout-all", requireAuth, async (_req, res, next) => {
  try {
    const userId = res.locals.userId as string;

    await pool.query(
      `UPDATE refresh_sessions
       SET revoked_at = NOW(), last_used_at = NOW()
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [userId],
    );

    clearRefreshCookie(res);

    res.status(200).json({
      message: "All sessions logged out successfully",
    });
  } catch (error) {
    next(error);
  }
});

