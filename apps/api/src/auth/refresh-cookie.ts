import type { Response} from "express";

const isProduction =process.env.NODE_ENV==="production";

export const refreshCookieOptions ={
    httpOnly:true,
    secure:isProduction,
    sameSite:"lax" as const,
    path:"/auth"
};

export function setRefreshCookie(
    res:Response,
    token:string,
    expiresAt:Date,
):void{
    res.cookie("refreshToken",token,{
        ...refreshCookieOptions,
        expires:expiresAt
    });
}

export function clearRefreshCookie(res:Response):void{
    res.clearCookie("refreshToken",refreshCookieOptions);
}