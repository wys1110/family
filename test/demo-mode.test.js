import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const demoScript = readFileSync("demo-mode.js", "utf8");
const app = readFileSync("app.js", "utf8");
const html = readFileSync("index.html", "utf8");
const todoScript = readFileSync("family-todo.js", "utf8");

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
    values,
  };
}

function runDemoMode(url, session = {}, localStore = storage()) {
  const sessionStore = storage(session);
  const navigation = [];
  const location = {
    href: url,
    assign: (target) => navigation.push(["assign", target]),
    replace: (target) => navigation.push(["replace", target]),
    reload: () => navigation.push(["reload"]),
  };
  const window = { location };
  const context = vm.createContext({
    URL,
    window,
    location,
    sessionStorage: sessionStore,
    localStorage: localStore,
  });
  vm.runInContext(demoScript, context);
  return { demo: window.FAMILY_DEMO, sessionStore, localStore, navigation, context };
}

function runDeviceTodos(url, localStore) {
  const mode = runDemoMode(url, {}, localStore);
  Object.assign(mode.context, {
    LOCAL_KEY: "family-todos-v1",
    familyContext: () => null,
    normalizeTodo: (todo) => todo,
    moduleState: { scope: "private", todos: [] },
  });
  const section = (start, end) => todoScript.slice(todoScript.indexOf(start), todoScript.indexOf(end));
  for (const [start, end] of [
    ["  function localKey(", "  async function waitForFamilyContext("],
    ["  function readLocalTodos(", "  function toRemote("],
    ["  function scopedTodos(", "  function renderStats("],
  ]) {
    vm.runInContext(section(start, end), mode.context);
  }
  return {
    ...mode,
    write: (rows) => mode.context.writeLocalTodos(rows),
    privateTodos() {
      mode.context.moduleState.todos = mode.context.readLocalTodos();
      return mode.context.scopedTodos();
    },
  };
}

describe("isolated demo login", () => {
  test("demo=1 starts a session-scoped demo and namespaces app records", () => {
    const { demo, sessionStore } = runDemoMode("https://example.com/family/?demo=1");

    expect(demo.active).toBe(true);
    expect(sessionStore.getItem("family-demo-mode-v1")).toBe("1");
    expect(demo.storageKey("family-calendar-events-v1")).toBe("family-demo-calendar-events-v1");
    expect(demo.storageKey("family-babies-v1")).toBe("family-demo-babies-v1");
  });

  test("normal login keeps production local keys unchanged", () => {
    const { demo } = runDemoMode("https://example.com/family/");

    expect(demo.active).toBe(false);
    expect(demo.storageKey("family-calendar-events-v1")).toBe("family-calendar-events-v1");
  });

  test("demo does not read existing private device todos, and its writes do not reach the normal view", () => {
    const normalRow = { id: "device-private", visibility: "private" };
    const normalValue = JSON.stringify([normalRow]);
    const localStore = storage({ "family-todos-v1": normalValue });
    const sample = runDeviceTodos("https://example.com/family/?demo=1", localStore);
    const normal = runDeviceTodos("https://example.com/family/", localStore);

    expect(sample.privateTodos()).toEqual([]);
    expect(normal.privateTodos()).toEqual([normalRow]);

    const demoRow = { id: "demo-private", visibility: "private" };
    sample.write([demoRow]);
    expect(sample.privateTodos()).toEqual([demoRow]);
    expect(localStore.getItem("family-todos-v1")).toBe(normalValue);
    expect(normal.privateTodos()).toEqual([normalRow]);
  });

  test("resetting demo clears demo todos and preserves the normal device and household todo keys", () => {
    const normalRow = { id: "device-private", visibility: "private" };
    const normalValue = JSON.stringify([normalRow]);
    const accountKey = "family-todos-v1:user-a:home";
    const accountValue = JSON.stringify([{ id: "account-private", visibility: "private" }]);
    const localStore = storage({ [accountKey]: accountValue, "family-todos-v1": normalValue });
    const sample = runDeviceTodos("https://example.com/family/?demo=1", localStore);
    const normal = runDeviceTodos("https://example.com/family/", localStore);

    sample.write([{ id: "demo-private", visibility: "private" }]);
    sample.demo.reset();

    expect(sample.privateTodos()).toEqual([]);
    expect(sample.navigation).toEqual([["reload"]]);
    expect(normal.privateTodos()).toEqual([normalRow]);
    expect(localStore.getItem("family-todos-v1")).toBe(normalValue);
    expect(localStore.getItem(accountKey)).toBe(accountValue);
  });

  test("exit removes only the demo session and query parameter", () => {
    const { demo, sessionStore, navigation } = runDemoMode(
      "https://example.com/family/?demo=1&keep=yes",
      { "family-demo-mode-v1": "1" },
    );

    demo.exit();

    expect(sessionStore.getItem("family-demo-mode-v1")).toBeNull();
    expect(navigation).toEqual([["replace", "https://example.com/family/?keep=yes"]]);
  });

  test("core bypasses Supabase and seeds representative virtual family data", () => {
    expect(app).toContain("if (DEMO_MODE) {");
    expect(app).toContain("} else if (config.supabaseUrl && config.supabaseAnonKey && window.supabase) {");
    expect(app).toContain('id: "demo-qa-household"');
    expect(app).toContain('name: "테스트 가족"');
    expect(app).toContain('const babyId = "demo-baby-dodam"');
    expect(app).toContain('category: "수유·이유식"');
    expect(app).toContain('category: "수면"');
    expect(app).toContain('category: "기저귀"');
    expect(app).toContain('category: "성장"');
  });

  test("login gate and in-app banner expose safe entry and exit controls", () => {
    expect(html).toContain('id="demoLoginButton"');
    expect(html).toContain("가상 데이터만 사용 · 실제 가족 DB와 완전 분리");
    expect(html).toContain('id="demoModeBanner"');
    expect(html).toContain('id="exitDemoModeButton"');
    expect(html).toContain('<script src="demo-mode.js?v=20260727-isolated-v1"></script>');
  });
});
