/* Shared Firebase Auth and Realtime Database client. */
(function () {
  "use strict";

  if (!window.firebase || typeof FIREBASE_CONFIG === "undefined") {
    console.error("[PG-Firebase] SDK or configuration did not load.");
    return;
  }

  try {
    var app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
    var auth = app.auth();
    var database = app.database();
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (error) {
      console.warn("[PG-Firebase] Local sign-in persistence is unavailable:", error);
    });
    window.PG_FIREBASE = { app: app, auth: auth, database: database };
  } catch (error) {
    console.error("[PG-Firebase] Initialization failed:", error);
  }
})();
