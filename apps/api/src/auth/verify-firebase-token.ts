import {firebaseAuth } from "./firebase-admin.js";

export interface VerfiedFirebaseUser{
    uid:string,
    email:string|null;
    name:string|null;
    emailVerified:boolean;
    phoneNumber:string|null;
    signInProvider:string|null;
}


export async function verifyFirebaseToken(
    idToken :string,
):Promise<VerfiedFirebaseUser>{
    if(!idToken ||typeof idToken !== "string"){
        throw new Error("FIREBASE_TOKEN_MISSING");
    }

    const decodedToken =await firebaseAuth.verifyIdToken(idToken);

    return {
        uid:decodedToken.uid,
        email:decodedToken.email??null,
        name:decodedToken.name?? null,
        phoneNumber:decodedToken.phone_number??null,
        emailVerified:decodedToken.email_verified?? false,
        signInProvider:decodedToken.firebase?.sign_in_provider??null,
    };
}