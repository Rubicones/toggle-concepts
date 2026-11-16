# Что мы поняли про качество рекламы: выводы прогонов 14–16 ноября

Документ для передачи в новый чат о перестройке пайплайна. Здесь собрано, что именно мы меняли в инструкциях агентов и почему, что сработало, что нет. Тексты инструкций приведены как есть (на английском), пояснения — по-русски.

- **Ветка:** `claude/cool-goodall-qboh37`, последний коммит `d495b6b`.
- **На чём проверено:** стенд (`scripts/bench/pipeline-bench.ts`), 36 прогонов. С 16-го по 36-й — только ключевой кадр в квадрате. Бренды: Toggle (из экспорта живого прогона), Mossa, Pallet.
- **Что не проверено:** живой прогон в студии, остальные сцены и форматы на последних правилах. Раздел «Эстетика» и «свободное направление» на стенде подставлялись вручную.
- **Где действует:** всё ниже включено только для дизайнера версии 6 (`STUDIO_DESIGNER_VERSION=6`).

---

## 1. Главные открытия коротко

1. **Агенты собирали кадр из деталей бренда, а не в его духе.** Причина — текст о бренде был списком деталей («бренд узнают по пяти вещам»), и в нём не было описания того, как выглядит новая картинка этого бренда. Лечится разделом «Эстетика».
2. **Тему кадра фиксировал этап направления, а не дизайнер.** Направление «Same ring, every light» заранее назначило знак главным героем; дизайнер честно это исполнял. Когда направление не называет сюжет, идеи становятся другими.
3. **Одно общее правило лучше стопки частных.** Каждый раз, когда я превращал замечание в узкое правило («только фотографии», «только настоящие вещи»), оно оказывалось неверным для другого бренда. Осталась одна цель: привлекательная картинка в стиле бренда, максимально ярко показывающая идею.
4. **Брендбук описывает страницы бренда, а не его рекламу.** Доли цвета, «один акцент», просторные страницы читались как правила для картинки, и любой сдержанный бренд получал пустой аккуратный кадр.
5. **Бриф кампании тоже стерилизует.** В брифе Toggle выбрано: спокойная уверенность, тёмная студия, без людей, без перегруженности. Дизайнер это исполняет. Правилами нельзя идти против того, что прямо выбрано в брифе.
6. **Дизайнер слишком охотно рисует кодом.** Предмет с материалом и светом, собранный кодом, выглядит нарисованным. Правило об этом срабатывает не всегда (в 2 из 5 последних прогонов Toggle предмет снова нарисован кодом), поэтому нужна проверка по готовому кадру, а не только текст.
7. **Эскизы идей не понадобились.** На Mossa кадр без эскизов не хуже, чем с ними, и стоит одну картинку вместо четырёх. Эскизы выключены.
8. **Кривую посадку содержимого на предмет лечит измерение, а не правило.** Приложение само находит на картинке чистые поверхности и даёт дизайнеру их углы.
9. **Рецензент, который только ищет ошибки, делает кадр безопаснее, а не ярче.** Добавлено обязательное замечание «где кадр робкий».
10. **Разброс между прогонами большой.** При одинаковых правилах два прогона дают разные идеи и разный инструмент. По одному прогону нельзя судить, помогло правило или нет.

---

## 2. Чтение брендбука (PDF) и текст о бренде

### Что решили и сделали
- **Брендбук читается постранично.** До 16 страниц, каждая становится отдельной записью каталога (`<книга>-p<N>`). Агент, который пишет текст о бренде, для каждой страницы указывает: это бренд «в деле» (готовая работа, продукт, знак в реальном масштабе) или «правила», и одной строкой — что на ней. Дизайнер может попросить любую страницу по имени и увидеть её.
- **Зачем:** раньше дизайнер ни разу не видел бренд в применении, только текстовые правила. Отсюда кольцо размером с логотип рядом с логотипом.
- **Текст о бренде пишется под метками:** FEEL, AESTHETIC, DEVICES, DEVICES IN USE, COLOUR/TYPE/SPACE/IMAGERY, NEVER, MATERIALS. Плюс до шести «подписных» картинок.
- **Экспорт прогона** теперь кладёт картинки, которые видели агенты (сжатый лист бренда, страницы брендбука), чтобы стенд видел бренд так же, как студия.

