import type { SQLiteDatabase } from "expo-sqlite";
import { practiceFetch, startPracticeMode, stopPracticeMode, usePracticeModeStore } from "../practiceMode";

const database = { name: "practice" } as unknown as SQLiteDatabase;

describe("practice mode store", () => {
  afterEach(() => { stopPracticeMode(); });

  it("is inactive until started and hands the database back when stopped", () => {
    expect(usePracticeModeStore.getState()).toMatchObject({ active: false, database: null });
    startPracticeMode(database, jest.fn());
    expect(usePracticeModeStore.getState()).toMatchObject({ active: true, database });
    expect(stopPracticeMode()).toBe(database);
    expect(usePracticeModeStore.getState()).toMatchObject({ active: false, database: null, respond: null });
    expect(stopPracticeMode()).toBeNull();
  });

  it("answers requests from the responder while active", async () => {
    const reply = { status: 200 } as Response;
    const respond = jest.fn().mockResolvedValue(reply);
    startPracticeMode(database, respond);
    await expect(practiceFetch("https://odin.test/x", { method: "POST" })).resolves.toBe(reply);
    expect(respond).toHaveBeenCalledWith("https://odin.test/x", { method: "POST" });
  });

  it("refuses to answer when inactive", () => {
    expect(() => practiceFetch("https://odin.test/x", {})).toThrow("Practice Mode is not active.");
  });

  it("notifies subscribers when Practice Mode starts and stops", () => {
    const listener = jest.fn();
    const unsubscribe = usePracticeModeStore.subscribe((state) => listener(state.active));
    startPracticeMode(database, jest.fn());
    stopPracticeMode();
    unsubscribe();
    expect(listener.mock.calls).toEqual([[true], [false]]);
  });
});
