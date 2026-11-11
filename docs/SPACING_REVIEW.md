# مراجعة المسافات والتخطيط (Prompt A)

نظام مسافات واحد لكل التطبيق عبر `theme.spacingScale`:
`screenPadding: 16`, `cardGap: 12`, `sectionGap: 24`, `headerGap: 12`.

مكوّنان مشتركان يطبّقان هذا النظام في كل شاشة:
- `<Screen>`: حشو 16 على كل الحواف، `gap: 12` بين كل الأبناء المباشرين، وحشو سفلي يراعي شريط
  التبويبات والمنطقة الأمنة.
- `<Section title action>`: `marginTop: 24` فوق القسم، و`gap: 12` بين العنوان (وزر العنوان) وأول
  بطاقة، وبين كل البطاقات تحته.

القاعدة: `gap` فقط بين البطاقات، لا `margin` على بطاقة مفردة.

| الشاشة | الملف | ما تم تغييره |
|---|---|---|
| الرئيسية | `src/app/(tabs)/index.tsx` | تستخدم `<Screen>` بالفعل؛ لم تُغيّر. |
| التحصيل الشهري | `src/app/(tabs)/collection.tsx` | استبدال `ScrollView` بـ `<Screen>`؛ فجوة بطاقتي «تم تحصيله/المتبقي» من 8 إلى 12. |
| التحصيلات الخاصة (قائمة) | `src/app/specials.tsx` | استبدال `ScrollView` بـ `<Screen>` كجذر واحد مع `AppBottomSheet`/`ConfirmDialog`. |
| تفاصيل التحصيل الخاص | `src/app/special-details/[id].tsx` | `<Screen>` بدل `ScrollView`؛ «الشقق» و«المصروفات المرتبطة» أصبحتا `<Section>`؛ فجوة ملخص المطلوب/المحصل 12. |
| المصروفات | `src/app/(tabs)/expenses.tsx` | كانت تستخدم `<Screen>`/`<Section>` بالفعل؛ صفوف المصروفات الثابتة بطاقة مضغوطة ارتفاعها 72 (اسم + حقل رقم 110×44 + زر حفظ 44×44)، مع تلميح «اترك الخانة فاضية...» تحت العنوان. |
| أنواع المصروفات | `src/app/expense-categories.tsx` | استبدال `ScrollView` بـ `<Screen>`. |
| الشقق | `src/app/apartments.tsx` | القائمة `FlatList` فلم تُستبدل بـ `<Screen>` مباشرة؛ غُلّفت بـ `SafeAreaView` وطُبّقت عليها قيم المسافات نفسها (16 حشو، 12 فجوة، حشو سفلي = شريط التبويبات + 24) حتى تطابق `<Screen>` تماماً. |
| حساب الشقة | `src/app/apartment-account/[id].tsx` | `<Screen>` بدل `ScrollView`؛ «التحصيلات الخاصة» و«سجل الدفعات» أصبحتا `<Section>`. |
| كشف الشهر | `src/app/month-statement.tsx` | شبكة الأربع بطاقات أصبحت 2×2 حقيقية: كل بطاقة بعرض 48% وارتفاع أدنى 96 (كان 116) بنفس حجم الرقم 28 في الأربعة، بدل اعتمادها على الالتفاف التلقائي. باقي الشاشة كانت تستخدم `<Screen>`/`<Section>` بالفعل. |
| سجل العمليات | `src/app/ledger.tsx` | كانت تستخدم `<Screen>` بالفعل مع `SegmentedControl` وتسمية «التعديلات» المختصرة؛ لم تُغيّر. |
| المتأخرون | `src/app/overdue.tsx` | استبدال `ScrollView` بـ `<Screen>`؛ شريط `SegmentedControl` والقائمة الأفقية لاختيار التحصيل الخاص بقيا كما هما (مطابقان للمواصفة). |
| تعديل الرصيد | `src/app/adjustments.tsx` | `<Screen>` بدل `ScrollView`؛ أزرار زيادة/نقص اليدوية استُبدلت بمكوّن `SegmentedControl` المشترك؛ «سجل تعديلات الرصيد» أصبح `<Section>`. |
| تصدير التقارير | `src/app/export.tsx` (ملف جديد، كان `export-backup.tsx`) | شاشة مستقلة: فترة التقرير + PDF + Excel فقط، داخل `<Screen>`/`<Section>`. نُقل الكود كما هو بلا تغيير في المنطق. |
| النسخة الاحتياطية | `src/app/backup.tsx` | أصبحت تحتوي الاستعادة أيضاً (اختيار ملف + تأكيد الاستبدال) بدل الانتقال إلى شاشة التصدير؛ `<Screen>`/`<Section>` لـ «آخر نسخة احتياطية» و«استعادة نسخة قديمة». الكود الأصلي للاستعادة نُقل حرفياً من `export-backup.tsx`. |
| الجدول الأونلاين | `src/app/sync.tsx` | استبدال `ScrollView` بـ `<Screen>`. |
| بيانات العمارة | `src/app/building.tsx` | استبدال `ScrollView` بـ `<Screen>`. |
| قيمة الفاتورة الشهرية | `src/app/fee.tsx` | استبدال `ScrollView` بـ `<Screen>`. |
| رقم سري | `src/app/app-pin.tsx` | استبدال `ScrollView` بـ `<Screen>`. |
| القائمة الجانبية (Drawer) | `src/components/navigation/DrawerProvider.tsx` | كانت تطبّق أصلاً حشو أعلى للمنطقة الأمنة وتمرير سفلي يراعيها؛ تحديد العنصر النشط يعتمد على المسار الحالي فعلياً (لا تكرار بين المسارات). رابط «تصدير التقارير» يشير الآن إلى `/export` بدل `/export-backup`. |
| الفلاتر وشرائح الخيارات | `SegmentedControl`, `ledger.tsx`, `overdue.tsx`, `adjustments.tsx` | كل شرائح الخيارات القصيرة تستخدم مكوّن `SegmentedControl` المشترك: عرض متساوٍ (`flex:1`)، ارتفاع 44، خط 15 شبه ثقيل، سطر واحد مع `adjustsFontSizeToFit` (حد أدنى 0.8)، بلا التفاف. |

## فحص الأنواع (TypeScript)

تم تشغيل `tsc --noEmit` على المشروع بالكامل بعد كل التعديلات: **لا توجد أخطاء**.
(ملاحظة بيئية: الأمر `npx tsc` في هذه البيئة قد يستدعي حزمة بديلة من الإنترنت؛ الطريقة
الموثوقة هي `./node_modules/.bin/tsc --noEmit` من مجلد `AppMangement`.)
