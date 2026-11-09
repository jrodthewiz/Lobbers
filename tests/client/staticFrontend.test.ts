import { afterEach, describe, expect, it, vi } from "vitest";
import { compatibleRoomServerOrigin, needsStaticBackendNotice } from "../../client/src/staticFrontend";

const starts = vi.hoisted(() => ({ demolition: vi.fn(), duel: vi.fn(), artillery: vi.fn() }));
vi.mock("../../client/src/game/DemolitionGame", () => ({ DemolitionGame: class { start = starts.demolition; } }));
vi.mock("../../client/src/game/DemolitionDuel", () => ({ DemolitionDuel: class { start = starts.duel; } }));
vi.mock("../../client/src/LobbersApp", () => ({ LobbersApp: class { start = starts.artillery; } }));

type NoticeNode = {
  tag: string; id: string; tabIndex: number; textContent: string; href: string; className: string;
  style: { cssText: string }; attributes: Record<string, string>; children: NoticeNode[]; focus(): void;
  setAttribute(name: string, value: string): void;
  append(...children: NoticeNode[]): void;
  replaceChildren(...children: NoticeNode[]): void;
};
const node = (tag: string): NoticeNode => ({
  tag, id: "", tabIndex: 0, textContent: "", href: "", className: "", style: { cssText: "" },
  attributes: {} as Record<string, string>, children: [] as NoticeNode[], focus: vi.fn(),
  setAttribute(name: string, value: string) { this.attributes[name] = value; },
  append(...children: NoticeNode[]) { this.children.push(...children); },
  replaceChildren(...children: NoticeNode[]) { this.children = children; },
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("static frontend backend guard", () => {
  it("accepts trimmed HTTP(S) root origins and normalizes them for backend requests", () => {
    expect(compatibleRoomServerOrigin("  https://ROOMS.example:443/  ")).toBe("https://rooms.example");
    expect(compatibleRoomServerOrigin("http://localhost:2579")).toBe("http://localhost:2579");
  });

  it("rejects absent, malformed and non-origin backend values", () => {
    for (const origin of [undefined, null, true, "", "  ", "rooms.example", "/api", "https://bad host", "https:rooms.example", "https:///rooms.example", "https://rooms.example/.", "https://rooms.example/path", "https://rooms.example?", "https://rooms.example/#", "https://rooms.example?token=x", "https://name:secret@rooms.example", "ws://rooms.example", "ftp://rooms.example", "https://ro\noms.example", "https:\\rooms.example"]) {
      expect(compatibleRoomServerOrigin(origin), String(origin)).toBeNull();
    }
  });

  it("guards only artillery when the explicit static flag is exactly true", () => {
    expect(needsStaticBackendNotice("artillery", "true", undefined)).toBe(true);
    expect(needsStaticBackendNotice("artillery", "true", "https://rooms.example")).toBe(false);
    for (const flag of [undefined, false, true, "false", "TRUE", "1"]) expect(needsStaticBackendNotice("artillery", flag, undefined)).toBe(false);
    for (const mode of [null, "duel", "demolition", "unknown"]) expect(needsStaticBackendNotice(mode, "true", undefined)).toBe(false);
  });

  it.each([
    { query: "", flag: "true", server: "", expected: "demolition" },
    { query: "?mode=duel", flag: "true", server: "", expected: "duel" },
    { query: "?mode=unknown", flag: "true", server: "", expected: "demolition" },
    { query: "?mode=artillery", flag: "false", server: "", expected: "artillery" },
    { query: "?mode=artillery", flag: "true", server: " https://rooms.example/ ", expected: "artillery" },
    { query: "?mode=artillery", flag: "true", server: "", expected: "notice" },
    { query: "?mode=artillery", flag: "true", server: "https://rooms.example/path", expected: "notice" },
  ])("routes $query with static=$flag to $expected", async ({ query, flag, server, expected }) => {
    vi.resetModules();
    const root = node("div");
    vi.stubGlobal("location", { search: query });
    vi.stubGlobal("document", { querySelector: () => root, createElement: node });
    vi.stubEnv("VITE_STATIC_FRONTEND", flag); vi.stubEnv("VITE_SERVER_URL", server);
    await import("../../client/src/main"); await vi.dynamicImportSettled();
    for (const [mode, start] of Object.entries(starts)) expect(start).toHaveBeenCalledTimes(mode === expected ? 1 : 0);
    if (expected !== "notice") { expect(root.children).toHaveLength(0); return; }
    const main = root.children[0]!, heading = main.children[0]!, explanation = main.children[2]!, modes = main.children[3]!;
    expect(main.tag).toBe("main"); expect(main.attributes["aria-labelledby"]).toBe(heading.id);
    expect(heading.textContent).toContain("needs a room server"); expect(heading.focus).toHaveBeenCalledTimes(1);
    expect(explanation.textContent).toContain("peer invitation/signaling service have not been migrated");
    expect(modes.attributes["aria-label"]).toBe("Available game modes");
    expect(modes.children.map(link => ({ text: link.textContent, href: link.href }))).toEqual([
      { text: "Play Demolition", href: "?mode=demolition" },
      { text: "Local 1v1 (same device)", href: "?mode=duel" },
    ]);
  });
});
