// ============================================================
//  firebase-tracker.js — מעקב אנליטיקה למערכת פגישונים
//  ============================================================
//  קובץ זה עוקב אחר:
//    • צפיות בדף (page views)
//    • סוג המכשיר (mobile / tablet / desktop)
//    • דפדפן ומערכת הפעלה
//    • אישורים שנוצרו
//    • שעת שימוש
//  ============================================================

(function () {
  "use strict";

  // ── 1. Guard: אל תטען אם אין config ──────────────────────
  if (typeof FIREBASE_CONFIG === "undefined") {
    console.warn("[PG-Track] firebase-config.js לא נטען — אנליטיקה מושבתת");
    return;
  }

  // Prevent duplicate analytics if this script is included more than once.
  if (window.__pgFirebaseTrackerLoaded) return;
  window.__pgFirebaseTrackerLoaded = true;

  // ── 2. זיהוי מכשיר ──────────────────────────────────────
  function getDeviceType() {
    var ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
    if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) return "mobile";
    return "desktop";
  }

  function getBrowser() {
    var ua = navigator.userAgent;
    if (/edg\//i.test(ua))     return "Edge";
    if (/opr\//i.test(ua))     return "Opera";
    if (/chrome/i.test(ua))    return "Chrome";
    if (/safari/i.test(ua))    return "Safari";
    if (/firefox/i.test(ua))   return "Firefox";
    if (/msie|trident/i.test(ua)) return "IE";
    return "Other";
  }

  function getOS() {
    var ua = navigator.userAgent;
    if (/android/i.test(ua))                          return "Android";
    if (/iphone|ipad|ipod/i.test(ua))                 return "iOS";
    if (/windows phone/i.test(ua))                    return "Windows Phone";
    if (/win/i.test(ua))                              return "Windows";
    if (/mac/i.test(ua))                              return "macOS";
    if (/linux/i.test(ua))                            return "Linux";
    return "Other";
  }

  // ── 3. Session ID (per-tab, random, no personal data) ───
  function getSessionId() {
    try {
      var id = sessionStorage.getItem("pg_sid");
      if (!id) {
        id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem("pg_sid", id);
      }
      return id;
    } catch (e) {
      return "anon_" + Math.random().toString(36).slice(2, 10);
    }
  }

  // ── Anonymous person ID (per browser, no personal data) ─────────
  // Keeps the unique-device count stable across dates while the daily ID
  // below still limits the stored approval to one record per browser/day.
  function getPersonId() {
    var key = "pg_analytics_person_id";
    try {
      var id = localStorage.getItem(key);
      if (!id) {
        id = window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(key, id);
      }
      return id;
    } catch (e) {
      return getSessionId();
    }
  }

  // ── Daily approval ID (per browser/day) ────────────────
  // One random browser ID per day makes approval writes idempotent without
  // storing names, class, or reason in Firebase.
  function getDailyApprovalId(day) {
    var prefix = "pg_approval_id_";
    var key = prefix + day;
    try {
      var id = localStorage.getItem(key);
      if (!id) {
        id = window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(key, id);
      }
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var storedKey = localStorage.key(i);
        if (storedKey && storedKey.indexOf(prefix) === 0 && storedKey !== key) {
          localStorage.removeItem(storedKey);
        }
      }
      return id;
    } catch (e) {
      return getSessionId();
    }
  }
  // ── 4. תאריך ───────────────────────────────────────────
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function hourKey() {
    return String(new Date().getHours()).padStart(2, "0") + ":00";
  }

  // ── 5. שם הדף ──────────────────────────────────────────
  function getPageName() {
    var path = window.location.pathname;
    var file = path.split("/").pop() || path.split("\\").pop() || "index";
    // decode Hebrew filenames
    try { file = decodeURIComponent(file); } catch (e) {}
    return file || "home";
  }

  // ── 6. Firebase REST write (no SDK needed) ─────────────
  //  We use the Firebase REST API so no npm / build step is needed.
  //  Realtime Database REST: PUT/POST to
  //     https://<db>.firebaseio.com/<path>.json
  function getDbUrl() {
    var url = FIREBASE_CONFIG.databaseURL;
    if (!url || url.indexOf("YOUR_") !== -1) return null;
    return url.replace(/\/$/, "");
  }

  function dbPost(path, data) {
    var base = getDbUrl();
    if (!base) return; // config not filled in yet
    var url = base + "/" + path + ".json";
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        // keepalive so it fires even on page unload
        keepalive: true
      }).catch(function () {}); // silent — analytics must never break UX
    } catch (e) {}
  }

  function dbPut(path, data) {
    var base = getDbUrl();
    if (!base) return Promise.resolve(false);
    var url = base + "/" + path + ".json";
    try {
      return fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        keepalive: true
      }).then(function (response) {
        if (!response.ok) throw new Error("Firebase returned HTTP " + response.status);
        return true;
      }).catch(function (error) {
        console.warn("[PG-Track] Firebase write failed:", path, error);
        return false;
      });
    } catch (e) {
      console.warn("[PG-Track] Firebase write failed:", path, e);
      return Promise.resolve(false);
    }
  }

  // Atomic increment via Firebase REST transaction
  function dbIncrement(path) {
    var base = getDbUrl();
    if (!base) return;
    // Read current value then increment
    fetch(base + "/" + path + ".json")
      .then(function (r) { return r.json(); })
      .then(function (val) {
        var n = (typeof val === "number" ? val : 0) + 1;
        return fetch(base + "/" + path + ".json", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(n)
        });
      })
      .catch(function () {});
  }

  // ── 7. בנה את payload של צפיית הדף ─────────────────────
  var today    = todayKey();
  var hour     = hourKey();
  var device   = getDeviceType();
  var browser  = getBrowser();
  var os       = getOS();
  var page     = getPageName();
  var sid      = getSessionId();
  var personId = getPersonId();
  var now      = new Date().toISOString();

  // page2.html is the generated approval screen reached from app.html.
  // It is part of the same visit, so do not count it as another page view.
  if (page === "page2.html") {
    console.log("[PG-Track] מסך אישור שנוצר — לא נספר כצפייה נוספת");
    return;
  }

  // ── 8. שמור את הצפייה ───────────────────────────────────
  // stats/page_views/YYYY-MM-DD  — counter
  dbIncrement("stats/page_views/" + today);

  // stats/sessions/YYYY-MM-DD/<sessionId>  — unique sessions
  dbPut("stats/sessions/" + today + "/" + sid, {
    device: device,
    browser: browser,
    os: os,
    lastSeen: now,
    page: page,
    personId: personId
  });

  // A stable anonymous ID makes mobile users unique across page loads/days.
  if (device === "mobile") {
    dbPut("stats/mobile_users/" + today + "/" + personId, {
      device: device,
      lastSeen: now
    });
  }

  // stats/devices/YYYY-MM-DD/<type>  — mobile/tablet/desktop counter
  dbIncrement("stats/devices/" + today + "/" + device);

  // stats/browsers/YYYY-MM-DD/<browser>  — browser counter
  dbIncrement("stats/browsers/" + today + "/" + browser.replace(/\s/g, "_"));

  // stats/os/YYYY-MM-DD/<os>  — OS counter
  dbIncrement("stats/os/" + today + "/" + os.replace(/\s/g, "_"));

  // stats/hours/YYYY-MM-DD/<HH:00>  — hour counter
  dbIncrement("stats/hours/" + today + "/" + hour);

  // stats/pages/YYYY-MM-DD/<pageName>  — per-page counter
  dbIncrement("stats/pages/" + today + "/" + encodeURIComponent(page).replace(/%/g, "_"));

  // ── 9. רישום אישור פעם אחת למכשיר/דפדפן ביום ────────────
  // Repeated approvals on the same browser share one Firebase child key.
  function recordApproval(durationSec) {
    var approvalDate = todayKey();
    var approvalId = getDailyApprovalId(approvalDate);
    var data = {
      timestamp: new Date().toISOString(),
      device: device,
      browser: browser,
      os: os,
      personId: getPersonId()
    };
    if (typeof durationSec === "number") data.durationSeconds = durationSec;

    Promise.all([
      dbPut("stats/approval_devices/" + approvalDate + "/" + approvalId, data),
      dbPut("approvals_log/" + approvalDate + "/" + approvalId, data)
    ]).then(function (results) {
      if (results.every(Boolean)) {
        console.log("[PG-Track] ✅ אישור יומי נרשם ב-Firebase");
      } else {
        console.warn("[PG-Track] האישור לא נשמר בכל נתיבי Firebase");
      }
    });
  }

  window.pgTrackApproval = function () {
    recordApproval(null);
  };

  // ── 10. מדידת זמן עד לאישור ────────────────────────────
  window._pgTrackStartTime = Date.now();
  window.pgTrackApprovalWithDuration = function () {
    var durationSec = Math.round((Date.now() - (window._pgTrackStartTime || Date.now())) / 1000);
    recordApproval(durationSec);
  };


  console.log("[PG-Track] 🔥 Firebase Tracker פעיל | דף:", page, "| מכשיר:", device);

})();
