# إعداد Firebase

1. افتح https://console.firebase.google.com وأنشئ مشروعاً جديداً (اسم مثل `dokani`). تعطيل Google Analytics مقبول.
2. **Build > Authentication > Get started**: فعّل مزوّد **Email/Password**.
3. **Build > Firestore Database > Create database**: اختر الوضع **Production** وموقعاً قريباً (مثل `eur3` أو `europe-west`).
4. **Project settings (أيقونة الترس) > Your apps > Web (`</>`)**: سجّل تطبيقاً وانسخ قيم `firebaseConfig`.
5. ضع القيم في Vercel: Project > Settings > Environment Variables، بالأسماء الموجودة في `.env.example`، ثم أعد النشر.
6. **Authentication > Settings > Authorized domains**: أضف نطاق Vercel الخاص بك.
7. لاحقاً: ألصق محتوى `firestore.rules` في Firestore > Rules ثم Publish.

التطبيق يعمل بالبيانات التجريبية المحلية ما دامت قيم `VITE_FIREBASE_*` غير موجودة.