### Два новых раздела и зачем они

**AESTHETIC («Эстетика»)** — как выглядела бы новая картинка, сделанная дизайнерами самого бренда. Это главный ответ на «собирает из деталей».

> AESTHETIC: how a new picture made by this brand's own designers would look when it shows something its materials never show. Say first what its pictures are (photographs of real people, places and things, renders, or drawings). Say what world they live in: the kinds of subjects and settings the brand chooses, how modern or traditional its taste is, and how playful or serious. Then say its light (where it comes from, how hard, how warm), its colour world and how saturated it is, its surfaces and materials, its depth and space, its finish, how full or spare a frame is, and its mood. Take each from the brand's own pictures and pages, and write "not stated" where they do not show it. Write it so that a picture-maker who has never seen the kit could make a new picture that belongs to this brand. Keep apart what is a rule of the identity (its marks, type, colour roles and page layout) from what its pictures are like: a spare page does not mean a spare picture. Name no logo, no mark and no arrangement here.

**DEVICES IN USE** — как каждый фирменный элемент используется в материалах бренда: роль, масштаб, один или много, чем он никогда не бывает.

> DEVICES IN USE: one line for each device named above, taken from how the brand's own materials use it: its role there (the main subject, an accent, a texture, or a mark), its scale there (dominant, secondary, or small), whether it appears once or repeated, and what it is never used as. Where the materials do not show one of these, write "not stated".

### Что важно перенести в новый пайплайн
- Текст о бренде должен **отделять правила фирменного стиля** (знаки, шрифт, роли цветов, вёрстка страниц) **от описания картинок**. «Просторная страница» не означает «пустая картинка».
- Где у бренда мало собственных картинок, это надо прямо сказать: агенты вправе делать картинки богаче, чем страницы брендбука.
- Пакет бренда хранится на кампанию и копируется в новую кампанию с теми же материалами. Старые пакеты раздела AESTHETIC не имеют — нужна кнопка «Read the brand book again» или новая кампания.
- **Не проверено вживую:** раздел AESTHETIC ни разу не писался самой студией, на стенде я подставлял его вручную.

---

## 3. Бриф и направление

Здесь в основном находки, а не готовые решения — это как раз материал для нового пайплайна.

- **Направление (territory) задавало сюжет кадра.** В экспорте Toggle: «The upright glossy orange ring sits in a dark studio. With each line the light changes…». После этого все три идеи дизайнера были про кольцо. Когда я на стенде заменил направление на открытое (что чувствует зритель, роль продукта, без сюжета), идеи сразу стали другими: вешалка с пальто всех размеров, веер образцов одного цвета, стопка оттисков.
- **Вывод:** направление должно задавать, что зритель понимает и чувствует, роль продукта и способ изготовления — но не то, что стоит в кадре. Сюжет находит дизайнер от сообщения.
- **Бриф диктует настроение буквально.** Поля брифа (главное чувство, свет, «без людей», «избегать перегруженности») читаются как ограничения картинки. Для сдержанного бренда это даёт тёмную пустую студию с одним предметом.
- **Открытый вопрос для нового пайплайна:** как формировать бриф так, чтобы «спокойный премиальный бренд» не означал «пустой кадр». Варианты: отделить в брифе тон голоса бренда от живости картинки; не делать «без людей» и «тёмная студия» значениями по умолчанию.
- В задание на направление для версии 6 добавлено то же общее правило, что читает дизайнер (текст в разделе 4). Вживую этап направления с ним не запускался.

---

## 4. Идеи: что мы прописали

### Общая цель — одна на все стадии
Её читают этап направления, дизайнер и рецензент.

> THE AIM OF EVERY FRAME: an attractive picture, in the brand's own style, that shows the idea as vividly as it can be shown. Attractive: a stranger wants to look at it. In the brand's own style: made as the brand's own designers would make it, in its aesthetic (the brand pack gives it under AESTHETIC and FEEL, and the brand's own pictures show it); it is a new picture, not the parts of the kit set side by side. It also belongs to the world of the brand: the subject, the setting and the taste of the picture are ones this brand would choose, as modern or as traditional, as playful or as serious as the brand is. A subject from another world does not become the brand's by being given its colours. Vivid: the idea is seen in the picture at once, before the words are read. Every way of making is open to you (photograph, render, drawing, type, flat or with depth, real or imagined), and none is preferred: choose what makes this idea most vivid for this brand.

