// Builds the export file: one CSV with a block per dataset (a title row, a header row, the rows, then a
// blank line), so every dataset lands in one file that spreadsheet apps open directly.

export type ExportSection = { dataset: string; rows: Record<string, unknown>[] };

const CENTAVOS_SUFFIX = "_centavos";
// Spreadsheet apps run a cell that starts with one of these as a formula.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
// Spreadsheets read UTF-8 correctly only with a byte-order mark.
const BYTE_ORDER_MARK = "﻿";

function escapeCell(text: string): string {
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

// Text typed by the user is neutralised so it cannot run as a formula when the file is opened.
function textCell(text: string): string {
  return escapeCell(FORMULA_PREFIX.test(text) ? `'${text}` : text);
}

function centavosCell(value: unknown): string {
  const centavos = Number(value);
  return Number.isFinite(centavos) ? (centavos / 100).toFixed(2) : "";
}

export function formatCell(column: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (column.endsWith(CENTAVOS_SUFFIX)) return centavosCell(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") return textCell(JSON.stringify(value));
  return textCell(String(value));
}

// Amounts are stored in centavos and exported in pesos, so the column says so.
export function formatHeader(column: string): string {
  return column.endsWith(CENTAVOS_SUFFIX) ? `${column.slice(0, -CENTAVOS_SUFFIX.length)}_php` : column;
}

function sectionColumns(rows: Record<string, unknown>[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) for (const column of Object.keys(row)) columns.add(column);
  return [...columns];
}

function sectionLines({ dataset, rows }: ExportSection): string[] {
  const columns = sectionColumns(rows);
  const lines = [textCell(dataset)];
  if (columns.length === 0) return [...lines, "(no records)", ""];
  lines.push(columns.map(formatHeader).join(","));
  for (const row of rows) lines.push(columns.map((column) => formatCell(column, row[column])).join(","));
  lines.push("");
  return lines;
}

export function buildExportCsv(sections: ExportSection[], exportedAt: Date): string {
  const lines = ["Budgie data export", `exported_at,${exportedAt.toISOString()}`, ""];
  for (const section of sections) lines.push(...sectionLines(section));
  return BYTE_ORDER_MARK + lines.join("\r\n");
}

export function exportFileName(exportedAt: Date): string {
  return `budgie-export-${exportedAt.toISOString().slice(0, 10)}.csv`;
}
