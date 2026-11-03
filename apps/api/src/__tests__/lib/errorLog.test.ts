import { loggableError } from "../../lib/errorLog.js";

describe("loggableError", () => {
  it("keeps the code and message of a database error but drops the echoed row", () => {
    const error = { code: "23514", message: "violates check constraint", details: "Failing row contains (user-1, 125000)", hint: "" };
    expect(loggableError(error)).toEqual({ code: "23514", message: "violates check constraint" });
  });

  it("keeps the name and message of a thrown error", () => {
    expect(loggableError(new TypeError("boom"))).toEqual({ name: "TypeError", message: "boom" });
  });

  it("describes a non-object", () => {
    expect(loggableError("offline")).toEqual({ message: "offline" });
  });
});
