export const validEmail = "user@example.com";
export const validPassword = "StrongP@ss1";
export const validDisplayName = "Juan Dela Cruz";
export const validUserId = "00000000-0000-0000-0000-000000000001";
export const validAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid-token";
export const validRefreshToken = "refresh-token-abc-123";

export const validDateOfBirth = "1996-06-15";
export const tooYoungDateOfBirth = new Date(
  Date.now() - 19 * 365 * 24 * 60 * 60 * 1000,
)
  .toISOString()
  .slice(0, 10);
export const tooOldDateOfBirth = new Date(
  Date.now() - 41 * 365 * 24 * 60 * 60 * 1000,
)
  .toISOString()
  .slice(0, 10);

export function authHeader(token = validAccessToken) {
  return { authorization: `Bearer ${token}` };
}

export function validRegisterPayload(
  overrides: Record<string, unknown> = {},
) {
  return {
    payload: {
      email: validEmail,
      password: validPassword,
      ...overrides,
    },
  };
}

export function validSessionPayload() {
  return {
    payload: {
      refresh_token: validRefreshToken,
    },
  };
}

export function validLoginPayload() {
  return {
    payload: {
      email: validEmail,
      password: validPassword,
    },
  };
}

export function validPasswordResetPayload() {
  return {
    payload: {
      email: validEmail,
    },
  };
}

export function validPasswordUpdatePayload(
  overrides: Record<string, unknown> = {},
) {
  return {
    payload: {
      password: "NewStr0ng!Pass",
      refresh_token: validRefreshToken,
      ...overrides,
    },
  };
}

export function validUpdateMePayload() {
  return {
    payload: {
      display_name: "Juan Updated",
      metro_manila_city: "Makati",
    },
  };
}
