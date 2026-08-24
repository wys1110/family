(() => {
  const FUNCTION_NAME = "daily-briefing-push";
  const MUTATIONS = new Set(["insert", "upsert", "update", "delete"]);
  const patchedClients = new WeakSet();
  let notificationDateHandled = false;

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
    if (!context.client || !context.userId || !context.householdId) return;
    if (typeof state === "undefined"
      || state.supabase !== context.client
      || state.household?.id !== context.householdId
      || state.session?.user?.id !== context.userId) return;

    try {
      const { data, error } = await context.client.functions.invoke(FUNCTION_NAME, {
        body: {
          action: "event-change",
          householdId: context.householdId,
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
              householdId: state.household?.id,
              userId: state.session?.user?.id,
              client: state.supabase,
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

  const validNotificationDate = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return "";
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? value : "";
  };

  const clearNotificationDate = (params) => {
    params.delete("eventDate");
    const query = params.toString();
    history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
  };

  const openNotificationDate = () => {
    if (notificationDateHandled) return true;
    const params = new URLSearchParams(location.search);
    if (!params.has("eventDate")) {
      notificationDateHandled = true;
      return true;
    }
    const date = validNotificationDate(params.get("eventDate"));
    if (!date) {
      clearNotificationDate(params);
      notificationDateHandled = true;
      return true;
    }
    if (typeof state === "undefined" || typeof parseDate !== "function" || typeof startOfMonth !== "function" || typeof switchView !== "function") return false;
    state.selectedDate = date;
    state.viewDate = startOfMonth(parseDate(date));
    switchView("calendar");
    clearNotificationDate(params);
    notificationDateHandled = true;
    return true;
  };

  const install = (attempt = 0) => {
    const patched = patchClient();
    const dateReady = openNotificationDate();
    if ((!patched || !dateReady) && attempt < 50) setTimeout(() => install(attempt + 1), 100);
  };

  window.addEventListener("familycontextchange", () => install());
  install();
})();
