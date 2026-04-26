/**
 * Открывает новое окно с готовым к печати HTML-отчётом по аналитике.
 * Пользователь выбирает «Сохранить в PDF» в стандартном диалоге печати.
 * Графики рендерятся в SVG, что гарантирует чёткость в PDF.
 */

export interface AnalyticsKpi {
  label: string;
  value: string;
}

export interface AnalyticsTopPost {
  rank: number;
  community: string;
  platform: "vk" | "telegram";
  date: string;
  title: string;
  views: number;
  engagement: number;
  url: string | null;
}

export interface AnalyticsDailyPoint {
  date: string;
  views: number;
  engagement: number;
}

export interface AnalyticsComparisonItem {
  name: string;
  platform: "vk" | "telegram";
  members: number;
  posts: number;
  views: number;
  engagement: number;
}

export interface AnalyticsRow {
  community: string;
  platform: "vk" | "telegram";
  date: string;
  title: string;
  views: number;
  engagement: number;
  url: string | null;
}

export interface AnalyticsReport {
  workspaceName: string;
  platformLabel: string;
  scopeLabel: string;
  periodLabel: string;
  generatedAt: string;
  kpis: AnalyticsKpi[];
  topPosts: AnalyticsTopPost[];
  daily: AnalyticsDailyPoint[];
  comparison: AnalyticsComparisonItem[];
  rows: AnalyticsRow[];
}

const fmtNum = (n: number) =>
  new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(n)));

const fmtDate = (s: string) => {
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const fmtDateShort = (s: string) => {
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

const escapeHtml = (str: string) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const platformBadge = (p: "vk" | "telegram") =>
  p === "vk"
    ? '<span class="badge badge-vk">VK</span>'
    : '<span class="badge badge-tg">TG</span>';

// ====== SVG charts ======

function renderLineChart(points: AnalyticsDailyPoint[]): string {
  if (points.length === 0) {
    return `<div class="empty-chart">Недостаточно данных для построения графика</div>`;
  }
  const W = 720;
  const H = 240;
  const PAD_L = 48;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 36;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const maxViews = Math.max(1, ...points.map((p) => p.views));
  const maxEng = Math.max(1, ...points.map((p) => p.engagement));
  const maxY = Math.max(maxViews, maxEng);

  const xAt = (i: number) =>
    PAD_L + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (v: number) => PAD_T + innerH - (v / maxY) * innerH;

  const buildPath = (key: "views" | "engagement") =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p[key]).toFixed(1)}`)
      .join(" ");

  const buildArea = (key: "views" | "engagement") => {
    const top = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p[key]).toFixed(1)}`)
      .join(" ");
    const baseY = (PAD_T + innerH).toFixed(1);
    const lastX = xAt(points.length - 1).toFixed(1);
    const firstX = xAt(0).toFixed(1);
    return `${top} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  };

  // Y gridlines (5 steps)
  const ySteps = 4;
  const grid: string[] = [];
  for (let i = 0; i <= ySteps; i++) {
    const v = (maxY / ySteps) * i;
    const y = yAt(v);
    grid.push(
      `<line x1="${PAD_L}" x2="${W - PAD_R}" y1="${y}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>` +
        `<text x="${PAD_L - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#94a3b8">${fmtNum(v)}</text>`,
    );
  }

  // X labels (max ~6 evenly)
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const xLabels: string[] = [];
  points.forEach((p, i) => {
    if (i % labelStep === 0 || i === points.length - 1) {
      xLabels.push(
        `<text x="${xAt(i)}" y="${H - PAD_B + 14}" text-anchor="middle" font-size="9" fill="#64748b">${escapeHtml(fmtDateShort(p.date))}</text>`,
      );
    }
  });

  return `
<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="gradViews" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gradEng" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ec4899" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#ec4899" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${grid.join("")}
  <path d="${buildArea("views")}" fill="url(#gradViews)"/>
  <path d="${buildPath("views")}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${buildArea("engagement")}" fill="url(#gradEng)"/>
  <path d="${buildPath("engagement")}" fill="none" stroke="#ec4899" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  ${xLabels.join("")}
</svg>
<div class="legend">
  <span class="legend-dot" style="background:#6366f1"></span> Просмотры
  <span class="legend-dot" style="background:#ec4899; margin-left:14px"></span> Реакции
</div>`;
}

