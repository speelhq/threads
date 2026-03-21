import admin from "firebase-admin";
import type { Auth } from "firebase-admin/auth";

const app = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

export const auth: Auth = app.auth();
