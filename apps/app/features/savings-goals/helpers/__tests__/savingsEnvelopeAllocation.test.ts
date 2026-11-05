import { allocateSavingsEnvelope } from "../savingsEnvelopeAllocation";

const goals = [
  { id: "fund", name: "Emergency fund", goalCategory: "emergency_fund", targetDate: "2026-12-01", remainingAmountCentavos: 10_000, requiredCentavos: 3_000, recordedContributionCentavos: 0 },
  { id: "holiday", name: "Holiday", goalCategory: "custom", targetDate: "2026-11-01", remainingAmountCentavos: 2_000, requiredCentavos: 1_000, recordedContributionCentavos: 0 },
  { id: "car", name: "Car", goalCategory: "custom", targetDate: "2026-10-01", remainingAmountCentavos: 8_000, requiredCentavos: 4_000, recordedContributionCentavos: 0 },
];

describe("allocateSavingsEnvelope", () => {
  it("funds the Emergency Fund requirement before other goals", () => {
    const result = allocateSavingsEnvelope(4_000, "avalanche", goals);
    expect(result.proposals[0]).toMatchObject({ id: "fund", proposedTotalCentavos: 3_000, state: "funded", reason: "emergency_fund_required" });
    expect(result.proposals.find((goal) => goal.id === "car")).toMatchObject({ proposedTotalCentavos: 1_000, state: "partially_funded" });
  });

  it("keeps Emergency Fund first for surplus after required contributions", () => {
    const result = allocateSavingsEnvelope(10_000, "snowball", goals);
    expect(result.proposals.find((goal) => goal.id === "fund")?.proposedSurplusCentavos).toBe(2_000);
  });

  it("reports unfunded goals and does not allocate a negative envelope", () => {
    const result = allocateSavingsEnvelope(-1, "avalanche", goals);
    expect(result.envelopeCentavos).toBe(0);
    expect(result.shortfallCentavos).toBe(8_000);
    expect(result.proposals.every((goal) => goal.state === "unfunded")).toBe(true);
  });

  it("reserves scheduled savings-account deposits before allocating goal contributions", () => {
    const result = allocateSavingsEnvelope(6_000, "avalanche", [{ ...goals[0]!, requiredCentavos: 3_000 }], 5_000);

    expect(result).toMatchObject({ requiredCentavos: 8_000, accountRequiredCentavos: 5_000, shortfallCentavos: 2_000 });
    expect(result.proposals[0]).toMatchObject({ proposedTotalCentavos: 1_000, state: "partially_funded" });
  });
});