function renderComparisonChart(items: AnalyticsComparisonItem[], metricKey: keyof Pick<AnalyticsComparisonItem, "members" | "views" | "posts" | "engagement">, title: string): string {
  if (items.length === 0) {
    return `<div class="empty-chart">Нет данных для сравнения</div>`;
  }
  const max = Math.max(1, ...items.map((i) => i[metricKey] as number));
  const rows = items
    .slice()
    .sort((a, b) => (b[metricKey] as number) - (a[metricKey] as number))
    .map((it) => {
      const v = it[metricKey] as number;
      const pct = (v / max) * 100;
      const color = it.platform === "vk" ? "#3b82f6" : "#06b6d4";
      return `
      <div class="cmp-row">
        <div class="cmp-name">${platformBadge(it.platform)}<span title="${escapeHtml(it.name)}">${escapeHtml(it.name)}</span></div>
        <div class="cmp-bar-wrap">
          <div class="cmp-bar" style="width:${pct.toFixed(1)}%; background:${color}"></div>
        </div>
        <div class="cmp-val">${fmtNum(v)}</div>
      </div>`;
    })
    .join("");
  return `<div class="cmp-block"><div class="cmp-title">${escapeHtml(title)}</div>${rows}</div>`;
}

export function exportAnalyticsPdf(report: AnalyticsReport) {
  const w = window.open("", "_blank", "width=1024,height=800");
  if (!w) {
    alert("Разрешите всплывающие окна для скачивания PDF");
    return;
  }

  const kpisHtml = report.kpis
    .map(
      (k) => `
      <div class="kpi">
        <div class="kpi-label">${escapeHtml(k.label)}</div>
        <div class="kpi-value">${escapeHtml(k.value)}</div>
      </div>`,
    )
    .join("");

  const topRowsHtml = report.topPosts.length
    ? report.topPosts
        .map(
          (p) => `
        <tr>
          <td class="num">${p.rank}</td>
          <td>${platformBadge(p.platform)} ${escapeHtml(p.community)}</td>
          <td>${escapeHtml(fmtDate(p.date))}</td>
          <td>${
            p.url
              ? `<a href="${escapeHtml(p.url)}">${escapeHtml(p.title)}</a>`
              : escapeHtml(p.title)
          }</td>
          <td class="num">${fmtNum(p.views)}</td>
          <td class="num">${fmtNum(p.engagement)}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="6" class="empty">Нет данных за выбранный период</td></tr>`;

  const dailyChart = renderLineChart(report.daily);

  const allRowsHtml = report.rows.length
    ? report.rows
        .map(
          (p) => `
        <tr>
          <td>${platformBadge(p.platform)} ${escapeHtml(p.community)}</td>
          <td>${escapeHtml(fmtDate(p.date))}</td>
          <td>${
            p.url
              ? `<a href="${escapeHtml(p.url)}">${escapeHtml(p.title)}</a>`
              : escapeHtml(p.title)
          }</td>
          <td class="num">${fmtNum(p.views)}</td>
          <td class="num">${fmtNum(p.engagement)}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" class="empty">Нет данных за выбранный период</td></tr>`;

  const comparisonHtml =
    report.comparison.length >= 2
      ? `
        <div class="cmp-grid">
          ${renderComparisonChart(report.comparison, "members", "Подписчики")}
          ${renderComparisonChart(report.comparison, "views", "Просмотры")}
          ${renderComparisonChart(report.comparison, "posts", "Посты")}
          ${renderComparisonChart(report.comparison, "engagement", "Вовлечённость")}
        </div>`
      : `<div class="empty-chart">Для сравнения нужно минимум 2 сообщества</div>`;

  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Аналитика — ${escapeHtml(report.workspaceName)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    font-size: 11px;
    line-height: 1.45;
  }
  header {
    display: flex; align-items: flex-start; justify-content: space-between;
    border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 16px;
  }
  header h1 { font-size: 20px; margin: 0 0 4px; color: #0f172a; }
  header .meta { font-size: 11px; color: #64748b; }
  header .gen { text-align: right; font-size: 10px; color: #94a3b8; }
  h2 { font-size: 14px; margin: 22px 0 10px; color: #1e293b; border-left: 3px solid #6366f1; padding-left: 8px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #f8fafc; }
  .kpi-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
  .kpi-value { font-size: 18px; font-weight: 700; margin-top: 4px; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead th {
    background: #f1f5f9; text-align: left; font-weight: 600;
    padding: 6px 8px; border-bottom: 1px solid #cbd5e1; color: #334155;
  }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.empty { text-align: center; color: #94a3b8; padding: 20px; }
  a { color: #4f46e5; text-decoration: none; word-break: break-word; }
  .badge {
    display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 6px;
    border-radius: 4px; margin-right: 4px; vertical-align: middle; line-height: 1.4;
  }
  .badge-vk { background: #dbeafe; color: #1d4ed8; }
  .badge-tg { background: #cffafe; color: #0e7490; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; text-align: center; }
  .chart-card {
    border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; background: #fff;
  }
  .legend { font-size: 10px; color: #475569; margin-top: 4px; }
  .legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: middle; margin-right: 4px; }
  .empty-chart { text-align: center; color: #94a3b8; padding: 28px; font-style: italic; }
  .cmp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .cmp-block { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; background: #fff; page-break-inside: avoid; }
  .cmp-title { font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .04em; }
  .cmp-row { display: grid; grid-template-columns: 38% 1fr 60px; align-items: center; gap: 8px; margin: 4px 0; font-size: 10px; }
  .cmp-name { color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cmp-bar-wrap { background: #f1f5f9; border-radius: 6px; height: 10px; overflow: hidden; }
  .cmp-bar { height: 100%; border-radius: 6px; transition: none; min-width: 2px; }
  .cmp-val { text-align: right; font-variant-numeric: tabular-nums; color: #0f172a; font-weight: 600; }
  @media print { a { color: #0f172a; } .no-print { display: none; } .cmp-block, .chart-card, table { page-break-inside: avoid; } }
  .actions { position: fixed; top: 12px; right: 12px; }
  .actions button {
    padding: 8px 14px; border: 0; border-radius: 8px; background: #6366f1; color: #fff;
    font-weight: 600; cursor: pointer; font-size: 12px; box-shadow: 0 2px 8px rgba(99,102,241,.4);
  }
</style>
</head>
<body>
  <div class="actions no-print">
    <button onclick="window.print()">Скачать PDF</button>
  </div>

  <header>
    <div>
      <h1>${escapeHtml(report.workspaceName)}</h1>
      <div class="meta">
        ${escapeHtml(report.platformLabel)} · ${escapeHtml(report.scopeLabel)} · ${escapeHtml(report.periodLabel)}
      </div>
    </div>
    <div class="gen">Сформировано<br/>${escapeHtml(report.generatedAt)}</div>
  </header>

  <h2>Сводка</h2>
  <div class="kpis">${kpisHtml}</div>

  <h2>Динамика по дням</h2>
  <div class="chart-card">${dailyChart}</div>

  <h2>Сравнение сообществ</h2>
  ${comparisonHtml}

  <h2>Топ-5 постов</h2>
  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Сообщество</th>
        <th>Дата</th>
        <th>Пост</th>
        <th class="num">Просмотры</th>
        <th class="num">Реакции</th>
      </tr>
    </thead>
    <tbody>${topRowsHtml}</tbody>
  </table>

  <h2>Все посты за период (${report.rows.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Сообщество</th>
        <th>Дата</th>
        <th>Пост</th>
        <th class="num">Просмотры</th>
        <th class="num">Реакции</th>
      </tr>
    </thead>
    <tbody>${allRowsHtml}</tbody>
  </table>

  <div class="footer">
    Постер — медиахаб · отчёт по аналитике соцсетей
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 350);
    });
  </script>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}
