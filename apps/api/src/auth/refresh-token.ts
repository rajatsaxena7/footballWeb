import {createHash,randomBytes} from"node:crypto";

export function generateRefreshToken():string{
    return randomBytes(32).toString("hex");
}

export function hashRefreshToken(token:string):string{
    return createHash("sha256").update(token).digest("hex");
}


export function getRefreshTokenExpiry():Date{
    const days=Number(process.env.REFRESH_TOKEN_DAYS??30);

    if(!Number.isInteger(days)||days<1||days>365){
        throw new Error("REFRESH_TOKEN_DAYS must be between 1 and 365");
    }

    return new Date(Date.now()+ days *24 *60 *60*1000);
}