### Как дизайнер придумывает идеи
- **Десять черновых, потом вычёркивание.** Раньше было «напиши несколько». Теперь — десять в одну строку из разных миров, затем вычеркнуть те, что пришли первыми, и те, что показал бы любой бренд такого рода. В прогоне 34 дизайнер сам вычеркнул зеркало, сетку миниатюр, ДНК и матрёшки.

> 1. Write ten rough ideas for this frame, one line each, from different worlds and in different ways of making. Then cross out the ones that came first to mind and the ones any brand of this kind would show, and say in a word why.

- **Три финальные идеи различаются по сути** — что показано, насколько близко, сколько кадра занимает.

> Make the three differ in kind, not in detail: in what is shown, in how close the viewer is to it, and in how much of the frame it takes. When the direction allows a photograph, at least one idea is a whole scene, a place or a moment with the subject in it, and not the subject alone on a plain ground.

> The three ideas differ in their subject. Each idea has a turn with wit in it: something a stranger would retell to a friend in one sentence. Each idea also says its plan for motion in one line. Each is judged by the aim above.

### Что такое «идея показана ярко»

> AN IDEA SHOWN VIVIDLY
> - One thought. The picture says one thing, and everything in it serves that thing; what does not is taken out.
> - Shown, not told. The picture does the work of the idea itself: a stranger who cannot read the words still gets the point. The words finish the thought; they do not carry it.
> - A turn. Something in the picture is not as expected: two things meet that do not usually meet, a familiar thing behaves in an unfamiliar way, or a size, a place or a moment is wrong on purpose. The turn is the idea made visible.
> - Its strongest form. Take the idea as far as it goes: the largest difference, the clearest contrast, the most telling moment. A mild version of an idea is seen as no idea.
> - Its own image. Pass over the first image everyone reaches for: the stock symbol that many ads have already used for this theme is not a turn. Look for the image that only this brand, with this message, would arrive at.
> - Past the first solution. The plain version of any way (one thing, alone, flat to the viewer, in the middle of an empty ground) is what every brand of this kind already shows. Take it further: more of the world around it, more than one of it, a scale, an action, a moment caught.
> - Read at once. The viewer knows straight away what they are looking at, with no special knowledge: the things in the picture are ones anyone would name. The surprise is in what it means, never in working out what it is. Unusual is not the same as vivid: a rare object or an elaborate construction that has to be explained loses to a plain thing whose turn is seen at once.
> - About the viewer. The idea touches something the viewer wants, fears or knows from their own life.
> - Retold in one sentence. A stranger can tell it to a friend, and the friend reacts.

Пояснения к пунктам, которые появились из ваших замечаний:
- **«Its own image»** — хамелеон как символ изменений: расхожий образ не считается поворотом.
- **«Past the first solution»** — один предмет в лоб посреди пустого фона уже есть у каждого бренда.
- **«Read at once … Unusual is not the same as vivid»** — стеклянный стержень-муррина: эффектно, но без объяснения непонятно.

### Когда продукт нельзя снять как вещь (услуга, софт)
Это ваш список приёмов для «неосязаемых» брендов.

