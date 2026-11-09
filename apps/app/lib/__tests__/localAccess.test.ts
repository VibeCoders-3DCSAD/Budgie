import { authorizedFetch, configureTokenResolver } from "../localAccess";
import { startPracticeMode, stopPracticeMode } from "../../services/practiceMode";

describe("authorizedFetch", () => {
  const fetchMock = jest.fn();
  const resolver = jest.fn();
  const response = (status: number) => ({ status }) as Response;
  const sentToken = (call: number) => (fetchMock.mock.calls[call][1].headers as Headers).get("Authorization");

  beforeEach(() => {
    fetchMock.mockReset();
    resolver.mockReset();
    global.fetch = fetchMock;
    configureTokenResolver(resolver);
  });
  afterAll(() => configureTokenResolver(null));

  it("sends the resolved token instead of the stale one", async () => {
    resolver.mockResolvedValue("fresh");
    fetchMock.mockResolvedValue(response(200));
    await authorizedFetch("https://odin.test/x", { headers: { Authorization: "Bearer stale" } });
    expect(resolver).toHaveBeenCalledWith("stale", false);
    expect(sentToken(0)).toBe("Bearer fresh");
  });

  it("refreshes once and retries after a 401", async () => {
    resolver.mockResolvedValueOnce("current").mockResolvedValueOnce("rotated");
    fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200));
    const result = await authorizedFetch("https://odin.test/x", { headers: { Authorization: "Bearer current" } });
    expect(resolver).toHaveBeenLastCalledWith("current", true);
    expect(sentToken(1)).toBe("Bearer rotated");
    expect(result.status).toBe(200);
  });

  it("returns the original 401 when the refresh fails", async () => {
    resolver.mockResolvedValueOnce("current").mockRejectedValueOnce(new Error("offline"));
    fetchMock.mockResolvedValue(response(401));
    expect((await authorizedFetch("https://odin.test/x", { headers: { Authorization: "Bearer current" } })).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes requests without a bearer token straight through", async () => {
    fetchMock.mockResolvedValue(response(200));
    await authorizedFetch("https://odin.test/x");
    expect(resolver).not.toHaveBeenCalled();
  });

  it("answers from the practice responder without reaching the network", async () => {
    const reply = response(200);
    const respond = jest.fn().mockResolvedValue(reply);
    startPracticeMode({} as never, respond);
    try {
      await expect(authorizedFetch("https://odin.test/x", { headers: { Authorization: "Bearer t" } })).resolves.toBe(reply);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(resolver).not.toHaveBeenCalled();
    } finally {
      stopPracticeMode();
    }
  });
});
