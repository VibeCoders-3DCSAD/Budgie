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

  const mockServiceClient = {
    rpc: jest.fn(),
  };

  return {
    supabase: mockClient,
    getServiceRoleClient: () => mockServiceClient,
    createAuthenticatedSupabaseClient: () => mockClient,
  };
});

jest.mock("../../services/financialConditionAssessmentService.js", () => ({
  createOnboardingFinancialConditionAssessment: jest.fn().mockResolvedValue(null),
}));

import app from "../../app.js";
import { supabase, getServiceRoleClient } from "../../lib/supabase.js";
import { createMockQuery } from "../helpers/supabase.js";
import type { MockQueryResult } from "../helpers/supabase.js";
import {
  validUserId,
  authHeader,
} from "../helpers/fixtures.js";
import { ONBOARDING_ERRORS } from "../../lib/constants.js";
import { createOnboardingFinancialConditionAssessment } from "../../services/financialConditionAssessmentService.js";

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockRpc = getServiceRoleClient().rpc as jest.Mock;
const mockCreateOnboardingAssessment = createOnboardingFinancialConditionAssessment as jest.Mock;

const validRawAnswers = {
  questionnaire_version: "2",
  monthly_income: "50000",
  emergency_savings_runway: "2_months",
  monthly_essential_living_costs: "30000",
  paying_off_debt: "false",
  credit_card_revolving_months: "always_before_due",
  high_expense_seasons: ["christmas_ber_months"],
  low_expense_seasons: ["summer"],
  saving_seasons: ["summer"],
};

function mockAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: validUserId } },
    error: null,
  });
}

function mockInProgressSession() {
  mockFrom.mockReturnValueOnce(createMockQuery({
    data: {
      id: "session-1",
      status: "in_progress",
      raw_answers: validRawAnswers,
    },
    error: null,
  }));
}

function mockRpcSuccess(overrides: Record<string, unknown> = {}) {
  mockRpc.mockResolvedValue({ data: { session_id: "session-1", status: "submitted", ...overrides }, error: null });
}

const basePath = "/odin/api/onboarding";

