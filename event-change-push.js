(() => {
  const FUNCTION_NAME = "daily-briefing-push";
  const MUTATIONS = new Set(["insert", "upsert", "update", "delete"]);
  const patchedClients = new WeakSet();

  const cloneEvents = () => {
    if (typeof state === "undefined" || !Array.isArray(state.events)) return [];
    return state.events.map((event) => ({ ...event }));
  };

  const remoteEvent = (value = {}, fallback = {}) => ({
    id: String(value.id || fallback.id || ""),
    title: String(value.title ?? fallback.title ?? "가족 일정").slice(0, 80),
    date: String(value.event_date || fallback.date || "").slice(0, 10),
    endDate: String(value.event_end_date || fallback.endDate || value.event_date || fallback.date || "").slice(0, 10),
    time: String(value.event_time || fallback.time || "").slice(0, 5),
    member: String(value.member ?? fallback.member ?? "가족").slice(0, 40),
  });

  const eventById = (events, id) => events.find((event) => String(event.id) === String(id)) || {};

  const normalizedChange = (context) => {
    const values = Array.isArray(context.payload) ? context.payload : context.payload ? [context.payload] : [];
    const targetId = context.filters.id || values[0]?.id || "";
    const before = eventById(context.eventsBefore, targetId);

    if (context.operation === "insert") {
      if (values.length > 1) {
        const first = remoteEvent(values[0]);
        return { kind: "bulk-created", count: values.length, ...first };
      }
      return { kind: "created", count: 1, ...remoteEvent(values[0]) };
    }

    if (context.operation === "upsert") {
      const item = remoteEvent(values[0], before);
      return {
        kind: before.id ? "updated" : "created",
        count: 1,
        ...item,
      };
    }

    if (context.operation === "update") {
      const item = remoteEvent({ ...context.payload, id: targetId }, before);
      const moved = Object.prototype.hasOwnProperty.call(context.payload || {}, "event_date")
        || Object.prototype.hasOwnProperty.call(context.payload || {}, "event_end_date");
      return { kind: moved ? "moved" : "updated", count: 1, ...item };
    }

    if (context.operation === "delete") {
      return { kind: "deleted", count: 1, ...remoteEvent({ id: targetId }, before) };
    }

    return null;
  };

  const functionErrorCode = async (error) => {
    const context = error?.context;
    if (context && typeof context.clone === "function" && typeof context.json === "function") {
      try {
        const payload = await context.clone().json();
        if (payload?.error) return String(payload.error);
      } catch { /* JSON 응답이 아니면 기본 오류 사용 */ }
    }
    return String(error?.message || error || "FUNCTION_FAILED");
  };

  const notifyFamily = async (context) => {
    if (context.notified) return;
    context.notified = true;
    const change = normalizedChange(context);
    if (!change?.date) return;
    if (typeof state === "undefined" || !state.supabase || !state.session || !state.household?.id) return;

    try {
      const { data, error } = await state.supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          action: "event-change",
          householdId: state.household.id,
          change,
        },
      });
      if (error) throw new Error(await functionErrorCode(error));
      if (data?.error) throw new Error(data.error);
    } catch (error) {
      console.warn("가족 일정 변경 알림 발송 실패", error);
    }
  };

  const wrapMutationBuilder = (builder, context) => new Proxy(builder, {
    get(target, property, receiver) {
      if (property === "then") {
        return (onFulfilled, onRejected) => target.then((result) => {
          if (!result?.error) setTimeout(() => notifyFamily(context), 0);
          return onFulfilled ? onFulfilled(result) : result;
        }, onRejected);
      }

      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;

      return (...args) => {
        if (property === "eq" && args[0]) context.filters[String(args[0])] = args[1];
        const next = value.apply(target, args);
        if (next && typeof next === "object" && typeof next.then === "function") {
          return wrapMutationBuilder(next, context);
        }
        return next;
      };
    },
  });

  const patchClient = () => {
    if (typeof state === "undefined" || !state.supabase || patchedClients.has(state.supabase)) return false;
    const client = state.supabase;
    const originalFrom = client.from.bind(client);

    client.from = (table) => {
      const builder = originalFrom(table);
      if (table !== "events") return builder;

      return new Proxy(builder, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (!MUTATIONS.has(String(property)) || typeof value !== "function") {
            return typeof value === "function" ? value.bind(target) : value;
          }

          return (...args) => {
            const context = {
              operation: String(property),
              payload: args[0] || null,
              filters: {},
              eventsBefore: cloneEvents(),
              notified: false,
            };
            return wrapMutationBuilder(value.apply(target, args), context);
          };
        },
      });
    };

    patchedClients.add(client);
    return true;
  };

  const updateSettingsCopy = () => {
    const card = document.querySelector("#dailyBriefingSettings");
    if (!card) return false;
    const heading = card.querySelector(".settings-heading h2");
    const description = card.querySelector(".settings-heading div > span");
    if (heading) heading.textContent = "가족 일정 앱 알림";
    if (description) description.textContent = "아침 브리핑과 일정 변경 소식을 가족 기기로 보내요.";
    if (!card.querySelector("#eventChangePushNote")) {
      const note = document.createElement("p");
      note.id = "eventChangePushNote";
      note.className = "daily-briefing-install-note";
      note.innerHTML = "<strong>변경 알림</strong><span>일정 추가·수정·이동·삭제 시 변경한 사람을 제외한 가족에게 즉시 알려줘요.</span>";
      card.querySelector(".daily-briefing-form")?.appendChild(note);
    }
    return true;
  };

  const install = (attempt = 0) => {
    const patched = patchClient();
    const copyReady = updateSettingsCopy();
    if ((!patched || !copyReady) && attempt < 50) setTimeout(() => install(attempt + 1), 100);
  };

  window.addEventListener("familycontextchange", () => install());
  install();
})();