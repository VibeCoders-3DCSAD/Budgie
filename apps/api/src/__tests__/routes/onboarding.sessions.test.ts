import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("../../lib/supabase.js", () => {
  const mockClient = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
    rpc: jest.fn(),
  };

  return {
    supabase: mockClient,
    createAnonAuthClient: () => mockClient,
    createAuthenticatedSupabaseClient: () => mockClient,
  };
});

import app from "../../app.js";
import { supabase } from "../../lib/supabase.js";
import { createMockQuery } from "../helpers/supabase.js";
import type { MockQueryResult } from "../helpers/supabase.js";
import {
  validUserId,
  authHeader,
} from "../helpers/fixtures.js";

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

function mockAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: validUserId } },
    error: null,
  });
}

const basePath = "/odin/api/onboarding";

describe("POST /odin/api/onboarding/sessions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("saves normalized custom event names and selected months with the owner's session", async () => {
    mockAuth();
    mockRpc.mockReturnValue(createMockQuery({ data: { id: "session-1" }, error: null }));
    const answers = { custom_seasonal_events: [{ id: "custom_tuition", name: " Tuition   payment ", months: [8, 1] }], high_expense_seasons: ["custom_tuition"] };
    const response = await request(app).post(`${basePath}/sessions`).set(authHeader()).send({ payload: { raw_answers: answers } });
    expect(response.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledWith("create_onboarding_session", expect.objectContaining({ p_raw_answers: { ...answers, custom_seasonal_events: [{ id: "custom_tuition", name: "Tuition payment", months: [1, 8] }] } }));
  });

  it.each([
    { custom_seasonal_events: [{ id: "custom_a", name: "Tuition", months: [] }] },
    { custom_seasonal_events: [{ id: "custom_a", name: "Tuition", months: [13] }] },
    { custom_seasonal_events: [{ id: "custom_a", name: "Tuition", months: [1, 1] }] },
    { custom_seasonal_events: [{ id: "custom_a", name: "<script>", months: [1] }] },
    { custom_seasonal_events: [{ id: "custom_a", name: "Tuition", months: [1], user_id: "other-user" }] },
    { custom_seasonal_events: [{ id: "custom_a", name: "Tuition", months: [1] }, { id: "custom_b", name: " tuition ", months: [8] }] },
    { high_expense_seasons: ["custom_missing"] },
    { monthly_debt_payment_percentage: "101" },
    { monthly_income: "NaN" },
  ])("rejects invalid custom events, references, and amounts: %j", async (answers) => {
    mockAuth();
    const response = await request(app).post(`${basePath}/sessions`).set(authHeader()).send({ payload: { raw_answers: answers } });
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("accepts distinct higher and lower seasons", async () => {
    mockAuth();
    const answers = { high_expense_seasons: ["christmas_ber_months"], low_expense_seasons: ["summer"] };
    mockRpc.mockReturnValue(createMockQuery({ data: { id: "session-1", raw_answers: answers }, error: null }));
    const response = await request(app).post(`${basePath}/sessions`).set(authHeader()).send({ payload: { raw_answers: answers } });
    expect(response.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledWith("create_onboarding_session", expect.objectContaining({ p_raw_answers: answers }));
  });

  it.each([
    { high_expense_seasons: ["summer"], low_expense_seasons: ["summer"] },
    { low_expense_seasons: ["unknown"] },
    { low_expense_seasons: ["none", "summer"] },
  ])("rejects conflicting or invalid seasonal answers: %j", async (answers) => {
    mockAuth();
    const response = await request(app).post(`${basePath}/sessions`).set(authHeader()).send({ payload: { raw_answers: answers } });
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("allows none for both expense directions", async () => {
    mockAuth();
    mockRpc.mockReturnValue(createMockQuery({ data: { id: "session-1" }, error: null }));
    const response = await request(app).post(`${basePath}/sessions`).set(authHeader()).send({ payload: { raw_answers: { high_expense_seasons: ["none"], low_expense_seasons: ["none"] } } });
    expect(response.status).toBe(201);
  });

  it("returns 201 with session when created", async () => {
    mockAuth();

    const newSession = {
      id: "session-1",
      user_id: validUserId,
      status: "in_progress",
      started_at: "2026-07-08T00:00:00Z",
      current_step_key: "welcome",
      raw_answers: { monthly_income: "40000" },
      metadata: {},
    };

    mockRpc.mockReturnValue(createMockQuery({ data: newSession, error: null }));

    const response = await request(app)
      .post(`${basePath}/sessions`)
      .set(authHeader())
      .send({ payload: { raw_answers: { monthly_income: "40000" }, current_step_key: "welcome" } });

    expect(response.status).toBe(201);
    expect(response.body.payload.session).toMatchObject({
      id: "session-1",
      status: "in_progress",
      current_step_key: "welcome",
    });
  });

  it("returns 201 without optional payload fields", async () => {
    mockAuth();

    mockRpc.mockReturnValue(createMockQuery({
      data: {
        id: "session-2",
        user_id: validUserId,
        status: "in_progress",
        current_step_key: null,
        raw_answers: {},
        metadata: {},
      },
      error: null,
    }));

    const response = await request(app)
      .post(`${basePath}/sessions`)
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(201);
  });

  it("returns 400 when raw_answers is an array", async () => {
    mockAuth();

    const response = await request(app)
      .post(`${basePath}/sessions`)
      .set(authHeader())
      .send({ payload: { raw_answers: ["a", "b"] } });

    expect(response.status).toBe(400);
  });

  it("returns 400 when raw_answers contains an unknown question", async () => {
    mockAuth();

    const response = await request(app)
      .post(`${basePath}/sessions`)
      .set(authHeader())
      .send({ payload: { raw_answers: { unsupported: "value" } } });

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each(["display_name", "date_of_birth", "metro_manila_presence", "monthly_deductions"])("returns 400 for the retired %s answer", async (key) => {
    mockAuth();

    const response = await request(app)
      .post(`${basePath}/sessions`)
      .set(authHeader())
      .send({ payload: { raw_answers: { [key]: "x" } } });

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when current_step_key is not a string", async () => {
    mockAuth();

    const response = await request(app)
      .post(`${basePath}/sessions`)
      .set(authHeader())
      .send({ payload: { current_step_key: 123 } });

    expect(response.status).toBe(400);
  });

  it("returns 401 when no authorization header", async () => {
    const response = await request(app)
      .post(`${basePath}/sessions`)
      .send({ payload: {} });

    expect(response.status).toBe(401);
  });

  it("returns 500 when rpc call fails", async () => {
    mockAuth();

    mockRpc.mockReturnValue(createMockQuery({ data: null, error: { message: "DB error" } }));

    const response = await request(app)
      .post(`${basePath}/sessions`)
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(500);
  });

  it("calls rpc with raw_answers and current_step_key", async () => {
    mockAuth();

    mockRpc.mockReturnValue(createMockQuery({
      data: {
        id: "session-3",
        user_id: validUserId,
        status: "in_progress",
        raw_answers: {},
        metadata: {},
      },
      error: null,
    }));

    await request(app)
      .post(`${basePath}/sessions`)
      .set(authHeader())
      .send({ payload: { raw_answers: { monthly_income: "40000" }, current_step_key: "welcome" } });

    expect(mockRpc).toHaveBeenCalledWith("create_onboarding_session", {
      p_raw_answers: { monthly_income: "40000" },
      p_current_step_key: "welcome",
    });
  });
});

describe("PATCH /odin/api/onboarding/sessions/:id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sessionId = "session-1";

  it("resolves custom event selections from the authenticated user's saved session on a partial update", async () => {
    mockAuth();
    const event = { id: "custom_tuition", name: "Tuition payment", months: [1, 8] };
    const existing = { custom_seasonal_events: [event] };
    const update = createMockQuery({ data: { id: sessionId }, error: null });
    mockFrom.mockReturnValueOnce(createMockQuery({ data: { id: sessionId, status: "in_progress", raw_answers: existing }, error: null })).mockReturnValueOnce(update);
    const response = await request(app).patch(`${basePath}/sessions/${sessionId}`).set(authHeader()).send({ payload: { raw_answers: { saving_seasons: [event.id] } } });
    expect(response.status).toBe(200);
    expect(update.update).toHaveBeenCalledWith({ raw_answers: { ...existing, saving_seasons: [event.id] } });
    expect(update.eq).toHaveBeenCalledWith("user_id", validUserId);
  });

  it("rejects conflicts with previously saved higher seasons on partial updates", async () => {
    mockAuth();
    mockFrom.mockReturnValueOnce(createMockQuery({ data: { id: sessionId, status: "in_progress", raw_answers: { high_expense_seasons: ["summer"] } }, error: null }));
    const response = await request(app).patch(`${basePath}/sessions/${sessionId}`).set(authHeader()).send({ payload: { raw_answers: { low_expense_seasons: ["summer"] } } });
    expect(response.status).toBe(400);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("accepts changed higher seasons together with cleared conflicting lower answers", async () => {
    mockAuth();
    const answers = { high_expense_seasons: ["rainy_season"], low_expense_seasons: [] };
    const updateQuery = createMockQuery({ data: { id: sessionId, raw_answers: answers }, error: null });
    mockFrom.mockReturnValueOnce(createMockQuery({ data: { id: sessionId, status: "in_progress", raw_answers: { low_expense_seasons: ["rainy_season"] } }, error: null })).mockReturnValueOnce(updateQuery);
    const response = await request(app).patch(`${basePath}/sessions/${sessionId}`).set(authHeader()).send({ payload: { raw_answers: answers } });
    expect(response.status).toBe(200);
    expect(updateQuery.update).toHaveBeenCalledWith({ raw_answers: answers });
  });

  it("returns 200 with updated session", async () => {
    mockAuth();

    const existingSession = {
      id: sessionId,
      user_id: validUserId,
      status: "in_progress",
      raw_answers: { monthly_income: "40000" },
    };

    const updatedSession = {
      id: sessionId,
      user_id: validUserId,
      status: "in_progress",
      started_at: "2026-07-08T00:00:00Z",
      current_step_key: "income",
      raw_answers: { monthly_income: "40000", emergency_savings_runway: "2_months" },
      metadata: {},
    };

    mockFrom
      .mockReturnValueOnce(createMockQuery({ data: existingSession, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: updatedSession, error: null }));

    const response = await request(app)
      .patch(`${basePath}/sessions/${sessionId}`)
      .set(authHeader())
      .send({ payload: { current_step_key: "income", raw_answers: { monthly_income: "25000" } } });

    expect(response.status).toBe(200);
    expect(response.body.payload.session.current_step_key).toBe("income");
  });

  it("returns 400 when raw_answers is an array", async () => {
    mockAuth();

    const response = await request(app)
      .patch(`${basePath}/sessions/${sessionId}`)
      .set(authHeader())
      .send({ payload: { raw_answers: [] } });

    expect(response.status).toBe(400);
  });

  it("returns 404 when session does not exist", async () => {
    mockAuth();

    mockFrom.mockReturnValueOnce(createMockQuery({ data: null, error: null }));

    const response = await request(app)
      .patch(`${basePath}/sessions/${sessionId}`)
      .set(authHeader())
      .send({ payload: { current_step_key: "income" } });

    expect(response.status).toBe(404);
  });

  it("returns 409 when session is not in_progress", async () => {
    mockAuth();

    const submittedSession = {
      id: sessionId,
      user_id: validUserId,
      status: "submitted",
      raw_answers: {},
    };

    mockFrom.mockReturnValueOnce(createMockQuery({ data: submittedSession, error: null }));

    const response = await request(app)
      .patch(`${basePath}/sessions/${sessionId}`)
      .set(authHeader())
      .send({ payload: { current_step_key: "income" } });

    expect(response.status).toBe(409);
  });

  it("returns 400 when no fields to update", async () => {
    mockAuth();

    const existingSession = {
      id: sessionId,
      user_id: validUserId,
      status: "in_progress",
      raw_answers: {},
    };

    mockFrom.mockReturnValueOnce(createMockQuery({ data: existingSession, error: null }));

    const response = await request(app)
      .patch(`${basePath}/sessions/${sessionId}`)
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(400);
  });

  it("returns 401 when no authorization header", async () => {
    const response = await request(app)
      .patch(`${basePath}/sessions/${sessionId}`)
      .send({ payload: { current_step_key: "income" } });

    expect(response.status).toBe(401);
  });

  it("returns 500 when update fails", async () => {
    mockAuth();

    const existingSession = {
      id: sessionId,
      user_id: validUserId,
      status: "in_progress",
      raw_answers: {},
    };

    mockFrom
      .mockReturnValueOnce(createMockQuery({ data: existingSession, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: null, error: { message: "DB error" } }));

    const response = await request(app)
      .patch(`${basePath}/sessions/${sessionId}`)
      .set(authHeader())
      .send({ payload: { current_step_key: "income" } });

    expect(response.status).toBe(500);
  });
});

describe("GET /odin/api/onboarding/sessions/current", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with in_progress session when it exists", async () => {
    mockAuth();

    const inProgressSession = {
      id: "session-1",
      status: "in_progress",
      started_at: "2026-07-08T00:00:00Z",
      submitted_at: null,
      current_step_key: "welcome",
      raw_answers: {},
    };

    mockFrom.mockReturnValueOnce(createMockQuery({ data: inProgressSession, error: null }));

    const response = await request(app)
      .get(`${basePath}/sessions/current`)
      .set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body.payload.session.status).toBe("in_progress");
  });

  it("returns 200 with submitted session when no in_progress exists", async () => {
    mockAuth();

    const submittedSession = {
      id: "session-2",
      status: "submitted",
      started_at: "2026-07-07T00:00:00Z",
      submitted_at: "2026-07-07T01:00:00Z",
      current_step_key: "done",
      raw_answers: {},
    };

    mockFrom
      .mockReturnValueOnce(createMockQuery({ data: null, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: submittedSession, error: null }));

    const response = await request(app)
      .get(`${basePath}/sessions/current`)
      .set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body.payload.session.status).toBe("submitted");
  });

  it("returns 200 with null when no sessions exist", async () => {
    mockAuth();

    mockFrom
      .mockReturnValueOnce(createMockQuery({ data: null, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: null, error: null }));

    const response = await request(app)
      .get(`${basePath}/sessions/current`)
      .set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body.payload.session).toBeNull();
  });

  it("returns 401 when no authorization header", async () => {
    const response = await request(app).get(`${basePath}/sessions/current`);
    expect(response.status).toBe(401);
  });

  it("returns 500 when in_progress query fails", async () => {
    mockAuth();

    mockFrom.mockReturnValueOnce(createMockQuery({ data: null, error: { message: "DB error" } }));

    const response = await request(app)
      .get(`${basePath}/sessions/current`)
      .set(authHeader());

    expect(response.status).toBe(500);
  });

  it("returns 500 when submitted query fails", async () => {
    mockAuth();

    mockFrom
      .mockReturnValueOnce(createMockQuery({ data: null, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: null, error: { message: "DB error" } }));

    const response = await request(app)
      .get(`${basePath}/sessions/current`)
      .set(authHeader());

    expect(response.status).toBe(500);
  });
});