> WHEN THE SUBJECT IS NOT A PHYSICAL THING (a service, software, a promise, the work itself), give it a body. There are several ways, and the three ideas do not all take the same one:
> - a thing or a moment from the viewer's life that stands for it;
> - the brand's own screens, cards or pieces of work placed in a real space, with the light and the perspective of that space;
> - a real device in a real setting, showing the interface or the work on its screen;
> - the screens or cards made into real objects (printed sheets, glass, panels), with material, thickness and shadow;
> - an object or a model made in three dimensions for the idea;
> - graphics set in code together with a photographed or three-dimensional object: the object gives material and light, the code gives the exact content.
> In each of these, what is exact (words, interface, the brand's marks) is set in code on a real surface of the picture: a screen, a sheet, a panel, a wall. The picture holds the things themselves (the sheets, the panels, the device, the object), with their faces left plain; code only fills those faces, in the perspective and the light of the picture. What code sets belongs to the scene: it takes the light, the grain and the perspective of the surface it sits on, and wherever the scene shows that surface again (a reflection, a shadow, a glow on what is near it), the same content appears there as the scene would show it, drawn to match. An empty wall, table or room with flat shapes set over it in code is none of these ways.

### Когда у бренда нет картинки продукта

> This brand has no picture of its product or its work that the frame may show. Do not put an empty stand-in in its place (a blank plate, an empty frame, a placeholder screen), and do not make the ad itself the subject. Each idea shows one of these instead, and the three do not all choose the same one: the viewer's situation before the product (the problem as it looks in their day); the result the product leaves (what is different afterwards, as a thing or a moment a stranger can see); or a made scene that stands for the promise (a place, an object or an action that reads as the promise with no product in it).

### Эскизы идей — проверены и выключены
- **Что это было:** к каждой из трёх идей делалась картинка, рецензент выбирал глазами.
- **Что показали прогоны:** на Mossa без эскизов кадр не хуже и дешевле (1 картинка против 4). Эскиз, попавший в финал как есть, давал странный кроп и неаккуратные дорисовки. Рецензент со зрением всё равно однажды выбрал странную идею.
- **Состояние:** выключены по умолчанию, включаются `STUDIO_IDEA_SKETCHES=1`. Код и отдельная строка сметы для них остались в ветке.

---

## 5. Картинка, инструмент и вёрстка

### Что такое «привлекательная картинка»

> AN ATTRACTIVE PICTURE
> - One hero. One element leads by size, light or contrast; the eye lands on it first and knows where to go next.
> - Scale with courage. The main thing takes as much of the frame as its importance; large and small are plainly different, and nothing is medium by default.
> - Contrast. The frame has one strongest contrast (light against dark, large against small, sharp against soft, colour against quiet), and it sits on the subject.
> - Light. It has a direction and a mood, and it shapes the subject.
> - Colour as a decision. Few colours, one of them leading, taken from the brand.
> - Material and detail. Surfaces, textures and finishes are made well enough to reward a second look.
> - A point of view. The camera is somewhere on purpose: close or far, low or high, at an angle, through something. Straight-on and centred is a choice to be made, never the default.
> - A decided composition. Where the weight sits and where the air is were chosen for this idea; nothing is placed where it is by habit.
> - Finish. Everything is made with care at the size it is seen, with one light and clean edges; nothing looks unfinished, cheap or like a stand-in.
> - Worth looking at alone. With the words taken away, the picture is still one a person would stop for: something in it is rich (a material, a light of a particular hour, a colour that sings against the rest, layers from near to far). A clean empty room is tidy; it is not yet beautiful.
> - Room for the words without emptiness. Words can sit on a calm part of the picture; a large share of the frame is not emptied for them.
> - Feeling. The picture has a mood a viewer could name, and they want to look a little longer.

### Реклама — не страница брендбука
Ответ на стерильность у сдержанных брендов.

> AN AD IS NOT A PAGE OF THE BRAND BOOK
> The brand's rules govern its identity: its marks, its type, the roles of its colours and how its own pages are laid out. Keep them exactly in the graphic layer of the frame: the words, the mark, panels and lines. They do not say how little may happen in the picture. An ad has to win a look in a feed against everything else there, so let the picture be as rich, alive and surprising as the idea needs, with real things, light, texture and colour of its own, and let the type be large enough to be an event in the frame. A restrained brand is restrained in how it speaks and signs, not in how empty its ad is. Shares of colour stated for the brand's pages apply to the graphic layer, not to a photograph.

### Чем что делать: код или картинка

> No way of making is forbidden, and each has what it does well. Code is exact and flat: it sets type, marks, interfaces, diagrams and flat graphics well. A thing with material, light and depth (an object, a place, a moment, a device) looks drawn when it is built in code: ask for it as a picture. What your skills say against depth is about glows, blurs and shadows laid over flat shapes to make them look finished; it is not about real space, volume or light.

- **Откуда взялась «плоскость»:** в навыках есть фразы против фальшивой глубины («не создавай глубину тенями и градиентами поверх плоских фигур»). Дизайнер читал их как требование плоской графики. Сами тексты навыков я не менял — они ваши и правятся через редактор навыков; стоит смягчить фразу про глубину в «Frame composition» и про «парящие панели» в «Stopping power».
- **Типичная ошибка:** дизайнер заказывает пустой фон (стену, стол, комнату) и кладёт предмет кодом поверх. Правило это запрещает, но соблюдается через раз.

### Точная посадка содержимого на предмет
Новая возможность приложения, не правило.
- После покупки картинки приложение по пикселям, без модели, находит чистые светлые четырёхугольники — лист, экран, их отражение — и сообщает дизайнеру, сколько нашло.
- В наборе инструментов дизайнера есть деталь, которая кладёт содержимое на эти углы в перспективе и «умножает» его на свет поверхности. Есть зеркальный вариант для отражений.
- **Проверено на одном кадре** (прогон 36: карточка и её отражение в зеркале) — посадка ровная, отражение темнее оригинала.
- **Слабости:** белая карточка на светлом фоне не находится; блик на глянцевом предмете может быть принят за поверхность.

> SETTING CONTENT ON A FACE OF A PICTURE
> When a bought picture arrives, the app measures the plain faces in it (a blank sheet, card or screen, and its reflection) and tells you how many it found. To set words or an interface on one, use onPicture and OnSurface from './kit': const p = onPicture(resources[id], area, 'cover') where area is the box you draw the picture in, as the kit writes boxes, and 'cover' is its fit (also 'contain' or 'fill'; a fourth argument [x, y] in fractions is its position, [0.5, 0.5] by default); p.box is where the whole picture lies and p.faces are the faces, largest first. Then <OnSurface corners={p.faces[0]} box={p.box} width={w} height={h}>content drawn at w by h</OnSurface>, in the same positioned parent as the picture and after it. It fits the content to the face in its perspective and under its light (blend 'multiply' by default; 'normal' covers the face). A dimmer face with the same shape as a brighter one is usually its reflection: set the same content on it with mirror (a reflection in an upright mirror or pane) or mirror="down" (a reflection in a floor or a tabletop), at a lower opacity. When no face was measured where you need one, ask for the picture again with the face plainer, lighter than its ground and whole inside the frame, or have the picture carry the content itself; never place content on a face by eye.

### Фирменные элементы бренда

> THE BRAND'S OWN DEVICES
> A finish, a material, a gradient, a shape or a mark that the brand's own kit names is this brand's: use it with confidence, as the kit describes it. What your skills say against depth, gloss, glows or gradients added to make a frame look finished is about devices the brand does not own.

> Use each of the brand's devices in the role and at the scale its own materials give it; where the brand pack lists DEVICES IN USE, follow that, and where it says "not stated", choose the role yourself and say which.

### Движение закладывается заранее

> THE WORK WILL MOVE. Later stages animate it, so have a plan for its motion now and say it in a line or two. Motion can be the passage from one scene to the next, movement inside a scene, light that travels, or one principle that runs through the whole piece, the way a collage is put together and taken apart; not everything has to move, and stillness can be the choice. What matters is that the plan exists and the frames are made for it. The plan never costs the picture: the photograph or the render that carries the idea stays, and a whole picture can move too (the camera travels, the light changes). When one element has to move by itself, ask for it as its own picture or cutout of the same scene; do not redraw a picture in code only so that its parts can move.

Важная оговорка, найденная на практике: первая версия этого правила («то, что движется, — отдельный элемент») заставила дизайнера перерисовать выбранную фотографию кодом, «чтобы части могли двигаться». Поэтому добавлено: план движения никогда не стоит картинки.

---

## 6. Сцены после ключевого кадра

- **У каждой сцены своя композиция под своё сообщение.** Раньше сцены 2 и 3 повторяли вёрстку ключевого кадра с новыми словами.

> Each scene gets its own composition for its own message. What stays the same from scene to scene is the system: the type, the colour and the marks.

- **Сцены получают один доводочный ход.** В режиме «рецензент советует» замечания к сценам раньше просто складывались для арт-директора, и сцены 2–3 никто не доводил. Теперь серьёзные замечания (P0, P1) идут дизайнеру на один ход, мелкие (P2) остаются арт-директору.
- **Находки по сценам называются по-человечески.** Вместо внутренних номеров — сцена, формат, язык, вариант; для наложения текста на логотип даются координаты обоих. К находке прикладывается картинка именно того вида, где она есть. Раньше дизайнер тратил три хода на находку, которую не видел.
- **Не проверено:** на последних правилах (после прогона 15) полный черновик из трёх сцен не прогонялся.

---

## 7. Рецензент

- **Судит по трём признакам:** привлекательно, в стиле бренда, идея видна сразу. Не выполнен один — работа не проходит.

> The work is judged by one aim: an attractive picture, in the brand's own style, that shows the idea as vividly as it can be shown. In the brand's own style means made as its own designers would make it, in its aesthetic; the parts of its kit set side by side are not that. It also means the subject, the setting and the taste of the picture belong to the world of the brand (as modern or as traditional, as playful or as serious as the brand is); a subject from another world in the brand's colours is not in its style. Vivid means the idea is seen in the picture at once, before the words are read. No way of making is preferred or forbidden. Work that misses one of the three (it is not attractive, it is not in the brand's own style, or its idea is not seen) fails, however well the other two are done, and a note names which. A brand's restraint and its stated shares of colour are judged in the graphic layer (words, mark, panels), not in how much happens in the picture: a picture richer or more colourful than the brand's own pages is no fault, and a frame that is tidy and empty is one.

