import {SignJWT} from "jose";

const issuer =process.env.JWT_ISSUER ?? "stadiumlive-api";
const audience=process.env.JWT_AUDIENCE ?? "stadiumlive-web";

function getSigningKey():Uint8Array{
    const secret=process.env.JWT_ACCESS_SECRET;
    if(!secret){
        throw new Error("Mising JWT ACESS_SECRET");
    }

    const key = Buffer.from(secret,"base64url");

    if(key.length<32){
        throw new Error ("JWT_ACCESS_SECRET must decode at least 32 bytes");

    }

    return key;

}

export async function createAcessToken(userId:string):Promise<string>{
  return new SignJWT({tokenUse:"acess"})
  .setProtectedHeader({alg:"HS256",typ:"JWT"})
  .setSubject(userId)
  .setIssuer(issuer)
  .setAudience(audience)
  .setIssuedAt()
  .setExpirationTime("15m")
  .sign(getSigningKey());
}