describe("allocateSavingsEnvelope surplus priority", () => {
  // Every required contribution is already covered, so only surplus is left to place.
  const covered = [
    { id: "car", name: "Car", goalCategory: "custom", targetDate: "2028-06-01", remainingAmountCentavos: 4_000_000, requiredCentavos: 1_000_000, recordedContributionCentavos: 1_000_000 },
    { id: "trip", name: "Trip", goalCategory: "custom", targetDate: "2027-03-01", remainingAmountCentavos: 300_000, requiredCentavos: 100_000, recordedContributionCentavos: 100_000 },
    { id: "phone", name: "Phone", goalCategory: "custom", targetDate: "2026-12-01", remainingAmountCentavos: 750_000, requiredCentavos: 150_000, recordedContributionCentavos: 150_000 },
    { id: "fund", name: "Emergency fund", goalCategory: "emergency_fund", targetDate: "2027-12-01", remainingAmountCentavos: 100_000, requiredCentavos: 200_000, recordedContributionCentavos: 200_000 },
  ];
  const surplusById = (result: ReturnType<typeof allocateSavingsEnvelope>) => Object.fromEntries(result.proposals.map((goal) => [goal.id, goal.proposedSurplusCentavos]));

  it("gives Avalanche surplus to the goal that still needs the most, after the Emergency Fund", () => {
    const result = allocateSavingsEnvelope(1_000_000, "avalanche", covered);
    expect(result.proposals.map((goal) => goal.id)).toEqual(["fund", "car", "phone", "trip"]);
    expect(surplusById(result)).toEqual({ fund: 100_000, car: 900_000, phone: 0, trip: 0 });
    expect(result.proposals[1]).toMatchObject({ reason: "avalanche_surplus", state: "funded" });
  });

  it("gives Snowball surplus to the goal closest to its target, after the Emergency Fund", () => {
    const result = allocateSavingsEnvelope(1_000_000, "snowball", covered);
    expect(result.proposals.map((goal) => goal.id)).toEqual(["fund", "trip", "phone", "car"]);
    expect(surplusById(result)).toEqual({ fund: 100_000, trip: 300_000, phone: 600_000, car: 0 });
    expect(result.proposals[1]?.reason).toBe("snowball_surplus");
  });

  it("still ranks Avalanche by unmet required contribution before remaining amount", () => {
    const result = allocateSavingsEnvelope(0, "avalanche", [
      { id: "big", name: "Big", goalCategory: "custom", targetDate: null, remainingAmountCentavos: 9_000_000, requiredCentavos: 1_000, recordedContributionCentavos: 0 },
      { id: "due", name: "Due", goalCategory: "custom", targetDate: null, remainingAmountCentavos: 50_000, requiredCentavos: 20_000, recordedContributionCentavos: 0 },
    ]);
    expect(result.proposals.map((goal) => goal.id)).toEqual(["due", "big"]);
  });

  it("orders several Emergency Funds by the strategy and gives the same order regardless of input order", () => {
    const funds = [
      { id: "a", name: "Fund A", goalCategory: "emergency_fund", targetDate: null, remainingAmountCentavos: 1_000, requiredCentavos: 0, recordedContributionCentavos: 0 },
      { id: "b", name: "Fund B", goalCategory: "emergency_fund", targetDate: null, remainingAmountCentavos: 5_000, requiredCentavos: 0, recordedContributionCentavos: 0 },
      { id: "c", name: "Other", goalCategory: "custom", targetDate: null, remainingAmountCentavos: 9_000, requiredCentavos: 0, recordedContributionCentavos: 0 },
    ];
    const forward = allocateSavingsEnvelope(1_000, "avalanche", funds).proposals.map((goal) => goal.id);
    const reversed = allocateSavingsEnvelope(1_000, "avalanche", [...funds].reverse()).proposals.map((goal) => goal.id);
    expect(forward).toEqual(["b", "a", "c"]);
    expect(reversed).toEqual(forward);
  });

  it("leaves surplus unallocated once every goal reaches its target", () => {
    const result = allocateSavingsEnvelope(6_000_000, "avalanche", covered);
    expect(result.unallocatedCentavos).toBe(6_000_000 - 100_000 - 4_000_000 - 300_000 - 750_000);
    expect(result.proposals.every((goal) => goal.proposedTotalCentavos === goal.remainingAmountCentavos)).toBe(true);
  });

  it("treats non-finite and fractional amounts as safe whole centavos", () => {
    const result = allocateSavingsEnvelope(Number.NaN, "avalanche", [
      { id: "x", name: "X", goalCategory: "custom", targetDate: null, remainingAmountCentavos: 1_000.9, requiredCentavos: Number.POSITIVE_INFINITY, recordedContributionCentavos: -50 },
    ]);
    expect(result).toMatchObject({ envelopeCentavos: 0, requiredCentavos: 0, unallocatedCentavos: 0 });
    expect(result.proposals[0]).toMatchObject({ remainingAmountCentavos: 1_000, requiredCentavos: 0, recordedContributionCentavos: 0, proposedTotalCentavos: 0 });
    expect(allocateSavingsEnvelope(1_500.7, "snowball", [{ id: "y", name: "Y", goalCategory: "custom", targetDate: null, remainingAmountCentavos: 1_000, requiredCentavos: 400, recordedContributionCentavos: 0 }])).toMatchObject({ envelopeCentavos: 1_500, unallocatedCentavos: 500 });
  });

  it("caps a goal's required contribution at what it still needs to reach its target", () => {
    const result = allocateSavingsEnvelope(0, "avalanche", [{ id: "z", name: "Z", goalCategory: "custom", targetDate: null, remainingAmountCentavos: 1_000, requiredCentavos: 3_000, recordedContributionCentavos: 0 }]);
    expect(result).toMatchObject({ requiredCentavos: 1_000, shortfallCentavos: 1_000 });
  });
});
