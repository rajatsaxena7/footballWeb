
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { FirebaseAppError } from "firebase-admin/app";
import { DatabaseError } from "pg";

import { pool } from "../db/pool.js";
import { verifyFirebaseToken } from "./verify-firebase-token.js";
import { createAcessToken } from "./acess-token.js";
import { FirebaseAuthError } from "firebase-admin/auth";

export const authRouter = Router();

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

    await client.query("COMMIT");

    const accessToken = await createAcessToken(userId);

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
