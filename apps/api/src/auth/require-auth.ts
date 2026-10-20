import {Request,Response,NextFunction} from "express";
import {verifyAccessToken} from "./verify-access-token.js";


export async function requireAuth (
    req:Request,
    res:Response,
    next:NextFunction
):Promise<void>{
    const authHeader =req.headers.authorization;


    if(!authHeader || !authHeader.startsWith("Bearer")){
        res.status(401).json({error:"Authentication required"});
        return;
    }

    const token = authHeader.slice(7).trim();

    if(!token){
        res.status(401).json({error:"Authentication required"});
        return;
    }

    try{
        const {userId}= await verifyAccessToken(token);

        res.locals.userId=userId;
        next();
    }catch{
        res.status(401).json({error:"Invalid or expired acess token"});
    }
}