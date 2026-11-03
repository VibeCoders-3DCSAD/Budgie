import { useEffect, useRef, useState } from "react";
import type { SeasonalPreferences } from "@odin/spending-insights/seasons";
import { getSnapshot, upsertSnapshot } from "../../../local-db/repositories/dashboard/dashboardSnapshots";
import { saveForecastSnapshot } from "../../../local-db/repositories/forecast/forecastSnapshots";
import { listMonthlySpending, listQuarterlySpending, pastQuarters, recentMonths, type MonthSpending, type QuarterSpending } from "../../../local-db/repositories/forecast/forecastTransactions";
import { useConnectivityStore } from "../../../services/connectivity";
import { getQuarterlyForecastContent } from "../../dashboard/dashboardSnapshotContent";
import { getPreferences } from "../../governance/api";
import { requestForecastInterpretation } from "../api";
import { manilaToday } from "../../../lib/dates";
import { forecastInterpretation } from "../QuarterlyForecastCharts";
import { fetchSpendingForecast } from "../fetchSpendingForecast";
import type { QuarterlyForecastPayload } from "../types";

const HISTORY_QUARTERS = 6;
// Six completed months for the monthly chart, and this month so far for Forecast vs Actual.
const HISTORY_MONTHS = 7;

export function useQuarterlySpendingForecast(userId: string, accessToken: string, refreshKey: number) {
  const [forecast, setForecast] = useState<QuarterlyForecastPayload | null>(null);
  const [history, setHistory] = useState<QuarterSpending[]>([]);
  const [monthHistory, setMonthHistory] = useState<MonthSpending[]>([]);
  const [refreshing, setRefreshing] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<SeasonalPreferences | null>(null);
  const hasForecast = useRef(false);
  const online = useConnectivityStore((state) => state.online);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setRefreshing(true);
    setError(null);
    setNotice(null);

    // Actual history can arrive later without delaying the saved forecast or its refresh.
    void listQuarterlySpending(userId, pastQuarters(HISTORY_QUARTERS)).then((actual) => {
      if (signal.aborted) return;
      const firstRecorded = actual.findIndex((quarter) => quarter.totalCentavos > 0);
      setHistory(firstRecorded === -1 ? [] : actual.slice(firstRecorded));
    }).catch(() => {});
    void listMonthlySpending(userId, recentMonths(HISTORY_MONTHS)).then((actual) => {
      if (signal.aborted) return;
      const firstRecorded = actual.findIndex((month) => month.totalCentavos > 0);
      setMonthHistory(firstRecorded === -1 ? [] : actual.slice(firstRecorded));
    }).catch(() => {});
    // The seasons the user picked in onboarding; without them the forecast simply leaves out the seasons note.
    if (online) {
      void getPreferences(accessToken).then(({ response, body }) => {
        if (!signal.aborted && response.ok) setPreferences(body.payload?.preferences ?? null);
      }).catch(() => {});
    }

    async function revalidate() {
      try {
        const result = await fetchSpendingForecast(userId, accessToken, { signal });
        if (signal.aborted) return;
        if ("notice" in result) {
          setNotice(result.notice);
          return;
        }
        const { payload } = result;
        await upsertSnapshot(userId, "forecast_quarterly", payload);
        // A failed history save must not hide the fresh forecast.
        await saveForecastSnapshot(userId, manilaToday().slice(0, 7), payload).catch(() => {});
        if (signal.aborted) return;
        setForecast(payload);
        setStale(false);
        setRefreshing(false);
        hasForecast.current = true;

        const notes = forecastInterpretation(payload);
        if (notes.length === 0) return;
        // Updated numbers and the app's notes are ready before optional rewritten wording.
        const interpretation = await requestForecastInterpretation(accessToken, notes, signal).catch(() => null);
        if (signal.aborted) return;
        const rewritten = interpretation?.response.ok ? interpretation.body.payload?.notes : undefined;
        if (rewritten?.length === notes.length) {
          const interpreted = { ...payload, interpretation: rewritten };
          await upsertSnapshot(userId, "forecast_quarterly", interpreted);
          if (!signal.aborted) setForecast(interpreted);
        }
      } catch {
        if (signal.aborted) return;
        setError(hasForecast.current ? "Forecast update failed. Your last forecast is still available." : "Forecast update failed. Try refreshing again.");
      } finally {
        if (!signal.aborted) setRefreshing(false);
      }
    }

    async function loadCachedForecast() {
      try {
        const saved = await getSnapshot(userId, "forecast_quarterly");
        if (signal.aborted) return;
        const cached = saved?.user_id === userId ? getQuarterlyForecastContent(saved) : null;
        if (cached) {
          setForecast(cached);
          setStale(saved?.stale ?? false);
          hasForecast.current = true;
        }
      } catch {
        // A failed cache read still allows a fresh forecast to be requested.
      }
      if (signal.aborted) return;
      // Offline, the saved forecast stands; reconnecting re-runs this effect to revalidate.
      if (!online) {
        setNotice(hasForecast.current ? "You're offline. Showing your last saved forecast." : "Connect to the internet to get your spending forecast.");
        setRefreshing(false);
        return;
      }
      await revalidate();
    }

    void loadCachedForecast();
    return () => controller.abort();
  }, [userId, accessToken, refreshKey, online]);

  return { forecast, history, monthHistory, preferences, refreshing, stale, error, notice };
}
