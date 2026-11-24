# מערכת פגישונים — Pgishonim System

מערכת ניהול אישורי יציאה לבתי ספר.

## קבצים עיקריים

| קובץ | תיאור |
|------|-------|
| `exit-pass-explainer.html` | מסך הסבר לפני האישור (3 שלבים) |
| `מערכת פגישונים.html` | מסך אימות זהות ראשי |
| `admin.html` | **לוח בקרה מקומי** — אנליטיקה ב-Firebase |
| `firebase-config.js` | הגדרות Firebase (יש למלא) |
| `firebase-tracker.js` | מודול מעקב — טוען בכל הדפים |

## הגדרת Firebase Analytics

1. לך ל-[console.firebase.google.com](https://console.firebase.google.com)
2. צור פרויקט → שם: `pgishonim-analytics`
3. Build → Realtime Database → צור מסד נתונים → **Start in test mode**
4. הגדרות פרויקט → Your apps → Web App → העתק `firebaseConfig`
5. פתח `firebase-config.js` והחלף את ה-`YOUR_...` בערכים האמיתיים

## מה נאסף?

- מספר אישורים לפי יום
- סוג מכשיר (mobile / tablet / desktop)
- דפדפן (Chrome, Safari, Firefox, Edge)
- מערכת הפעלה (Android, iOS, Windows, macOS)
- מספר סשנים ייחודיים
- שעות שימוש (heatmap)
- צפיות בדפים