- **Обязан сказать, где кадр робкий.**

> Whatever the checks say, add one note of priority P1 that names where this frame is timid: what holds it back from being more striking and more beautiful while it stays this idea and this brand (its scale, its light, its colour, the richness of its picture, or its point of view). The note says what is timid and why; the answer is the designer's.

- **Не ломает выбранную идею.** В прогоне 14 рецензент сам выбрал идею, а потом выдал 12 замечаний против её устройства, и дизайнер пересобрал кадр в другую композицию.

> The frame keeps what the chosen idea says it is made of and how the idea arranges it. A point that would need another arrangement stays open: name it in one line and leave the frame as the idea has it.

> Each note names a problem; the answer is yours. Solve it inside the chosen idea, which stays. When a note cannot be solved inside the idea, say so and why, and leave the idea as it is. The frame's main subject and its way of making stay: answer no note by removing the subject or by making the frame another way.

- **Фирменный блеск и градиент — не ошибка.**

> A finish, a material, a gradient, a shape or a mark that the brand's own kit names is the brand's device: it is never a sign of failure and never fails a check. The signs and checks about glows, gloss, gradients or added depth apply only to devices the brand does not own.

- **Выбор между идеями:** идея, которой нужны специальные знания или объяснение, не проходит; из прошедших побеждает та, что ярче показывает идею, затем более остроумная, затем та, у которой яснее план движения.