describe("POST /odin/api/onboarding/sessions/:id/submit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateOnboardingAssessment.mockResolvedValue(null);
  });

  const sessionId = "session-1";

  it.each(["no_credit_card", "always_before_due", "1_to_11_months", "over_a_year"])("accepts the consolidated %s credit-card response", async (range) => {
    mockAuth();
    mockRpcSuccess();
    mockFrom.mockReturnValueOnce(createMockQuery({ data: { id: sessionId, status: "in_progress", raw_answers: { ...validRawAnswers, credit_card_revolving_months: range } }, error: null }));
    const response = await request(app).post(`${basePath}/sessions/${sessionId}/submit`).set(authHeader()).send({ payload: { confirm_data_use: true } });
    expect(response.status).toBe(200);
    expect(mockCreateOnboardingAssessment).toHaveBeenCalledWith(validUserId, expect.objectContaining({ credit_card_revolving_months: range }), expect.anything());
  });

  it("requires lower-expense seasons before submitting an in-progress questionnaire", async () => {
    mockAuth();
    const { low_expense_seasons: omitted, ...answers } = validRawAnswers;
    mockFrom.mockReturnValueOnce(createMockQuery({ data: { id: sessionId, status: "in_progress", raw_answers: answers }, error: null }));
    const response = await request(app).post(`${basePath}/sessions/${sessionId}/submit`).set(authHeader()).send({ payload: { confirm_data_use: true } });
    expect(response.status).toBe(400);
    expect(response.body.fields).toContain("low_expense_seasons");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 200 when submission completes without an available assessment", async () => {
    mockAuth();
    mockInProgressSession();
    mockRpcSuccess();

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(200);
    expect(response.body.payload).toEqual({ session: { id: sessionId, status: "submitted" }, classification_available: false, assessment: null });
  });

  it("reports no available assessment when the classifier cannot produce one", async () => {
    mockAuth();
    mockInProgressSession();
    mockRpcSuccess();

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(200);
    expect(response.body.payload.classification_available).toBe(false);
  });

  it("reports an available self-reported assessment", async () => {
    mockAuth();
    mockInProgressSession();
    mockRpcSuccess();
    mockCreateOnboardingAssessment.mockResolvedValueOnce({ id: "assessment-1" });

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(200);
    expect(response.body.payload.classification_available).toBe(true);
    expect(response.body.payload.assessment).toEqual({ id: "assessment-1" });
    expect(mockCreateOnboardingAssessment).toHaveBeenCalledWith(validUserId, expect.objectContaining({ monthly_income: "50000" }), expect.anything());
  });

  it("requires a debt payment percentage when the user is paying off debt", async () => {
    mockAuth();
    mockFrom.mockReturnValueOnce(createMockQuery({
      data: {
        id: sessionId,
        status: "in_progress",
        raw_answers: {
          ...validRawAnswers,
          paying_off_debt: "true",
        },
      },
      error: null,
    }));

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual(["monthly_debt_payment_percentage"]);
  });

  it("returns 400 when confirm_data_use is missing", async () => {
    mockAuth();

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: {} });

    expect(response.status).toBe(400);
  });

  it("returns 400 when confirm_data_use is false", async () => {
    mockAuth();

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: false } });

    expect(response.status).toBe(400);
  });

  it("returns 404 when session does not exist", async () => {
    mockAuth();

    mockFrom.mockReturnValueOnce(createMockQuery({ data: null, error: null }));

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(404);
  });

  it("returns 409 when session is not in_progress", async () => {
    mockAuth();

    mockFrom.mockReturnValueOnce(createMockQuery({
      data: { id: sessionId, status: "submitted" },
      error: null,
    }));

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(409);
  });

  it("returns 404 when session belongs to another user", async () => {
    mockAuth();

    mockFrom.mockReturnValueOnce(createMockQuery({ data: null, error: null }));

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe(ONBOARDING_ERRORS.session_not_found);
  });

  it("returns 401 when no authorization header", async () => {
    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(401);
  });

  it("submits onboarding without a classifier RPC", async () => {
    mockAuth();
    mockInProgressSession();
    mockRpcSuccess();

    await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(mockRpc).toHaveBeenCalledWith("submit_onboarding_session_v2", {
      p_session_id: sessionId,
      p_user_id: validUserId,
    });
  });

  it("returns 500 when session fetch fails", async () => {
    mockAuth();

    mockFrom.mockReturnValueOnce(createMockQuery({
      data: null,
      error: { message: "DB error" },
    }));

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(500);
  });

  it("returns 400 when raw_answers is missing a required field", async () => {
    mockAuth();
    mockFrom.mockReturnValueOnce(createMockQuery({
      data: {
        id: "session-1",
        status: "in_progress",
        raw_answers: Object.fromEntries(Object.entries(validRawAnswers).filter(([key]) => key !== "monthly_income")),
      },
      error: null,
    }));

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("incomplete");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("requires the consolidated credit-card answer", async () => {
    mockAuth();
    mockFrom.mockReturnValueOnce(createMockQuery({
      data: { id: "session-1", status: "in_progress", raw_answers: { ...validRawAnswers, credit_card_revolving_months: "" } },
      error: null,
    }));

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual(["credit_card_revolving_months"]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each(["0", "4", "13"])("rejects the retired numeric revolving-months answer %s", async (months) => {
    mockAuth();
    mockFrom.mockReturnValueOnce(createMockQuery({
      data: { id: "session-1", status: "in_progress", raw_answers: { ...validRawAnswers, credit_card_revolving_months: months } },
      error: null,
    }));

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("accepts zero income without a profile heuristic", async () => {
    mockAuth();
    mockRpcSuccess();
    mockFrom.mockReturnValueOnce(createMockQuery({
      data: {
        id: "session-1",
        status: "in_progress",
        raw_answers: {
          questionnaire_version: "2",
          monthly_income: "0",
          emergency_savings_runway: "not_sure",
          monthly_essential_living_costs: "0",
          paying_off_debt: "false",
          credit_card_revolving_months: "no_credit_card",
          high_expense_seasons: ["none"],
          low_expense_seasons: ["none"],
          saving_seasons: ["none"],
        },
      },
      error: null,
    }));

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("submit_onboarding_session_v2", expect.any(Object));
  });

  it("returns 500 when rpc call fails", async () => {
    mockAuth();
    mockInProgressSession();

    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "RPC error" },
    });

    const response = await request(app)
      .post(`${basePath}/sessions/${sessionId}/submit`)
      .set(authHeader())
      .send({ payload: { confirm_data_use: true } });

    expect(response.status).toBe(500);
  });
});
