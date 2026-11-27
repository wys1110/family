(() => {
  const e = "english",
    n = "family-english-story-settings-v1",
    i = [
      {
        id: "doyun-tiny-star",
        emoji: "⭐",
        title: "Doyun and the Tiny Star",
        koreanTitle: "도윤이와 작은 별",
        theme: "사랑",
        age: "0–3세",
        summary:
          "작은 별이 도윤이에게 사랑은 언제나 곁에 있다고 말해주는 잠자리 이야기예요.",
        lines: [
          [
            "Doyun looked up at the quiet night sky.",
            "도윤이는 고요한 밤하늘을 올려다보았어요.",
          ],
          [
            "A tiny star blinked and said, Hello, Doyun.",
            "작은 별이 반짝이며 말했어요. 안녕, 도윤아.",
          ],
          [
            "Are you alone up there? Doyun asked.",
            "거기 혼자 있니? 도윤이가 물었어요.",
          ],
          [
            "No, said the star. Love is always near me.",
            "아니야, 별이 말했어요. 사랑은 언제나 내 곁에 있어.",
          ],
          [
            "Your family’s love is near you, too.",
            "너의 곁에도 가족의 사랑이 있단다.",
          ],
          [
            "Doyun smiled and closed his sleepy eyes.",
            "도윤이는 미소 지으며 졸린 눈을 감았어요.",
          ],
          [
            "Good night, little star. Good night, Doyun.",
            "잘 자, 작은 별아. 잘 자, 도윤아.",
          ],
        ],
      },
      {
        id: "moon-soft-blanket",
        emoji: "🌙",
        title: "The Moon’s Soft Blanket",
        koreanTitle: "달님의 포근한 이불",
        theme: "잠자리",
        age: "0–3세",
        summary:
          "달빛이 아기 동물들을 포근하게 재워주는 짧고 잔잔한 이야기예요.",
        lines: [
          [
            "The moon opened a soft silver blanket.",
            "달님이 부드러운 은빛 이불을 펼쳤어요.",
          ],
          [
            "It covered the little bird in the tree.",
            "나무 위 작은 새를 덮어주었어요.",
          ],
          [
            "It covered the bunny under the leaves.",
            "나뭇잎 아래 토끼도 덮어주었어요.",
          ],
          [
            "It covered the baby bear in the warm cave.",
            "따뜻한 동굴 속 아기 곰도 덮어주었어요.",
          ],
          [
            "Then the moon whispered, You are safe.",
            "그리고 달님은 속삭였어요. 너는 안전하단다.",
          ],
          [
            "The whole forest breathed slowly together.",
            "온 숲이 함께 천천히 숨을 쉬었어요.",
          ],
          [
            "Good night, forest. Good night, baby.",
            "잘 자, 숲아. 잘 자, 아가야.",
          ],
        ],
      },
      {
        id: "bear-thank-you",
        emoji: "🐻",
        title: "Little Bear Says Thank You",
        koreanTitle: "아기 곰의 고마워",
        theme: "감사",
        age: "1–4세",
        summary: "작은 친절을 발견하고 고맙다고 말하는 법을 배우는 이야기예요.",
        lines: [
          [
            "Little Bear woke up to a bright morning.",
            "아기 곰은 밝은 아침에 눈을 떴어요.",
          ],
          [
            "The sun warmed his tiny paws.",
            "햇살이 조그만 발을 따뜻하게 해주었어요.",
          ],
          [
            "Thank you, sun, said Little Bear.",
            "고마워, 해님아. 아기 곰이 말했어요.",
          ],
          [
            "A bird shared a sweet red berry.",
            "새 한 마리가 달콤한 빨간 열매를 나누어 주었어요.",
          ],
          [
            "Thank you, friend, said Little Bear.",
            "고마워, 친구야. 아기 곰이 말했어요.",
          ],
          [
            "Mama Bear gave him a gentle hug.",
            "엄마 곰이 아기 곰을 다정하게 안아주었어요.",
          ],
          [
            "Thank you for loving me, he whispered.",
            "사랑해줘서 고마워요. 아기 곰이 속삭였어요.",
          ],
        ],
      },
      {
        id: "bunny-brave-step",
        emoji: "🐰",
        title: "Bunny’s Brave Little Step",
        koreanTitle: "토끼의 용감한 한 걸음",
        theme: "용기",
        age: "1–4세",
        summary: "무서워도 작은 한 걸음을 내디디면 된다는 이야기예요.",
        lines: [
          [
            "Bunny found a small bridge over a stream.",
            "토끼는 시냇물 위의 작은 다리를 발견했어요.",
          ],
          [
            "The water made a splashy, splashy sound.",
            "물은 찰랑찰랑 소리를 냈어요.",
          ],
          ["I feel scared, Bunny said.", "무서워. 토끼가 말했어요."],
          [
            "Take one little step, said Mama Bunny.",
            "작은 한 걸음만 내디뎌 보렴. 엄마 토끼가 말했어요.",
          ],
          [
            "Bunny stepped once, then twice, then three times.",
            "토끼는 한 걸음, 두 걸음, 세 걸음을 걸었어요.",
          ],
          [
            "Soon he was on the other side.",
            "어느새 토끼는 다리 건너편에 도착했어요.",
          ],
          [
            "A little step can be very brave.",
            "작은 한 걸음도 아주 용감할 수 있어요.",
          ],
        ],
      },
      {
        id: "cloud-shares-rain",
        emoji: "☁️",
        title: "The Cloud That Shared",
        koreanTitle: "나누어 주는 구름",
        theme: "나눔",
        age: "1–4세",
        summary: "작은 구름이 비를 나누어 주며 모두를 기쁘게 하는 이야기예요.",
        lines: [
          [
            "A little cloud carried a pocket full of rain.",
            "작은 구름은 빗방울을 주머니 가득 담고 있었어요.",
          ],
          [
            "The flowers below looked dry and tired.",
            "아래의 꽃들은 목이 말라 지쳐 보였어요.",
          ],
          [
            "You may have my rain, said the cloud.",
            "내 비를 나누어 줄게. 구름이 말했어요.",
          ],
          [
            "Drip, drop, drip. The flowers lifted their heads.",
            "톡, 토독, 톡. 꽃들이 고개를 들었어요.",
          ],
          [
            "The trees danced in the cool breeze.",
            "나무들은 시원한 바람에 춤을 추었어요.",
          ],
          [
            "The cloud felt lighter and happier.",
            "구름은 몸도 마음도 더 가볍고 행복해졌어요.",
          ],
          [
            "Sharing made the whole garden smile.",
            "나눔은 온 정원을 미소 짓게 했어요.",
          ],
        ],
      },
      {
        id: "whale-listens",
        emoji: "🐳",
        title: "The Little Whale Who Listened",
        koreanTitle: "귀 기울이는 아기 고래",
        theme: "경청",
        age: "1–4세",
        summary:
          "조용히 귀 기울이면 친구의 마음을 들을 수 있다는 바다 이야기예요.",
        lines: [
          [
            "A little whale loved to sing all day.",
            "아기 고래는 하루 종일 노래하는 것을 좋아했어요.",
          ],
          [
            "One day, he heard a very small sound.",
            "어느 날 아주 작은 소리가 들렸어요.",
          ],
          [
            "Peep, peep, came a lost baby fish.",
            "삐약삐약, 길을 잃은 아기 물고기였어요.",
          ],
          [
            "The whale stopped singing and listened.",
            "아기 고래는 노래를 멈추고 귀를 기울였어요.",
          ],
          [
            "I cannot find my family, said the fish.",
            "가족을 찾을 수 없어요. 물고기가 말했어요.",
          ],
          [
            "I will help you, said the gentle whale.",
            "내가 도와줄게. 다정한 고래가 말했어요.",
          ],
          [
            "A listening heart can find a friend.",
            "귀 기울이는 마음은 친구를 찾을 수 있어요.",
          ],
        ],
      },
      {
        id: "sun-good-morning",
        emoji: "☀️",
        title: "Good Morning, Little Sun",
        koreanTitle: "좋은 아침, 작은 해님",
        theme: "아침",
        age: "0–3세",
        summary: "아침에 가족과 함께 인사하며 하루를 시작하는 밝은 이야기예요.",
        lines: [
          [
            "The little sun peeked over the hill.",
            "작은 해님이 언덕 너머로 얼굴을 내밀었어요.",
          ],
          [
            "Good morning, sleepy trees, said the sun.",
            "좋은 아침, 졸린 나무들아. 해님이 말했어요.",
          ],
          ["Good morning, tiny birds.", "좋은 아침, 작은 새들아."],
          ["Good morning, warm little home.", "좋은 아침, 따뜻한 우리 집아."],
          [
            "Doyun stretched his arms up high.",
            "도윤이는 두 팔을 높이 쭉 뻗었어요.",
          ],
          [
            "Mama and Daddy smiled at him.",
            "엄마와 아빠는 도윤이를 보며 미소 지었어요.",
          ],
          ["Good morning, beautiful day.", "좋은 아침, 아름다운 오늘아."],
        ],
      },
      {
        id: "snail-little-garden", emoji: "🐌",
        title: "Snail and the Little Garden", koreanTitle: "달팽이와 작은 정원",
        theme: "기다림", age: "1–4세",
        summary: "천천히 걸으며 정원의 작은 아름다움을 발견하는 이야기예요.",
        lines: [
          ["Snail wanted to see the yellow flower.", "달팽이는 노란 꽃을 보고 싶었어요."],
          ["She took one slow slide across a leaf.", "달팽이는 잎사귀 위를 천천히 미끄러져 갔어요."],
          ["A butterfly fluttered past her.", "나비 한 마리가 달팽이 곁을 팔랑이며 지나갔어요."],
          ["Take your time, said the butterfly.", "천천히 와도 괜찮아. 나비가 말했어요."],
          ["Snail stopped to watch a tiny drop of rain.", "달팽이는 멈춰서 작은 빗방울을 바라보았어요."],
          ["At last, she reached the soft yellow petals.", "마침내 달팽이는 부드러운 노란 꽃잎에 도착했어요."],
          ["What a lovely little journey, she said.", "참 멋진 작은 여행이었어. 달팽이가 말했어요."],
        ],
      },
      {
        id: "otter-room-for-friend", emoji: "🦦",
        title: "A Little Room for a Friend", koreanTitle: "친구를 위한 작은 자리",
        theme: "배려", age: "1–4세",
        summary: "아기 수달이 친구에게 자리를 내어 주고 함께 쉬는 이야기예요.",
        lines: [
          ["Little Otter rested on a smooth, warm rock.", "아기 수달은 매끈하고 따뜻한 바위 위에서 쉬고 있었어요."],
          ["Duck swam over, paddling with tired little feet.", "오리가 지친 작은 발로 물장구를 치며 헤엄쳐 왔어요."],
          ["May I rest here, too? asked Duck.", "나도 여기서 쉬어도 될까? 오리가 물었어요."],
          ["Little Otter moved a little to one side.", "아기 수달은 한쪽으로 조금 비켜 주었어요."],
          ["Here is a cozy spot for you, he said.", "여기 네가 쉴 포근한 자리가 있어. 수달이 말했어요."],
          ["They watched the ripples sparkle in the sun.", "둘은 햇빛에 반짝이는 잔물결을 바라보았어요."],
          ["A little room made a lovely place for two.", "작은 자리를 내어 주니 둘이 함께할 멋진 곳이 되었어요."],
        ],
      },
      {
        id: "fox-autumn-colors", emoji: "🍂",
        title: "Little Fox Finds Autumn", koreanTitle: "아기 여우가 찾은 가을",
        theme: "자연", age: "1–4세",
        summary: "가을 산책에서 여러 색의 나뭇잎을 발견하는 이야기예요.",
        lines: [
          ["Little Fox walked beside Papa on a cool day.", "선선한 날, 아기 여우는 아빠 곁에서 걸었어요."],
          ["A red leaf danced down from a tree.", "빨간 나뭇잎 하나가 나무에서 춤추듯 내려왔어요."],
          ["A yellow leaf landed by his toes.", "노란 나뭇잎 하나가 발끝에 내려앉았어요."],
          ["Look, Papa! The trees have new colors.", "아빠, 보세요! 나무에 새로운 색이 생겼어요."],
          ["Papa smiled as the leaves went crunch, crunch.", "나뭇잎이 바스락바스락 소리를 내자 아빠가 미소 지었어요."],
          ["They left the leaves for the forest floor.", "둘은 나뭇잎을 숲 바닥에 그대로 두었어요."],
          ["Then they walked home, warm paw in warm paw.", "그리고 따뜻한 손을 맞잡고 집으로 걸어갔어요."],
        ],
      },
      {
        id: "milo-other-sock", emoji: "🧦",
        title: "Where Is the Other Sock?", koreanTitle: "짝꿍 양말은 어디에?",
        theme: "짝 맞추기", age: "1–4세",
        summary: "마일로가 양말 짝을 찾아 두 발을 따뜻하게 하는 이야기예요.",
        lines: [
          ["Milo finds one sock.", "마일로가 양말 한 짝을 찾았어요."],
          ["He puts it on his left foot.", "왼발에 양말을 신었어요."],
          ["His right foot feels cold.", "오른발은 아직 차가웠어요."],
          ["He looks in the basket.", "마일로가 바구니 안을 들여다봤어요."],
          ["There is his other sock!", "짝꿍 양말이 거기 있었어요!"],
          ["Now both feet are warm.", "이제 두 발이 모두 따뜻해요."],
          ["Milo wiggles his toes.", "마일로가 발가락을 꼼지락거려요."],
        ],
      },
      {
        id: "ada-little-block-tower", emoji: "🧱",
        title: "Ada’s Little Block Tower", koreanTitle: "에이다의 작은 블록 탑",
        theme: "다시 해 보기", age: "1–4세",
        summary: "에이다가 무너진 블록 탑을 다른 방법으로 다시 쌓아 보는 이야기예요.",
        lines: [
          ["Ada stacks three blocks.", "에이다가 블록 세 개를 쌓아요."],
          ["The tall tower falls down.", "높은 탑이 와르르 무너져요."],
          ["Ada tries again.", "에이다는 다시 해 봐요."],
          ["She puts two blocks side by side.", "블록 두 개를 나란히 놓아요."],
          ["She puts one block on top.", "그 위에 블록 하나를 올려요."],
          ["The little tower stays up.", "이번엔 작은 탑이 쓰러지지 않아요."],
          ["Ada claps her hands.", "에이다가 손뼉을 쳐요."],
        ],
      },
      {
        id: "mouse-down-the-ramp", emoji: "⚽",
        title: "Down the Ramp", koreanTitle: "데굴데굴, 주르륵",
        theme: "과학 놀이", age: "1–4세",
        summary: "아기 생쥐가 기울어진 판에서 공과 장난감 오리가 어떻게 움직이는지 살펴보는 이야기예요.",
        lines: [
          ["Little Mouse put a ball on a ramp.", "아기 생쥐가 기울어진 판 위에 공을 올렸어요."],
          ["The ball rolled down to her toes.", "공이 발끝까지 데굴데굴 굴러 내려왔어요."],
          ["Then she put a toy duck on the ramp.", "이번엔 장난감 오리를 판 위에 올렸어요."],
          ["The duck slid down with a tap.", "장난감 오리가 주르륵 내려와 톡 소리를 냈어요."],
          ["Little Mouse tried the ball again.", "아기 생쥐가 다시 공을 올려 봤어요."],
          ["It rolled right past the duck.", "공이 장난감 오리 곁을 데굴데굴 지나갔어요."],
          ["Little Mouse laughed and picked up the ball.", "아기 생쥐가 웃으며 공을 집어 들었어요."],
        ],
      },
    ],
    o = {
      selectedId: null,
      showKorean: !0,
      rate: 0.78,
      activeLine: -1,
      readerLine: 0,
      readFromHere: false,
      playing: !1,
      paused: !1,
      playToken: 0,
      playAll: !0,
      progress: {},
      storageOwner: "device",
    },
    a = () => ("undefined" != typeof state ? state : null),
    s = (e) => {
      "function" == typeof toast ? toast(e) : window.alert(e);
    },
    r = () => {
      const e = new Date();
      return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
    },
    l = () => {
      const e = new Date(),
        t = Math.floor(
          Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()) / 864e5,
        );
      return i[t % i.length];
    },
    d = () => i.find((e) => e.id === o.selectedId) || l(),
    c = (e = "") =>
      String(e).replace(
        /[&<>'"]/g,
        (e) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;",
          })[e],
      ),
    storageKey = (key) => window.FAMILY_DEMO.storageKey(`${key}:${o.storageOwner}`),
    h = () => storageKey("family-english-story-history-v1"),
    j = () => storageKey(n),
    progress = () => o.progress[d().id] || 0;
  function u() {
    try {
      localStorage.setItem(
        j(),
        JSON.stringify({
          selectedId: o.selectedId,
          showKorean: o.showKorean,
          rate: o.rate,
          progress: o.progress,
        }),
      );
    } catch {}
  }
  function y() {
    try {
      return JSON.parse(localStorage.getItem(h()) || "{}");
    } catch {
      return {};
    }
  }
  function g(e, t = !1) {
    if (!t) C();
    o.readFromHere = false;
    o.progress[e] = i.find((story) => story.id === e).lines.length;
    u();
    const n = y();
    n[r()] = { storyId: e, completedAt: new Date().toISOString() };
    try {
      localStorage.setItem(h(), JSON.stringify(n));
    } catch {}
    (w(), x(), $(), t || s("오늘의 영어 동화를 들었어요 📖"));
  }
  function m() {
    if ("function" != typeof switchView || switchView.__englishStoriesInstalled)
      return;
    const n = switchView,
      i = function (i) {
        const o = document.querySelector("#englishView"),
          s = document.querySelector("#addEventButton");
        if (i !== e)
          return (C(), o && (o.hidden = !0), s && (s.hidden = !1), n(i));
        n("calendar");
        const r = a();
        r && (r.activeView = e);
        try {
          localStorage.setItem(
            ACTIVE_VIEW_KEY,
            e,
          );
        } catch {}
        (document.querySelector("#calendarView")?.setAttribute("hidden", ""),
          document.querySelector("#growthView")?.setAttribute("hidden", ""),
          document.querySelector("#privateView")?.setAttribute("hidden", ""),
          o && (o.hidden = !1),
          document
            .querySelectorAll(".view-tab")
            .forEach((t) => {
              const n = t.dataset.view === e;
              t.classList.toggle("active", n);
              t.setAttribute("role", "tab");
              t.setAttribute("aria-selected", String(n));
            }),
          s && (s.hidden = !0),
          p());
      };
    (Object.keys(n).forEach((e) => {
      try {
        i[e] = n[e];
      } catch {}
    }),
      (i.__englishStoriesInstalled = !0),
      (switchView = i));
  }
  function p() {
    (v(), S(), w());
  }
  function storyIcon(name) {
    const path = {
      previous: "m14.5 6-6 6 6 6",
      next: "m9.5 6 6 6-6 6",
      shelf: "M4 4v15m4-15v15m4-12v12m3-13 4 12M3 21h18",
      settings: "M3 7h4m4 0h10M3 17h10m4 0h4m-10-10a2 2 0 1 0 4 0 2 2 0 0 0-4 0m6 10a2 2 0 1 0 4 0 2 2 0 0 0-4 0"
    };
    return `<svg class="storybook-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${path[name]}"/></svg>`;
  }
  function resetReader() {
    const saved = progress();
    o.readerLine = saved < d().lines.length ? saved : 0;
    o.readFromHere = false;
  }
  function renderSentence() {
    const story = d();
    const line = story.lines[o.readerLine];
    document.querySelector("#englishSentenceList").setAttribute("aria-live", o.playing ? "off" : "polite");
    document.querySelector("#englishLineEnglish").textContent = line[0];
    const translation = document.querySelector("#englishLineKorean");
    translation.textContent = line[1];
    translation.hidden = !o.showKorean;
    document.querySelector("#englishLinePosition").textContent = `${o.readerLine + 1} / ${story.lines.length}`;
    document.querySelector("#englishPrevLine").disabled = o.readerLine === 0;
    document.querySelector("#englishNextLine").disabled = o.readerLine === story.lines.length - 1;
  }
  function turnPage(offset) {
    const next = o.readerLine + offset;
    if (!d().lines[next]) return;
    if (o.playing) C();
    o.readerLine = next;
    o.readFromHere = true;
    renderSentence();
    x();
    $();
  }
  function v() {
    const story = d();
    const cover = document.querySelector("#englishCoverImage");
    if (cover.dataset.storyId !== story.id) {
      cover.dataset.storyId = story.id;
      cover.hidden = false;
      const fallback = document.querySelector("#englishCoverFallback");
      fallback.textContent = story.emoji;
      fallback.hidden = true;
      cover.src = `assets/stories/${story.id}.webp`;
    }
    document.querySelector("#englishFeatureLabel").textContent = story.id === l().id ? "오늘의 동화" : "고른 동화";
    document.querySelector("#englishStoryTheme").textContent = `${story.age} · ${story.lines.length}문장`;
    document.querySelector("#englishStoryKoreanTitle").textContent = story.koreanTitle;
    document.querySelector("#englishStoryTitle").textContent = story.title;
    document.querySelector("#englishStorySummary").textContent = story.summary;
    const translation = document.querySelector("#englishTranslationButton");
    translation.setAttribute("aria-pressed", String(o.showKorean));
    translation.querySelector("strong").textContent = o.showKorean ? "뜻 숨기기" : "한글 뜻 보기";
    const speed = document.querySelector("#englishSpeedButton");
    speed.setAttribute("aria-pressed", String(o.rate === 0.78));
    speed.querySelector("strong").textContent = o.rate === 0.78 ? "천천히" : "보통 속도";
    renderSentence();
    x();
    $();
  }
  function S() {
    const selected = d().id;
    document.querySelector("#englishLibrary").innerHTML = i.map(story => `
      <button type="button" class="storybook-library-item" data-story-id="${c(story.id)}" aria-pressed="${selected === story.id}">
        <img src="assets/stories/${c(story.id)}.webp" alt="" loading="lazy" width="52" height="52">
        <span><strong>${c(story.koreanTitle)}</strong><small lang="en">${c(story.title)}</small></span>
        ${storyIcon("next")}
      </button>`).join("");
  }
  function w() {
    const e = y(),
      t = progress() === d().lines.length || e[r()]?.storyId === d().id,
      n = document.querySelector("#englishMarkRead");
    n &&
      (n.classList.toggle("done", t),
      (n.textContent = t ? "✓ 이 동화 완료" : "✓ 오늘 들었어요"));
  }
  function b(id) {
    if (!i.some(story => story.id === id)) return;
    C();
    o.selectedId = id;
    resetReader();
    u();
    p();
    document.querySelector("#englishLibrarySection").open = false;
    document.querySelector("#englishStorySettings").open = false;
    document.querySelector("#englishStoryKoreanTitle").focus?.({ preventScroll: true });
    document.querySelector("#englishStoryPlayer")?.scrollIntoView({ block: "start" });
  }
  function f(e) {
    const t = (i.findIndex((e) => e.id === d().id) + e + i.length) % i.length;
    b(i[t].id);
  }
  function T(e) {
    const t = e.target.closest("[data-story-id]");
    t && b(t.dataset.storyId);
  }
  function k() {
    const line = o.activeLine, playAll = o.playAll, restart = o.playing && !o.paused;
    o.rate = 0.78 === o.rate ? 0.95 : 0.78;
    u();
    if (restart) B(line, playAll);
    else if (o.paused) C();
    v();
  }
  function q() {
    ((o.showKorean = !o.showKorean), u(), v());
  }
  function I(e) {
    const t = new SpeechSynthesisUtterance(e);
    ((t.lang = "en-US"), (t.rate = o.rate), (t.pitch = 1.06), (t.volume = 1));
    const n = (function () {
      const e = (window.speechSynthesis?.getVoices?.() || []).filter((e) =>
        /^en(-|_)/i.test(e.lang),
      );
      return (
        e.find((e) =>
          /Samantha|Ava|Karen|Daniel|Google US English|Microsoft Aria/i.test(
            e.name,
          ),
        ) ||
        e[0] ||
        null
      );
    })();
    return (n && (t.voice = n), t);
  }
  function nextListeningLine() {
    if (o.readFromHere) return o.readerLine;
    const saved = progress();
    return saved < d().lines.length ? saved : 0;
  }
  function E() {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      s("이 브라우저에서는 음성 읽기를 지원하지 않아요");
      return;
    }
    if (!o.playing) {
      B(nextListeningLine());
      return;
    }
    if (o.paused) window.speechSynthesis.resume();
    else window.speechSynthesis.pause();
    o.paused = !o.paused;
    x();
    $();
  }
  function B(e, playAll = !0) {
    if (!window.speechSynthesis || "undefined" === typeof SpeechSynthesisUtterance) {
      s("이 브라우저에서는 음성 읽기를 지원하지 않아요");
      return;
    }
    if (!Number.isInteger(e) || !d().lines[e]) return;
    window.FAMILY_LULLABY?.stop();
    C(!1);
    const t = d(),
      n = ++o.playToken;
    ((o.playing = !0), (o.paused = !1), (o.playAll = playAll));
    o.readFromHere = false;
    const i = (e) => {
      if (n !== o.playToken) return;
      if (e >= t.lines.length)
        return (
          (o.playing = !1),
          (o.paused = !1),
          (o.activeLine = -1),
          x(),
          $(),
          g(t.id, !0),
          void s("동화를 끝까지 들었어요 🌙")
        );
      o.activeLine = e;
      o.readerLine = e;
      o.progress[t.id] = e;
      u();
      renderSentence();
      $();
      const a = I(t.lines[e][0]);
      ((a.onend = () => {
          if (n !== o.playToken || o.activeLine !== e) return;
          o.progress[t.id] = e + 1;
          u();
          if (playAll || e + 1 === t.lines.length) i(e + 1);
          else {
            o.playing = !1;
            o.paused = !1;
            o.activeLine = -1;
            x(); $();
          }
        }),
        (a.onerror = () => {
          if (n !== o.playToken || o.activeLine !== e) return;
          C();
          s("음성 재생이 멈췄어요. 이어 듣기를 눌러 다시 시도해 주세요.");
        }),
        window.speechSynthesis.speak(a));
    };
    (x(), i(e));
  }
  function C(e = !0) {
    ((o.playToken += 1),
      window.speechSynthesis && window.speechSynthesis.cancel(),
      (o.playing = !1),
      (o.paused = !1),
      e && (o.activeLine = -1),
      x(),
      $());
  }
  function x() {
    const button = document.querySelector("#englishPlayButton");
    if (!button) return;
    let label = "동화 듣기";
    if (o.playing) label = o.paused ? "계속 듣기" : "잠시 멈춤";
    else if (o.readFromHere) label = "여기서 듣기";
    else if (progress() === d().lines.length) label = "다시 듣기";
    else if (Object.hasOwn(o.progress, d().id)) label = "이어 듣기";
    button.querySelector("strong").textContent = label;
    button.querySelector("span").textContent = o.playing && !o.paused ? "Ⅱ" : "▶";
  }
  function $() {
    const e = d(),
      completed = progress(),
      t = (completed / e.lines.length) * 100,
      n = document.querySelector("#englishProgressBar");
    n && (n.style.width = `${t}%`);
    const status = !o.readFromHere && completed === e.lines.length ? `${completed} / ${e.lines.length}문장 완료`
      : o.playing ? `${o.activeLine + 1} / ${e.lines.length}번째 문장 · ${o.paused ? "잠시 멈춤" : "재생 중"}`
        : `${completed} / ${e.lines.length}문장 완료 · ${nextListeningLine() + 1}번째 문장부터 듣기`;
    const bar = document.querySelector("#englishProgress");
    bar?.setAttribute("aria-valuemax", e.lines.length);
    bar?.setAttribute("aria-valuenow", completed);
    bar?.setAttribute("aria-valuetext", status);
    const label = document.querySelector("#englishProgressStatus");
    if (label) label.textContent = status;
  }
  function A() {
    o.storageOwner = a()?.session?.user?.id || "device";
    o.showKorean = !0;
    o.rate = 0.78;
    o.progress = {};
    try {
      const e = JSON.parse(localStorage.getItem(j()) || "{}");
      for (const story of i) {
        const line = e?.progress?.[story.id];
        if (Number.isInteger(line) && line >= 0 && line <= story.lines.length)
          o.progress[story.id] = line;
      }
      ((o.showKorean = !1 !== e.showKorean),
        (o.rate = 0.95 === e.rate ? 0.95 : 0.78),
        (o.selectedId = i.some((t) => t.id === e.selectedId)
          ? e.selectedId
          : l().id));
    } catch {
      o.selectedId = l().id;
    }
    resetReader();
  }
  (A(),
    (function () {
      const t = document.querySelector(".view-tabs"),
        n = document.querySelector("main");
      if (!t || !n || document.querySelector("#englishView")) return;
      const o = document.querySelector('[data-view="english"]') || document.createElement("button");
      ((o.className = "view-tab english-view-tab"),
        (o.dataset.view = e),
        (o.type = "button"),
        (o.innerHTML = '<span aria-hidden="true">📖</span> 영어동화'),
        t.insertBefore(o, t.querySelector('[data-view="settings"]')));
      const a = document.createElement("div");
      ((a.id = "englishView"),
        (a.className = "storybook-view"),
        (a.hidden = !0),
        (a.innerHTML = `
      <section class="storybook-player" id="englishStoryPlayer" aria-labelledby="englishStoryKoreanTitle">
        <div class="storybook-meta"><span id="englishFeatureLabel"></span><span id="englishStoryTheme"></span></div>
        <div class="storybook-cover"><img id="englishCoverImage" alt=""><span id="englishCoverFallback" aria-hidden="true" hidden></span></div>
        <div class="storybook-titles"><h2 id="englishStoryKoreanTitle" tabindex="-1"></h2><p id="englishStoryTitle" lang="en"></p></div>
        <button class="storybook-play" id="englishPlayButton" type="button"><span aria-hidden="true">▶</span><strong>동화 듣기</strong></button>

        <section class="storybook-reader" aria-labelledby="englishReadHeading">
          <div class="storybook-reader-head">
            <h3 id="englishReadHeading">한 문장씩 읽기</h3>
            <div class="storybook-turns">
              <span id="englishLinePosition"></span>
              <button type="button" id="englishPrevLine" aria-label="이전 문장">${storyIcon("previous")}</button>
              <button type="button" id="englishNextLine" aria-label="다음 문장">${storyIcon("next")}</button>
            </div>
          </div>
          <div id="englishSentenceList" class="storybook-sentence" aria-live="polite" aria-atomic="true"><p id="englishLineEnglish" lang="en"></p><p id="englishLineKorean"></p></div>
        </section>

        <details id="englishLibrarySection" class="storybook-shelf">
          <summary>${storyIcon("shelf")}<span>다른 동화 고르기</span>${storyIcon("next")}</summary>
          <div id="englishLibrary" class="storybook-library"></div>
        </details>
        <details id="englishStorySettings" class="storybook-settings">
          <summary>${storyIcon("settings")}<span>읽기 설정</span>${storyIcon("next")}</summary>
          <div class="storybook-tools">
            <p id="englishStorySummary"></p>
            <div class="storybook-tool-buttons">
              <button id="englishPlayLine" type="button">이 문장 듣기</button>
              <button id="englishRestartButton" type="button">처음부터 듣기</button>
              <button id="englishSpeedButton" type="button" aria-label="천천히 읽기"><strong>천천히</strong></button>
              <button id="englishTranslationButton" type="button" aria-label="한글 뜻 표시"><strong>뜻 숨기기</strong></button>
            </div>
            <div id="englishNameSettings"></div>
            <div class="storybook-progress-wrap">
              <p id="englishProgressStatus" role="status" aria-live="polite" aria-atomic="true"></p>
              <div class="storybook-progress" id="englishProgress" role="progressbar" aria-label="동화 문장 진행" aria-valuemin="0"><i id="englishProgressBar"></i></div>
            </div>
            <div class="storybook-tool-buttons">
              <button type="button" id="englishMarkRead">오늘 들었어요</button>
              <button type="button" id="englishOpenToday">오늘의 동화 보기</button>
              <button type="button" id="englishPrevStory">이전 동화</button>
              <button type="button" id="englishNextStory">다음 동화</button>
            </div>
            <div class="storybook-lullaby">
              <label for="lullabyTrack">자장가</label><select id="lullabyTrack" aria-label="자장가 소리 선택"></select>
              <button type="button" id="lullabyToggle" aria-expanded="false" aria-controls="lullabyPanel">자장가 재생</button>
              <div id="lullabyPanel" hidden><span id="lullabyPlayerSlot"></span><p id="lullabyStatus" role="status"></p></div>
            </div>
          </div>
        </details>
      </section>`),
        n.appendChild(a));
    })(),
    m(),
    document
      .querySelector('[data-view="english"]')
      ?.addEventListener("click", () => switchView(e)),
    document
      .querySelector("#englishOpenToday")
      ?.addEventListener("click", () => b(l().id)),
    window.FAMILY_LULLABY?.attach(),
    window.addEventListener("family:lullaby-start", () => C()),
    document.querySelector("#lullabyToggle")?.addEventListener("click", () => window.FAMILY_LULLABY?.toggle()),
    document.querySelector("#lullabyTrack")?.addEventListener("change", event => window.FAMILY_LULLABY?.select(event.target.value)),
    document.querySelector("#englishPlayButton")?.addEventListener("click", E),
    document.querySelector("#englishRestartButton")?.addEventListener("click", () => B(0)),
    document.querySelector("#englishSpeedButton")?.addEventListener("click", k),
    document
      .querySelector("#englishTranslationButton")
      ?.addEventListener("click", q),
    document.querySelector("#englishPrevLine")?.addEventListener("click", () => turnPage(-1)),
    document.querySelector("#englishNextLine")?.addEventListener("click", () => turnPage(1)),
    document.querySelector("#englishPlayLine")?.addEventListener("click", () => B(o.readerLine, false)),
    document.querySelector("#englishCoverImage")?.addEventListener("error", event => {
      event.currentTarget.hidden = true;
      document.querySelector("#englishCoverFallback").hidden = false;
    }),
    document.querySelector("#englishLibrary")?.addEventListener("click", T),
    document
      .querySelector("#englishPrevStory")
      ?.addEventListener("click", () => f(-1)),
    document
      .querySelector("#englishNextStory")
      ?.addEventListener("click", () => f(1)),
    document
      .querySelector("#englishMarkRead")
      ?.addEventListener("click", () => g(d().id)),
    p(),
    (function n(i = 0) {
      m();
      const o = a();
      if (o?.authReady || i > 40) {
        return void (
          (() => {
            try {
              return localStorage.getItem(ACTIVE_VIEW_KEY);
            } catch {
              return null;
            }
          })() === e &&
          !window.FAMILY_DEFERRED_MODULES &&
          "function" == typeof switchView &&
          switchView(e)
        );
      }
      setTimeout(() => n(i + 1), 100);
    })(),
    window.addEventListener("familycontextchange", () => {
      C();
      A();
      p();
    }),
    window.addEventListener("beforeunload", () => C()));
})();
