import { buildExportCsv, exportFileName, formatCell, formatHeader } from "../csv";

describe("export CSV", () => {
  it("writes amounts in pesos with two decimals under a _php header", () => {
    expect(formatHeader("amount_centavos")).toBe("amount_php");
    expect(formatCell("amount_centavos", 123456)).toBe("1234.56");
    expect(formatCell("amount_centavos", "-50")).toBe("-0.50");
    expect(formatHeader("transaction_date")).toBe("transaction_date");
  });

  it("quotes commas, quotes, and line breaks", () => {
    expect(formatCell("notes", 'Lunch, "Jollibee"')).toBe('"Lunch, ""Jollibee"""');
    expect(formatCell("notes", "line one\nline two")).toBe('"line one\nline two"');
  });

  it("stops typed text from running as a spreadsheet formula", () => {
    expect(formatCell("notes", "=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(formatCell("merchant_name", "+639171234567")).toBe("'+639171234567");
    expect(formatCell("merchant_name", "@home")).toBe("'@home");
  });

  it("leaves numbers and booleans as they are and blanks nulls", () => {
    expect(formatCell("annual_interest_rate_bps", -25)).toBe("-25");
    expect(formatCell("is_active", false)).toBe("false");
    expect(formatCell("notes", null)).toBe("");
  });

  it("writes one titled block per dataset, with a placeholder for empty ones", () => {
    const csv = buildExportCsv(
      [
        { dataset: "transactions", rows: [{ id: "t1", amount_centavos: 100, notes: null }] },
        { dataset: "debts", rows: [] },
      ],
      new Date("2026-11-04T08:00:00Z"),
    );

    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Budgie data export",
      "exported_at,2026-11-04T08:00:00.000Z",
      "",
      "transactions",
      "id,amount_php,notes",
      "t1,1.00,",
      "",
      "debts",
      "(no records)",
      "",
    ]);
  });

  it("names the file after the export date", () => {
    expect(exportFileName(new Date("2026-11-04T08:00:00Z"))).toBe("budgie-export-2026-11-04.csv");
  });
});
