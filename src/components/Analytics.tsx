"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { Asset } from "@/lib/types";

interface Props {
  items: Asset[];
}

const CHART_COL = "#2f6fed";
const HEAT = ["#e8eef8", "#c5d9f7", "#9bbcf3", "#6a9aed", "#2f6fed", "#1d4cb8"];

export function Analytics({ items }: Props) {
  const stats = useMemo(() => {
    const totalPhotos = items.filter((a) => a.type === "photo").length;
    const totalBytes = items.reduce((s, a) => s + (a.files?.size ?? 0), 0);
    const mb = totalBytes / (1024 * 1024);

    const perYear = new Map<number, number>();
    const perMonthCurYear = new Map<number, number>();
    const now = new Date();
    const curY = now.getFullYear();
    for (let m = 0; m < 12; m += 1) perMonthCurYear.set(m, 0);

    const locCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    const monthActivityAllYears = new Map<number, number>();
    for (let m = 0; m < 12; m += 1) monthActivityAllYears.set(m, 0);

    for (const a of items) {
      const d = new Date(a.takenAt);
      if (!Number.isNaN(d.getTime())) {
        const y = d.getFullYear();
        perYear.set(y, (perYear.get(y) ?? 0) + 1);
        if (y === curY) {
          perMonthCurYear.set(d.getMonth(), (perMonthCurYear.get(d.getMonth()) ?? 0) + 1);
        }
        const mo = d.getMonth();
        monthActivityAllYears.set(mo, (monthActivityAllYears.get(mo) ?? 0) + 1);
      }
      if (a.location?.city && a.location?.country) {
        const label = `${a.location.city}, ${a.location.country}`;
        locCounts.set(label, (locCounts.get(label) ?? 0) + 1);
      }
      for (const t of a.tags ?? []) {
        const k = t.toLowerCase();
        tagCounts.set(k, (tagCounts.get(k) ?? 0) + 1);
      }
    }

    const yearData = [...perYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, count]) => ({ year: String(year), count }));
    const monthLabels = ["Gen", "Feb", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Des"];
    const monthLine = monthLabels.map((name, i) => ({ name, count: perMonthCurYear.get(i) ?? 0 }));
    const heatCounts = monthLabels.map((name, i) => ({
      name,
      count: monthActivityAllYears.get(i) ?? 0
    }));
    const topLoc = [...locCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

    let peakVal = 0;
    for (const v of monthActivityAllYears.values()) {
      if (v > peakVal) peakVal = v;
    }
    let peakMonth = 0;
    if (peakVal > 0) {
      for (let m = 0; m < 12; m += 1) {
        if ((monthActivityAllYears.get(m) ?? 0) === peakVal) {
          peakMonth = m;
          break;
        }
      }
    }

    return {
      totalPhotos,
      mb,
      yearData,
      monthLine,
      heatCounts,
      topLoc,
      topTags,
      peakMonth,
      peakVal,
      monthLabels
    };
  }, [items]);

  const heatColor = (count: number): string => {
    if (stats.peakVal <= 0) return HEAT[0];
    const r = count / stats.peakVal;
    const idx = Math.min(HEAT.length - 1, Math.floor(r * HEAT.length));
    return HEAT[idx];
  };

  return (
    <div className="analytics-container">
      <section className="analytics-summary">
        <div className="analytics-stat-card">
          <h3>Fotos totals</h3>
          <p className="analytics-stat-value">{stats.totalPhotos}</p>
        </div>
        <div className="analytics-stat-card">
          <h3>Emmagatzematge (aprox.)</h3>
          <p className="analytics-stat-value">{stats.mb < 0.01 ? "0" : stats.mb.toFixed(2)} MB</p>
        </div>
        <div className="analytics-stat-card">
          <h3>Mes més actiu</h3>
          <p className="analytics-stat-value">
            {stats.peakVal > 0 ? `${stats.monthLabels[stats.peakMonth]} · ${stats.peakVal} foto(s)` : "—"}
          </p>
        </div>
      </section>

      <div className="analytics-charts">
        <section className="analytics-panel">
          <h3>Fotos per any</h3>
          {stats.yearData.length ? (
            <div className="analytics-chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.yearData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ebedf0" />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={36} />
                  <Tooltip />
                  <Bar dataKey="count" fill={CHART_COL} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="modal-muted">Sense dades per any.</p>
          )}
        </section>

        <section className="analytics-panel">
          <h3>Fotos per mes ({new Date().getFullYear()})</h3>
          {stats.monthLine.some((x) => x.count > 0) ? (
            <div className="analytics-chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={stats.monthLine} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ebedf0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={36} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke={CHART_COL} strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="modal-muted">Sense fotos aquest any.</p>
          )}
        </section>
      </div>

      <section className="analytics-panel">
        <h3>Mapa de calor per mes (totes les dates)</h3>
        {items.length ? (
          <div className="analytics-heatmap">
            {stats.heatCounts.map((cell) => (
              <div key={cell.name} className="analytics-heatmap-cell" style={{ background: heatColor(cell.count) }} title={`${cell.name}: ${cell.count}`}>
                <span className="analytics-heatmap-label">{cell.name}</span>
                <span className="analytics-heatmap-count">{cell.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="modal-muted">Sense fotos.</p>
        )}
      </section>

      <div className="analytics-lists">
        <section className="analytics-panel">
          <h3>Top ubicacions</h3>
          {stats.topLoc.length ? (
            <ul className="analytics-list">
              {stats.topLoc.map(([label, count]) => (
                <li key={label}>
                  <span>{label}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="modal-muted">Sense dades GPS / ubicació.</p>
          )}
        </section>
        <section className="analytics-panel">
          <h3>Top tags</h3>
          {stats.topTags.length ? (
            <ul className="analytics-list">
              {stats.topTags.map(([tag, count]) => (
                <li key={tag}>
                  <span>#{tag}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="modal-muted">Sense tags.</p>
          )}
        </section>
      </div>
    </div>
  );
}