### Проверки «да/нет», добавленные рецензенту
В квадратных скобках — стадия.

- [hero] Is each device of the brand used in the role and at the scale that the brand's own materials give it?
- [hero] Does every large area of the frame do work for the idea: it shows the subject, carries words, or is space the idea needs?
- [extension] Does each scene have its own composition for its own message, while the type, the colour and the marks stay one system?
- [hero] Is everything the frame shows as the product or its work the real thing, with no placeholder standing in for it?
- [hero] Do all parts of the frame share one direction of light, one perspective and one scale?
- [hero] Is the outline of every element readable, with none hidden or cut by another element?
- [hero] Is the place of the mark tied to another element of the frame, with a reason a viewer can see?
- [hero] Can a viewer tell this frame apart from other ads for the same kind of product at thumbnail size?
- [hero] Is the word that carries the idea the first word a viewer reads in the headline?
- [hero] Is the idea on the frame the chosen idea, as written under THE CHOSEN IDEA?
- [ideas] Can the idea be made from what the brand really has: its supplied files, pictures that can be generated, and code?
- [ideas] Is the idea a new picture in the aesthetic of the brand, as its own designers would make it, and more than an arrangement of what its kit already holds?
- [ideas] Can a stranger retell the turn of the idea to a friend in one sentence?
- [hero] Can a stranger, with the words covered, say what the picture shows and what is surprising in it?
- [hero] Are the things in the frame that have material and depth part of the picture itself, and not shapes drawn over an empty ground?
- [hero] Does what is set on a surface of the picture take its light and perspective, and show in its reflections and shadows too?
- [hero] Is the frame, with the logo covered, known as the brand by its light, colour, materials and mood, and not only by parts of its kit?

