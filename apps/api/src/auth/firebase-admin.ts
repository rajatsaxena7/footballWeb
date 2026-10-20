import "dotenv/config";

import {
    applicationDefault,
    getApps,
    initializeApp,
}  from "firebase-admin/app";


import {getAuth} from "firebase-admin/auth";


const projectId=process.env.FIREBASE_PROJECT_ID;

if(!projectId){
    throw new Error ("Missing FIREBASE_PROJECT_ID in apps/api/.env")

}

const existingApp=getApps().find(
    (app)=>app.name==="[DEFAULT]",
);


const firebaseApp = existingApp ?? initializeApp ({
    credential:applicationDefault(),
    projectId,
});


export const firebaseAuth = getAuth(firebaseApp);