# Генератор миграции 0209: расширение каталога (владелец, 2026-10-01).
L1 = [  # id, name, icon, sort
 ("cargo","Грузоперевозки","Truck",8),
 ("courier","Курьерские услуги","Moped",9),
 ("computer-help","Компьютерная помощь","Laptop",10),
 ("auto","Ремонт транспорта","Car",11),
 ("beauty","Красота и здоровье","Scissors",12),
 ("tutors","Репетиторы и обучение","GraduationCap",13),
 ("events","Мероприятия и промоакции","Confetti",14),
 ("photo-video","Фото, видео и аудио","Camera",15),
 ("virtual-assistant","Виртуальный помощник","Headset",16),
 ("legal-accounting","Юридическая и бухгалтерская помощь","Scales",17),
]
# l2: id, l1, name, icon, sort, [ (l3id, name, urgency) ], [terms]
L2 = [
 ("cargo-transport","cargo","Грузоперевозки","Truck",10,[("cargo-gazelle","Газель с водителем","urgent"),("cargo-furniture","Перевезти мебель и технику","week"),("cargo-materials","Перевезти стройматериалы","week"),("cargo-intercity","Перевозка в другой город","week")],["грузоперевозки","газель","грузовое такси","перевезти","перевозка"]),
 ("tow-truck","cargo","Эвакуатор","CarProfile",30,[("tow-car","Эвакуировать автомобиль","urgent"),("tow-machinery","Перевезти спецтехнику","week")],["эвакуатор","эвакуация"]),
 ("courier-delivery","courier","Доставка документов и посылок","Package",10,[("courier-docs","Доставить документы","urgent"),("courier-parcel","Доставить посылку","urgent"),("courier-day","Курьер на день","week")],["курьер","доставка","доставить","посылка"]),
 ("buy-deliver","courier","Купить и доставить","ShoppingBag",20,[("buy-groceries","Купить и привезти продукты","urgent"),("buy-pharmacy","Купить в аптеке","urgent"),("buy-store","Купить в магазине","urgent")],["купить и доставить","привезти продукты","купить"]),
 ("food-delivery","courier","Доставка еды","ForkKnife",30,[("food-cafe","Доставка из кафе","urgent"),("food-lunches","Доставка обедов","week")],["доставка еды","еда","обеды"]),
 ("pc-repair","computer-help","Ремонт компьютеров и ноутбуков","Laptop",10,[("pc-diagnostics","Диагностика","week"),("pc-cleaning","Чистка от пыли","week"),("pc-parts","Замена комплектующих","week"),("pc-data","Восстановление данных","week")],["компьютер","ноутбук","ремонт компьютера","ремонт ноутбука"]),
 ("software-setup","computer-help","Настройка Windows и программ","Desktop",20,[("sw-windows","Установить Windows","week"),("sw-virus","Удалить вирусы","urgent"),("sw-programs","Установить программы","week")],["windows","программы","вирусы","настройка компьютера"]),
 ("internet-setup","computer-help","Интернет и Wi‑Fi","Broadcast",30,[("net-router","Настроить роутер","urgent"),("net-cable","Провести интернет-кабель","week")],["интернет","wi-fi","вайфай","роутер"]),
 ("phone-repair","computer-help","Ремонт телефонов и планшетов","DeviceMobile",40,[("phone-screen","Заменить экран","week"),("phone-battery","Заменить аккумулятор","week"),("phone-dead","Не включается","urgent")],["телефон","смартфон","айфон","планшет","ремонт телефона"]),
 ("car-repair","auto","Автосервис и ремонт","Engine",10,[("car-diagnostics","Диагностика автомобиля","week"),("car-engine","Ремонт двигателя","week"),("car-suspension","Ремонт ходовой","week"),("car-oil","Замена масла","week")],["автосервис","ремонт машины","автомеханик","авто"]),
 ("auto-electric","auto","Автоэлектрик","Lightning",20,[("car-no-start","Машина не заводится","urgent"),("car-alarm","Установить сигнализацию","week"),("car-wiring","Ремонт проводки","week")],["автоэлектрик","сигнализация"]),
 ("tire-service","auto","Шиномонтаж","Tire",30,[("tire-season","Сезонная замена шин","week"),("tire-puncture","Ремонт прокола","urgent"),("tire-mobile","Выездной шиномонтаж","urgent")],["шиномонтаж","шины","колесо"]),
 ("body-repair","auto","Кузовной ремонт и покраска","PaintBucket",40,[("body-dents","Убрать вмятины","week"),("body-paint","Покрасить автомобиль","month"),("body-polish","Полировка","week")],["кузовной ремонт","покраска авто","вмятина"]),
 ("car-wash","auto","Автомойка и химчистка","Drop",50,[("wash-interior","Химчистка салона","week"),("wash-mobile","Выездная мойка","week")],["автомойка","химчистка салона","мойка"]),
 ("hairdresser","beauty","Парикмахеры","Scissors",10,[("hair-cut","Стрижка","week"),("hair-color","Окрашивание","week"),("hair-event","Причёска на торжество","week")],["парикмахер","стрижка","причёска"]),
 ("manicure","beauty","Маникюр и педикюр","Sparkle",20,[("nails-manicure","Маникюр","week"),("nails-pedicure","Педикюр","week"),("nails-extension","Наращивание ногтей","week")],["маникюр","педикюр","ногти"]),
 ("makeup","beauty","Визажисты","Sparkle",30,[("makeup-event","Макияж на торжество","week"),("makeup-wedding","Свадебный макияж","month")],["визажист","макияж"]),
 ("massage","beauty","Массаж","HandHeart",40,[("massage-classic","Классический массаж","week"),("massage-home","Массаж на дому","week")],["массаж","массажист"]),
 ("school-subjects","tutors","Школьные предметы","BookOpen",10,[("tutor-math","Математика","week"),("tutor-russian","Русский язык","week"),("tutor-science","Физика и химия","week"),("tutor-primary","Начальная школа","week")],["репетитор","математика","русский язык","школа"]),
 ("exam-prep","tutors","Подготовка к ЕГЭ и ОГЭ","GraduationCap",20,[("exam-ege","Подготовка к ЕГЭ","month"),("exam-oge","Подготовка к ОГЭ","month")],["егэ","огэ","подготовка к экзамену"]),
 ("languages","tutors","Иностранные языки","Translate",30,[("lang-english","Английский","week"),("lang-arabic","Арабский","week"),("lang-other","Другие языки","week")],["английский","арабский","иностранный язык"]),
 ("driving-instructor","tutors","Автоинструкторы","Car",40,[("drive-beginner","Вождение для начинающих","week"),("drive-refresh","Восстановить навыки вождения","week")],["автоинструктор","вождение","инструктор"]),
 ("music-lessons","tutors","Уроки музыки","MusicNotes",50,[("music-guitar","Гитара","week"),("music-piano","Фортепиано","week"),("music-vocal","Вокал","week")],["уроки музыки","гитара","фортепиано","вокал"]),
 ("event-hosts","events","Ведущие и тамада","Microphone",10,[("host-wedding","Ведущий на свадьбу","month"),("host-party","Ведущий на праздник","week")],["ведущий","тамада","свадьба"]),
 ("animators","events","Аниматоры","Balloon",20,[("anim-kids","Детский праздник","week"),("anim-birthday","Аниматор на день рождения","week")],["аниматор","детский праздник","день рождения"]),
 ("music-dj","events","Музыканты и диджеи","MusicNotes",30,[("dj","Диджей","week"),("musicians-wedding","Музыканты на свадьбу","month")],["диджей","музыканты","живая музыка"]),
 ("event-staff","events","Официанты и повара","ForkKnife",40,[("staff-waiters","Официанты на мероприятие","week"),("staff-cook","Повар на мероприятие","week")],["официант","повар","кейтеринг"]),
 ("event-decor","events","Оформление праздников","Cake",50,[("decor-balloons","Оформление шарами","week"),("decor-hall","Оформление зала","week")],["оформление праздника","шары","декор"]),
 ("promoters","events","Промоутеры","Megaphone",60,[("promo-flyers","Раздать листовки","week"),("promo-instore","Промоакция в магазине","week")],["промоутер","листовки","промоакция"]),
 ("photographer","photo-video","Фотографы","Camera",10,[("photo-event","Фотосъёмка мероприятия","week"),("photo-wedding","Свадебная съёмка","month"),("photo-session","Фотосессия","week"),("photo-product","Предметная съёмка","week")],["фотограф","фотосъёмка","фотосессия"]),
 ("videographer","photo-video","Видеосъёмка","VideoCamera",20,[("video-event","Видеосъёмка мероприятия","week"),("video-wedding","Свадебное видео","month"),("video-drone","Съёмка с дрона","week")],["видеограф","видеосъёмка","видео"]),
 ("video-editing","photo-video","Монтаж видео и звука","FilmSlate",30,[("edit-video","Смонтировать видео","week"),("edit-audio","Обработать звук","week")],["монтаж видео","монтаж","звук"]),
 ("texts-docs","virtual-assistant","Тексты и документы","Keyboard",10,[("va-typing","Набрать текст","week"),("va-docs","Оформить документ","week"),("va-translate","Перевести текст","week")],["набор текста","документы","перевод"]),
 ("info-search","virtual-assistant","Поиск информации","Compass",20,[("va-research","Найти информацию","week"),("va-compare","Сравнить цены","week")],["поиск информации","найти"]),
 ("calls-messages","virtual-assistant","Обзвон и переписка","Phone",30,[("va-calls","Обзвонить клиентов","week"),("va-replies","Отвечать на сообщения","week")],["обзвон","звонки","переписка"]),
 ("spreadsheets","virtual-assistant","Таблицы и базы","Rows",40,[("va-tables","Заполнить таблицы","week"),("va-database","Вести базу","week")],["таблицы","excel","база данных"]),
 ("lawyers","legal-accounting","Юристы","Gavel",10,[("law-consult","Консультация юриста","week"),("law-contract","Составить договор","week"),("law-court","Представительство в суде","month")],["юрист","адвокат","договор","консультация"]),
 ("accountants","legal-accounting","Бухгалтеры","Calculator",20,[("acc-declaration","Налоговая декларация","week"),("acc-ip","Бухгалтерия для ИП","month"),("acc-reports","Сдать отчётность","week")],["бухгалтер","декларация","отчётность","налоги"]),
 ("documents-help","legal-accounting","Помощь с документами","Briefcase",30,[("docs-mfc","Оформить документы","week"),("docs-company","Зарегистрировать ИП или ООО","week")],["оформление документов","регистрация ип","мфц"]),
 ("housekeeping","home-services","Помощь по хозяйству","House",70,[("house-help","Домработница","week"),("house-cooking","Помощь с готовкой","week"),("house-ironing","Глажка белья","week")],["домработница","помощь по хозяйству","готовка","глажка"]),
 ("caregivers","home-services","Няни и сиделки","Baby",80,[("care-nanny","Няня","week"),("care-elderly","Сиделка для пожилых","week")],["няня","сиделка","уход"]),
]
q=lambda s: "'"+s.replace("'","''")+"'"
out=[]
out.append("""-- 0209: расширение каталога услуг (владелец, 2026-10-01).
--
-- По образцу каталога другого приложения: «сделать плюс-минус такие
-- категории; Разработку ПО и Дизайн не надо, остальное добавить».
-- Новые разделы: Грузоперевозки, Курьерские услуги, Компьютерная помощь,
-- Ремонт транспорта, Красота и здоровье, Репетиторы и обучение,
-- Мероприятия и промоакции, Фото, видео и аудио, Виртуальный помощник,
-- Юридическая и бухгалтерская помощь.
-- «Дом и быт» → «Уборка и помощь по хозяйству» (+ помощь по хозяйству,
-- няни и сиделки); «Грузчики и переезды» переезжают в «Грузоперевозки»,
-- раздел «Мастер на час и переезды» → «Мастер на час и разнорабочие».
-- Существующие категории и выбор специалистов не меняются.
-- Иконки — src/lib/category-icons.ts. После применения — npm run catalog:generate.
-- Сгенерировано скриптом из одного списка, вручную не править построчно.

BEGIN;

UPDATE public.categories_l1 SET name_ru = 'Уборка и помощь по хозяйству' WHERE id = 'home-services';
UPDATE public.categories_l1 SET name_ru = 'Мастер на час и разнорабочие' WHERE id = 'handyman-moving';
""")
out.append("INSERT INTO public.categories_l1 (id, name_ru, icon, sort_order, is_active) VALUES")
out.append(",\n".join(f"  ({q(i)}, {q(n)}, {q(ic)}, {s}, true)" for i,n,ic,s in L1))
out.append("ON CONFLICT (id) DO UPDATE SET name_ru = EXCLUDED.name_ru, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, is_active = true;\n")
out.append("UPDATE public.categories_l2 SET l1_id = 'cargo', sort_order = 20 WHERE id = 'movers';\n")
out.append("INSERT INTO public.categories_l2 (id, l1_id, name_ru, icon, sort_order, is_active, is_visible, is_featured) VALUES")
out.append(",\n".join(f"  ({q(i)}, {q(l1)}, {q(n)}, {q(ic)}, {s}, true, true, false)" for i,l1,n,ic,s,_,_ in L2))
out.append("ON CONFLICT (id) DO UPDATE SET l1_id = EXCLUDED.l1_id, name_ru = EXCLUDED.name_ru, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, is_active = true, is_visible = true;\n")
rows=[]
for i,l1,n,ic,s,l3s,_ in L2:
    for k,(l3id,l3n,urg) in enumerate(l3s):
        rows.append(f"  ({q(l3id)}, {q(i)}, {q(l3n)}, {q(urg)}, {(k+1)*10})")
out.append("INSERT INTO public.categories_l3 (id, l2_id, name_ru, urgency_typical, sort_order) VALUES")
out.append(",\n".join(rows))
out.append("ON CONFLICT (id) DO NOTHING;\n")
terms=[]
for i,l1,n,ic,s,_,ts in L2:
    for k,t in enumerate(ts):
        terms.append(f"    ({q(i)}, {q(t)}, {100-k*10})")
out.append("""INSERT INTO public.category_terms (l2_id, term, weight)
SELECT v.l2_id, v.term, v.weight
  FROM (VALUES""")
out.append(",\n".join(terms))
out.append("""  ) AS v(l2_id, term, weight)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.category_terms t
    WHERE t.l2_id = v.l2_id AND lower(t.term) = lower(v.term));

NOTIFY pgrst, 'reload schema';

COMMIT;""")
open('/root/projects/xtrud/supabase/migration-drafts/0209_catalog_expansion.sql','w').write("\n".join(out)+"\n")
icons=sorted(set([ic for _,_,ic,_ in L1]+[x[3] for x in L2]))
print("иконки:", " ".join(icons)); print("L2:",len(L2),"L3:",len(rows),"терминов:",len(terms))