---

## 8. Что изменено в самой механике

- **Запрошенная картинка должна быть нарисована.** Если дизайнер заказал картинку, а код рисует другую, он сразу получает сообщение с обоими номерами, и последний ход на этом не закрывается. Причина: в прогоне 21 рецензент выбрал «вешалку», а в кадре стоял «световой стол» из-за перепутанного номера.
- **При доставке картинки дизайнеру сообщается,** сколько чистых поверхностей на ней найдено.
- **Экспорт** копирует шрифты побайтно и картинки, которые видели агенты.
- **Кнопка «New run with the same brief»** — новая кампания с тем же брендом и скопированным брифом.
- **Стенд** получил переключатели для экспериментов: подставить «Эстетику», переименовать или заменить направление, собрать заданную идею без этапа идей.

---

## 9. Что не решено

1. **Выбор инструмента ненадёжен.** При одних правилах дизайнер то заказывает сцену, то рисует предмет кодом. Проверка рецензента «вещи с объёмом — часть картинки» однажды кадр пропустила. Предложение, которое не реализовано: условие приёмки на стороне приложения — если идея это предмет, место или момент, а купленных картинок в кадре ноль, ключевой кадр не принимается.
2. **Стерильность сдержанных брендов.** Правило «реклама не страница брендбука» картинку Toggle оживило слабо, потому что того же просит бриф.
3. **Узкий круг идей.** У Toggle из прогона в прогон возвращаются зеркало, веер, лента из фотобудки. Десять черновых с вычёркиванием дали новые идеи в двух прогонах из трёх (стопка оттисков, табло); в третьем вернулось зеркало.
4. **Условное содержимое.** На карточках и экранах стоит выдуманная реклама («Made for you», «Shop now»), а не чья-то работа. У брендов-услуг нет настоящих работ, которые можно показать.
5. **Размер картинок** в студии остаётся 1024 px (отложено вами).
6. **Не написано:** обзор в `docs/reviews/` по изменениям 16 ноября до этого документа; тесты на строку сметы эскизов.

---

## 10. Цифры

- Полный черновик из трёх сцен: около $2.5 по API-эквиваленту, 15–16 минут (прогоны 14 и 15).
- Ключевой кадр: $0.9–1.7, 6–13 минут, обычно 5–7 ходов дизайнера и одна картинка.
- 12 ходов в прогоне 34 — следствие плохо описанной новой детали посадки; после исправления снова 5.
- Эскизы добавляли три картинки и 2–3 минуты на направление.
- Проверки на момент последнего коммита: typecheck, lint и сборка проходят; тесты 1275 из 1287, 12 падений известные (`tests/creative-skeleton.test.ts`, отсутствует локальный файл).

---

## Приложение. Где лежат тексты

| Текст | Файл | Имя |
|---|---|---|
| Общая цель | `packages/director/image-ideas.ts` | `BRAND_SPIRIT` |
| Яркая идея, привлекательная картинка | там же | `VIVID_IDEA`, `ATTRACTIVE_PICTURE` |
| Реклама не страница брендбука | там же | `AD_NOT_A_PAGE` |
| Приёмы для неосязаемого продукта | там же | `GIVING_A_BODY` |
| Десять идей, различие идей | там же | `IDEAS_WIDE`, `IDEAS_RANGE`, `IDEAS_SUBJECT` |
| План движения | там же | `MOTION_AHEAD` |
| Код или картинка | `packages/director/hero-chat.ts` | `SPACE_DESIGNER` |
| Посадка на поверхность | `packages/director/surfaces.ts` | `SURFACES_DESIGNER` |
| Измерение поверхностей | `packages/director/image-surfaces.ts` | `measureSurfaces` |
| Деталь посадки | `remotion/director/kit.ts` | `onPicture`, `OnSurface` |
| Рецензент | `packages/director/quality.ts` | `BRAND_SPIRIT_REVIEWER`, `BOLDER_NOTE`, `QUALITY_CHECKS` |
| Текст о бренде | `packages/brand/brand-pack-contents.ts` | `AESTHETIC_LABEL`, `DEVICES_IN_USE_LABEL`, `brandCharacterInstructions` |
