
import { jwtVerify,  } from "jose";
import { JOSEAlgNotAllowed } from "jose/errors";
import { jwt } from "zod/v4";

const issuer = process.env.JWT_ISSUER ?? "stadiumlive-api";
const audience = process.env.JWT_AUDIENCE ?? "stadiumlive-web";

function getSigningKey(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error("Missing JWT_ACCESS_SECRET");
  }

  const key = Buffer.from(secret, "base64url");

  if (key.length < 32) {
    throw new Error("JWT_ACCESS_SECRET must decode to at least 32 bytes");
  }

  return key;
}

export interface VerifiedAccessToken {
  userId: string;
}

export async function verifyAccessToken(
  token: string,
): Promise<VerifiedAccessToken> {
    const {payload}=await jwtVerify(token,getSigningKey(),{
        algorithms:["HS256"],
        issuer,
        audience
    });

    if(
        typeof payload.sub!=='string'||payload.sub.length===0
    ){
        throw new Error("INVALID_ACCESS_TOKEN_SUBJECT");
    }

    if(payload.tokenUse !=="acess"){
        throw new Error("INVALID_ACCESS_TOKEN_USE");
    }

    return {
        userId:payload.sub,
    }
  // TODO 1: Verify the JWT signature and claims using jwtVerify().
  // Hint: pass the token, getSigningKey(), and an options object.

  // TODO 2: Restrict the allowed algorithm to HS256.
  // TODO 3: Validate issuer and audience.
  // TODO 4: Read the verified payload's subject and tokenUse.
  // TODO 5: Reject the token if subject is missing or tokenUse is incorrect.
  // TODO 6: Return { userId: subject }.

  throw new Error("TODO: implement verifyAccessToken");
}
