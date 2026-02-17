(function () {
  const root = document.getElementById('economic-dashboard-root-page');
  if (!root) return;

  const hasChart = typeof Chart !== 'undefined';
  const economicDateSelect = document.getElementById('economic-date');
  const trendAnalysisMetricSelect = document.getElementById('trend-analysis-metric');
  const trendStartDateSelect = document.getElementById('economic-chart-start-date');
  const trendEndDateSelect = document.getElementById('economic-chart-end-date');
  const economicAsOfNote = document.getElementById('kpi-economic-asof-note');

  const kpi = {
    gdpLatest: document.getElementById('kpi-gdp-latest'),
    gdpQoq: document.getElementById('kpi-gdp-qoq'),
    gdpYoy: document.getElementById('kpi-gdp-yoy'),
  };

  const trendMetricConfig = {
    gdp_growth: { label: 'GDP Trend', key: 'gdp_growth', type: 'percent' },
    unemployment_rate: { label: 'Unemployment Rate', key: 'unemployment_rate', type: 'percent' },
    fed_funds_rate: { label: 'Fed Funds Rate', key: 'fed_funds_rate', type: 'percent' },
  };

  let gdpTrendChart;
  let dashboardPayload = null;

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeDateKey(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  function formatPercent(value, digits = 2) {
    const num = toNumber(value);
    return num === null ? 'N/A' : `${num.toFixed(digits)}%`;
  }

  function formatDate(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function getEconomicDateKey(point) {
    return normalizeDateKey(point?.quarter_end_date || point?.date);
  }

  function populateDateSelect(selectEl, options, preferredValue, fallback = 'last') {
    if (!selectEl || !Array.isArray(options) || !options.length) {
      if (selectEl) selectEl.innerHTML = '';
      return;
    }

    const current = normalizeDateKey(preferredValue);
    const nextValue = options.includes(current)
      ? current
      : (fallback === 'first' ? options[0] : options[options.length - 1]);

    selectEl.innerHTML = options
      .map((dateKey) => `<option value="${dateKey}">${formatDate(dateKey)}</option>`)
      .join('');

    if (nextValue) {
      selectEl.value = nextValue;
    }
  }

  function hydrateEconomicDateControls(payload) {
    const gdpSeries = Array.isArray(payload?.gdpSeries) ? payload.gdpSeries : [];
    const availableDates = gdpSeries
      .map((point) => getEconomicDateKey(point))
      .filter((value) => value);

    if (!availableDates.length) return;

    const uniqueDates = Array.from(new Set(availableDates)).sort();
    const selectedDate = normalizeDateKey(economicDateSelect?.value);
    const datePreferred = uniqueDates.includes(selectedDate)
      ? selectedDate
      : uniqueDates[uniqueDates.length - 1];

    populateDateSelect(economicDateSelect, uniqueDates, datePreferred, 'last');
  }

  function refreshEconomicKpisFromState() {
    const payload = dashboardPayload;
    if (!payload) return;

    const gdpSeries = Array.isArray(payload.gdpSeries) ? payload.gdpSeries : [];
    const selectedDate = normalizeDateKey(economicDateSelect?.value);

    const selectedPoint = gdpSeries.find((point) => getEconomicDateKey(point) === selectedDate)
      || gdpSeries[gdpSeries.length - 1]
      || {};

    if (kpi.gdpLatest) kpi.gdpLatest.textContent = formatPercent(selectedPoint.gdp_growth);
    if (kpi.gdpQoq) kpi.gdpQoq.textContent = formatPercent(selectedPoint.gdp_growth_qoq);
    if (kpi.gdpYoy) kpi.gdpYoy.textContent = formatPercent(selectedPoint.gdp_growth_yoy);

    if (economicAsOfNote) {
      const asOf = formatDate(selectedPoint.quarter_end_date || selectedPoint.date);
      economicAsOfNote.textContent = `* GDP values are quarterly (as of ${asOf}; latest published GDP quarter).`;
    }
  }

  function getTrendMetricDefinition() {
    const metric = trendAnalysisMetricSelect?.value || 'gdp_growth';
    return trendMetricConfig[metric] || trendMetricConfig.gdp_growth;
  }

  function buildEconomicTrendSeries(metricDef) {
    const gdpSeries = Array.isArray(dashboardPayload?.gdpSeries) ? dashboardPayload.gdpSeries : [];

    return gdpSeries
      .map((point) => ({
        date: point.quarter_end_date || point.date,
        value: toNumber(point?.[metricDef.key]),
      }))
      .filter((point) => normalizeDateKey(point.date) && point.value !== null);
  }

  function hydrateTrendDateControls(series) {
    const availableDates = Array.from(new Set(
      series
        .map((point) => normalizeDateKey(point.date))
        .filter((value) => value)
    )).sort();

    if (!availableDates.length) {
      if (trendStartDateSelect) trendStartDateSelect.innerHTML = '';
      if (trendEndDateSelect) trendEndDateSelect.innerHTML = '';
      return;
    }

    const currentStart = normalizeDateKey(trendStartDateSelect?.value);
    const currentEnd = normalizeDateKey(trendEndDateSelect?.value);
    const hasCurrentRange = currentStart && currentEnd
      && availableDates.includes(currentStart)
      && availableDates.includes(currentEnd);

    const lastIndex = availableDates.length - 1;
    const defaultStartIndex = Math.max(lastIndex - 7, 0);
    const defaultStartDate = availableDates[defaultStartIndex];
    const defaultEndDate = availableDates[lastIndex];

    const startPreferred = hasCurrentRange ? currentStart : defaultStartDate;
    const endPreferred = hasCurrentRange ? currentEnd : defaultEndDate;

    populateDateSelect(trendStartDateSelect, availableDates, startPreferred, 'first');
    populateDateSelect(trendEndDateSelect, availableDates, endPreferred, 'last');

    const start = normalizeDateKey(trendStartDateSelect?.value);
    const end = normalizeDateKey(trendEndDateSelect?.value);
    if (start && end && start > end && trendEndDateSelect) {
      trendEndDateSelect.value = start;
    }
  }

  function renderTrendChart(series, metricDef) {
    if (!hasChart) return;

    const canvas = document.getElementById('gdpTrendChart');
    if (!canvas) return;

    if (!series.length) {
      if (gdpTrendChart) {
        gdpTrendChart.destroy();
        gdpTrendChart = null;
      }
      return;
    }

    const labels = series.map((point) => {
      const date = new Date(point.date);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    });

    const datasetValues = series.map((point) => toNumber(point.value));

    if (gdpTrendChart) gdpTrendChart.destroy();

    gdpTrendChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: metricDef.label,
            data: datasetValues,
            borderColor: '#2c3e50',
            backgroundColor: 'rgba(44, 62, 80, 0.08)',
            borderWidth: 2,
            tension: 0.25,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          title: {
            display: true,
            text: metricDef.label,
          },
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = Number(ctx.parsed.y);
                if (!Number.isFinite(value)) return `${metricDef.label}: N/A`;
                if (metricDef.type === 'percent') return `${metricDef.label}: ${value.toFixed(2)}%`;
                return `${metricDef.label}: ${value.toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => {
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) return value;
                if (metricDef.type === 'percent') return `${numeric}%`;
                return numeric;
              },
            },
          },
        },
      },
    });
  }

  function refreshTrendAnalysis() {
    const metricDef = getTrendMetricDefinition();
    const series = buildEconomicTrendSeries(metricDef);

    hydrateTrendDateControls(series);

    const startDate = normalizeDateKey(trendStartDateSelect?.value);
    const endDate = normalizeDateKey(trendEndDateSelect?.value);

    const filteredSeries = series.filter((point) => {
      const dateKey = normalizeDateKey(point.date);
      if (!dateKey) return false;
      if (startDate && dateKey < startDate) return false;
      if (endDate && dateKey > endDate) return false;
      return true;
    });

    renderTrendChart(filteredSeries, metricDef);
  }

  async function fetchDashboardMetrics() {
    const response = await fetch('/api/dashboard-metrics?cert=6560');
    if (!response.ok) throw new Error('Failed to fetch dashboard metrics');
    return response.json();
  }

  async function init() {
    try {
      dashboardPayload = await fetchDashboardMetrics();
      hydrateEconomicDateControls(dashboardPayload);
      refreshEconomicKpisFromState();
      refreshTrendAnalysis();
    } catch (error) {
      console.error(error);
    }
  }

  economicDateSelect?.addEventListener('change', refreshEconomicKpisFromState);
  trendAnalysisMetricSelect?.addEventListener('change', refreshTrendAnalysis);
  trendStartDateSelect?.addEventListener('change', refreshTrendAnalysis);
  trendEndDateSelect?.addEventListener('change', refreshTrendAnalysis);

  init();
})();
