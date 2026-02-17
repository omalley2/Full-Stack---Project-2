(function () {
  const root = document.getElementById('bank-dashboard-root');
  if (!root) return;

  const hasChart = typeof Chart !== 'undefined';

  const selectedBankInput = document.getElementById('selected-bank');
  const compositeBankInputs = document.querySelectorAll('input[name="composite-bank"]');
  const compositeBanksList = document.querySelector('.composite-banks-list');
  const bankCompositeMetricSelect = document.getElementById('bank-composite-metric');
  const bankCompositeAsOfDateSelect = document.getElementById('bank-composite-asof-date');
  const bankChartStartDateSelect = document.getElementById('bank-chart-start-date');
  const bankChartEndDateSelect = document.getElementById('bank-chart-end-date');
  const trendAnalysisMetricSelect = document.getElementById('trend-analysis-metric');
  const trendAnalysisBankSelect = document.getElementById('trend-analysis-bank');
  const trendCompositeBankInputs = document.querySelectorAll('input[name="trend-composite-bank"]');
  const economicChartStartDateSelect = document.getElementById('economic-chart-start-date');
  const economicChartEndDateSelect = document.getElementById('economic-chart-end-date');
  const performancePrimaryBankSelect = document.getElementById('perf-primary-bank');
  const performanceMetricSelect = document.getElementById('perf-metric');
  const performanceDateSelect = document.getElementById('perf-date');
  const performanceHistogramBankInputs = document.querySelectorAll('input[name="perf-hist-bank"]');
  const bankAsOfNote = document.getElementById('kpi-bank-asof-note');

  const kpi = {
    bankName: document.getElementById('kpi-bank-name'),
    bankLoansQoq: document.getElementById('kpi-bank-loans-qoq'),
    bankLoansYoy: document.getElementById('kpi-bank-loans-yoy'),
    bankRoaQoq: document.getElementById('kpi-bank-roa-qoq'),
    bankRoaYoy: document.getElementById('kpi-bank-roa-yoy'),
    bankComposite: document.getElementById('kpi-bank-composite'),
    compLoansQoq: document.getElementById('kpi-comp-loans-qoq'),
    compLoansYoy: document.getElementById('kpi-comp-loans-yoy'),
    compRoaQoq: document.getElementById('kpi-comp-roa-qoq'),
    compRoaYoy: document.getElementById('kpi-comp-roa-yoy'),
  };

  const hardCodedCompositeOrder = [628, 3510, 7213, 3511, 6548, 4297, 33124, 18409, 6560];
  const compositePeerColor = '#8e44ad';
  const bankBrandColors = {
    628: '#117ACA',
    3510: '#E31837',
    3511: '#C41230',
    4297: '#004879',
    6548: '#005DAA',
    6560: '#007A53',
    7213: '#1A4FA3',
    18409: '#00A14B',
    33124: '#6F9ED8',
  };

  let gdpChart;
  let bankCompositeChart;
  let performanceHistogramChart;
  const selectedBankStorageKey = 'bankDashboard.selectedBankCert';

  const performanceMetricConfig = {
    total_assets: { label: 'Total Assets', type: 'currency' },
    total_deposits: { label: 'Total Deposits', type: 'currency' },
    total_loans: { label: 'Total Loans', type: 'currency' },
    net_income: { label: 'Net Income', type: 'currency' },
    roa: { label: 'ROA', type: 'percent' },
    roe: { label: 'ROE', type: 'percent' },
    nim: { label: 'Net Interest Margin (NIM)', type: 'percent' },
    efficiency_ratio: { label: 'Efficiency Ratio', type: 'percent' },
    tier1_capital_ratio: { label: 'Tier 1 Capital Ratio', type: 'percent' },
  };

  const trendAnalysisMetricConfig = {
    total_loans: { label: 'Total Bank Loans', source: 'bank', key: 'total_loans', type: 'currency' },
    total_deposits: { label: 'Total Bank Deposits', source: 'bank', key: 'total_deposits', type: 'currency' },
    net_income: { label: 'Net Income', source: 'bank', key: 'net_income', type: 'currency' },
    roa: { label: 'Bank ROA', source: 'bank', key: 'roa', type: 'percent' },
    roe: { label: 'Bank ROE', source: 'bank', key: 'roe', type: 'percent' },
    nim: { label: 'Net Interest Margin (NIM)', source: 'bank', key: 'nim', type: 'percent' },
    tier1_capital_ratio: { label: 'Tier 1 Capital Ratio', source: 'bank', key: 'tier1_capital_ratio', type: 'percent' },
    efficiency_ratio: { label: 'Efficiency Ratio', source: 'bank', key: 'efficiency_ratio', type: 'percent' },
  };

  const fdicAmountMetricsInThousands = new Set([
    'total_assets',
    'total_deposits',
    'total_loans',
    'net_income',
  ]);

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatPercent(value, digits = 2) {
    const num = toNumber(value);
    return num === null ? 'N/A' : `${num.toFixed(digits)}%`;
  }

  function formatCurrency(value, options = {}) {
    const num = toNumber(value);
    if (num === null) return 'N/A';
    const fromThousands = Boolean(options.fromThousands);
    const normalizedValue = fromThousands ? num * 1000 : num;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(normalizedValue);
  }

  function formatDate(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function normalizeDateKey(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  function formatIndex(value) {
    const num = toNumber(value);
    return num === null ? 'N/A' : num.toFixed(2);
  }

  function getActiveSelectedCert() {
    const raw = String(selectedBankInput?.value || root.dataset.selectedCert || '').trim();
    const cert = Number(raw);
    return Number.isInteger(cert) && cert > 0 ? cert : null;
  }

  function hexToRgba(hex, alpha = 1) {
    if (!hex) return `rgba(52, 152, 219, ${alpha})`;

    const normalized = String(hex).replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(52, 152, 219, ${alpha})`;

    const intVal = Number.parseInt(normalized, 16);
    const red = (intVal >> 16) & 255;
    const green = (intVal >> 8) & 255;
    const blue = intVal & 255;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function getBankBrandColor(certNumber) {
    const cert = Number(certNumber);
    return bankBrandColors[cert] || '#3498db';
  }

  function getPrimaryBankBrandColor() {
    const selectedCert = getActiveSelectedCert();
    return selectedCert ? getBankBrandColor(selectedCert) : '#2c3e50';
  }

  function selectedCompositeBankCerts() {
    return Array.from(compositeBankInputs)
      .filter((input) => input.checked)
      .map((input) => Number(input.value))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  function selectedCompositeBankNames() {
    return Array.from(compositeBankInputs)
      .filter((input) => input.checked)
      .map((input) => {
        const labelText = input.parentElement?.textContent || '';
        return labelText.trim();
      })
      .filter((name) => name.length > 0);
  }

  function selectedTrendCompositeBankCerts() {
    return Array.from(trendCompositeBankInputs)
      .filter((input) => input.checked)
      .map((input) => Number(input.value))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  function sortCertsByBankSize(certs) {
    const orderIndex = new Map(hardCodedCompositeOrder.map((cert, index) => [cert, index]));
    return [...certs].sort((a, b) => {
      const indexA = orderIndex.has(a) ? orderIndex.get(a) : Number.MAX_SAFE_INTEGER;
      const indexB = orderIndex.has(b) ? orderIndex.get(b) : Number.MAX_SAFE_INTEGER;
      if (indexA !== indexB) return indexA - indexB;
      return a - b;
    });
  }

  function orderHistogramCerts(selectedCert, certs) {
    const unique = Array.from(new Set(certs.filter((value) => Number.isInteger(value) && value > 0)));
    const peers = sortCertsByBankSize(unique.filter((cert) => cert !== selectedCert));
    const ordered = Number.isInteger(selectedCert) && selectedCert > 0
      ? [selectedCert, ...peers]
      : peers;
    return Array.from(new Set(ordered));
  }

  function selectedPerformanceHistogramBankCerts() {
    const selectedCert = getActiveSelectedCert();

    const direct = Array.from(performanceHistogramBankInputs)
      .filter((input) => input.checked)
      .map((input) => Number(input.value))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (direct.length) {
      return orderHistogramCerts(selectedCert, direct);
    }

    const compositeFallback = selectedCompositeBankCerts();
    if (compositeFallback.length) {
      return orderHistogramCerts(selectedCert, compositeFallback);
    }

    return Number.isInteger(selectedCert) && selectedCert > 0 ? [selectedCert] : [];
  }

  function setDefaultCompositeBanks() {
    const preferred = [628, 3510, 7213, 3511];

    compositeBankInputs.forEach((input) => {
      const cert = Number(input.value);
      input.checked = preferred.includes(cert);
    });
  }

  function applyCompositeBankVisualOrder() {
    if (!compositeBanksList) return;

    const orderIndex = new Map(hardCodedCompositeOrder.map((cert, index) => [cert, index]));
    const labels = Array.from(compositeBanksList.querySelectorAll('label'));

    labels.sort((labelA, labelB) => {
      const certA = Number(labelA.querySelector('input[name="composite-bank"]')?.value);
      const certB = Number(labelB.querySelector('input[name="composite-bank"]')?.value);
      const indexA = orderIndex.has(certA) ? orderIndex.get(certA) : Number.MAX_SAFE_INTEGER;
      const indexB = orderIndex.has(certB) ? orderIndex.get(certB) : Number.MAX_SAFE_INTEGER;

      if (indexA !== indexB) return indexA - indexB;

      const nameA = (labelA.textContent || '').trim();
      const nameB = (labelB.textContent || '').trim();
      return nameA.localeCompare(nameB);
    });

    labels.forEach((label) => compositeBanksList.appendChild(label));
  }

  function setDefaultPerformanceHistogramBanks() {
    if (!performanceHistogramBankInputs.length) return;

    const selectedCert = getActiveSelectedCert();
    const preferred = selectedCert ? [selectedCert, 628, 3510] : [628, 3510, 7213, 3511];

    performanceHistogramBankInputs.forEach((input) => {
      const cert = Number(input.value);
      input.checked = preferred.includes(cert);
    });

    if (!selectedPerformanceHistogramBankCerts().length) {
      performanceHistogramBankInputs[0].checked = true;
    }
  }

  function syncPerformancePrimaryBankSelect() {
    if (!performancePrimaryBankSelect) return;
    const selectedCert = String(selectedBankInput?.value || root.dataset.selectedCert || '').trim();
    if (performancePrimaryBankSelect.value !== selectedCert) {
      performancePrimaryBankSelect.value = selectedCert;
    }
  }

  function applyPersistedPrimaryBankSelection() {
    if (!selectedBankInput) return;

    let persistedCert = '';
    try {
      persistedCert = String(localStorage.getItem(selectedBankStorageKey) || '').trim();
    } catch (error) {
      persistedCert = '';
    }

    const available = Array.from(selectedBankInput.options).map((option) => String(option.value));
    const target = available.includes(persistedCert) ? persistedCert : '';

    selectedBankInput.value = target;
    root.dataset.selectedCert = target;
    if (performancePrimaryBankSelect) {
      performancePrimaryBankSelect.value = target;
    }
  }

  function syncPrimaryBankFromRouteDefault() {
    if (!selectedBankInput) return;
    const routeCert = String(root.dataset.selectedCert || '').trim();
    selectedBankInput.value = routeCert;
  }

  function hydratePerformanceHistoryControls(payload) {
    const dates = (payload?.series || [])
      .flatMap((bank) => bank.data || [])
      .map((point) => normalizeDateKey(point?.date))
      .filter((value) => value);

    const availableDates = Array.from(new Set(dates)).sort();
    if (!availableDates.length || !performanceDateSelect) {
      if (performanceDateSelect) performanceDateSelect.innerHTML = '';
      return;
    }

    const selectedDate = normalizeDateKey(performanceDateSelect.value);
    const datePreferred = availableDates.includes(selectedDate)
      ? selectedDate
      : availableDates[availableDates.length - 1];

    populateDateSelect(performanceDateSelect, availableDates, datePreferred, 'last');
  }

  function renderPerformanceHistogramFromState(payload) {
    if (!hasChart) return;

    const canvas = document.getElementById('performanceHistogramChart');
    if (!canvas) return;

    const selectedDate = normalizeDateKey(performanceDateSelect?.value);
    const rawSeries = payload?.series || [];

    if (!rawSeries.length || !selectedDate) {
      if (performanceHistogramChart) {
        performanceHistogramChart.destroy();
        performanceHistogramChart = null;
      }
      return;
    }

    const desiredOrder = selectedPerformanceHistogramBankCerts();
    const byCert = new Map(
      rawSeries.map((bank) => [Number(bank?.cert_number), bank]).filter(([cert]) => Number.isInteger(cert) && cert > 0)
    );
    const orderedSeries = desiredOrder
      .map((cert) => byCert.get(cert))
      .filter((bank) => !!bank);
    const fallbackSeries = rawSeries.filter((bank) => !desiredOrder.includes(Number(bank?.cert_number)));
    const series = [...orderedSeries, ...fallbackSeries];

    const metric = performanceMetricSelect?.value || 'total_deposits';
    const metricCfg = performanceMetricConfig[metric] || { label: metric, type: 'number' };
    const isCurrencyFromThousands = metricCfg.type === 'currency' && fdicAmountMetricsInThousands.has(metric);

    const values = series.map((bank) => {
      const point = (bank.data || []).find((item) => normalizeDateKey(item.date) === selectedDate) || null;
      return {
        label: bank.bank_name,
        cert: Number(bank.cert_number),
        value: toNumber(point?.value),
      };
    });

    const labels = values.map((item) => item.label);
    const data = values.map((item) => item.value ?? 0);
    const primaryCert = getActiveSelectedCert();
    const backgroundColors = values.map((item) => {
      const color = item.cert === primaryCert ? getBankBrandColor(item.cert) : compositePeerColor;
      return hexToRgba(color, item.cert === primaryCert ? 0.62 : 0.42);
    });
    const borderColors = values.map((item) => (item.cert === primaryCert ? getBankBrandColor(item.cert) : compositePeerColor));
    const borderWidths = values.map((item) => (item.cert === primaryCert ? 3 : 1));

    if (performanceHistogramChart) performanceHistogramChart.destroy();

    performanceHistogramChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: metricCfg.label,
            data,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: borderWidths,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          title: {
            display: true,
            text: `Performance Histogram • ${metricCfg.label} • ${formatDate(selectedDate)}`,
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const y = ctx.parsed.y;
                if (!Number.isFinite(y)) return `${metricCfg.label}: N/A`;
                if (metricCfg.type === 'percent') return `${metricCfg.label}: ${y.toFixed(2)}%`;
                if (metricCfg.type === 'currency') return `${metricCfg.label}: ${formatCurrency(y, { fromThousands: isCurrencyFromThousands })}`;
                return `${metricCfg.label}: ${y.toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => {
                const v = Number(value);
                if (!Number.isFinite(v)) return value;
                if (metricCfg.type === 'percent') return `${v.toFixed(2)}%`;
                if (metricCfg.type === 'currency') return new Intl.NumberFormat('en-US', {
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(isCurrencyFromThousands ? v * 1000 : v);
                return v;
              },
            },
          },
        },
      },
    });
  }

  async function refreshPerformanceHistogram() {
    try {
      const certs = selectedPerformanceHistogramBankCerts();
      const metric = performanceMetricSelect?.value || 'total_deposits';

      if (!certs.length) {
        hydratePerformanceHistoryControls({ series: [] });
        renderPerformanceHistogramFromState({ series: [] });
        return;
      }

      const query = new URLSearchParams({
        metric,
        certs: certs.join(','),
      });

      const response = await fetch(`/api/bank-comparison-series?${query.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch performance histogram data');
      const payload = await response.json();

      hydratePerformanceHistoryControls(payload);
      renderPerformanceHistogramFromState(payload);
    } catch (error) {
      console.error(error);
    }
  }

  function populateDateSelect(selectEl, dates, preferredValue, fallback = 'last') {
    if (!selectEl) return;

    const options = Array.isArray(dates) ? dates : [];
    const current = normalizeDateKey(selectEl.value);
    const nextValue = options.includes(current)
      ? current
      : (options.includes(preferredValue)
        ? preferredValue
        : (fallback === 'first' ? options[0] : options[options.length - 1]));

    selectEl.innerHTML = options
      .map((dateKey) => `<option value="${dateKey}">${formatDate(dateKey)}</option>`)
      .join('');

    if (nextValue) {
      selectEl.value = nextValue;
    }
  }

  function hydrateCompositeDateControls(payload) {
    const availableDatesFromApi = (payload?.availableDates || []).map((value) => normalizeDateKey(value)).filter((value) => value);
    const availableDatesFromSeries = (payload?.series || [])
      .map((point) => normalizeDateKey(point?.date))
      .filter((value) => value);

    const availableDates = Array.from(new Set([
      ...availableDatesFromApi,
      ...availableDatesFromSeries,
      normalizeDateKey(payload?.asOf),
    ].filter((value) => value))).sort();

    if (!availableDates.length) return;

    const asOfFromPayload = normalizeDateKey(payload?.asOf);
    const chartStartFromPayload = normalizeDateKey(payload?.chartRange?.start);
    const chartEndFromPayload = normalizeDateKey(payload?.chartRange?.end);
    const currentStart = normalizeDateKey(bankChartStartDateSelect?.value);
    const currentEnd = normalizeDateKey(bankChartEndDateSelect?.value);
    const hasCurrentRange = currentStart && currentEnd
      && availableDates.includes(currentStart)
      && availableDates.includes(currentEnd);

    const lastIndex = availableDates.length - 1;
    const defaultStartIndex = Math.max(lastIndex - 7, 0);
    const defaultStartDate = availableDates[defaultStartIndex];
    const defaultEndDate = availableDates[lastIndex];

    const chartStartPreferred = chartStartFromPayload || (hasCurrentRange ? currentStart : defaultStartDate);
    const chartEndPreferred = chartEndFromPayload || (hasCurrentRange ? currentEnd : defaultEndDate);
    const asOfPreferred = asOfFromPayload || chartEndPreferred;

    populateDateSelect(bankCompositeAsOfDateSelect, availableDates, asOfPreferred, 'last');
    populateDateSelect(bankChartStartDateSelect, availableDates, chartStartPreferred, 'first');
    populateDateSelect(bankChartEndDateSelect, availableDates, chartEndPreferred, 'last');

    const start = normalizeDateKey(bankChartStartDateSelect?.value);
    const end = normalizeDateKey(bankChartEndDateSelect?.value);
    if (start && end && start > end && bankChartEndDateSelect) {
      bankChartEndDateSelect.value = start;
    }
  }

  function getTrendMetricDefinition() {
    const metric = trendAnalysisMetricSelect?.value || 'total_loans';
    return trendAnalysisMetricConfig[metric] || trendAnalysisMetricConfig.total_loans;
  }

  function getTrendSelectedBankCert() {
    const cert = Number(trendAnalysisBankSelect?.value || selectedBankInput?.value);
    return Number.isInteger(cert) && cert > 0 ? cert : null;
  }

  async function fetchBankTrendSeries(metricDef, cert, peerCerts = []) {
    if (!cert) return { series: [] };

    const mergedCerts = Array.from(new Set([
      cert,
      ...peerCerts.filter((value) => Number.isInteger(value) && value > 0 && value !== cert),
    ]));

    const query = new URLSearchParams({
      metric: metricDef.key,
      certs: mergedCerts.join(','),
    });

    const response = await fetch(`/api/bank-comparison-series?${query.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch trend analysis bank series');

    const payload = await response.json();
    return { series: payload.series || [] };
  }

  function hydrateTrendAnalysisDateControls(series) {
    const availableDates = Array.from(new Set(
      series
        .map((point) => normalizeDateKey(point.date))
        .filter((value) => value)
    )).sort();

    if (!availableDates.length) {
      if (economicChartStartDateSelect) economicChartStartDateSelect.innerHTML = '';
      if (economicChartEndDateSelect) economicChartEndDateSelect.innerHTML = '';
      return;
    }

    const currentStart = normalizeDateKey(economicChartStartDateSelect?.value);
    const currentEnd = normalizeDateKey(economicChartEndDateSelect?.value);
    const hasCurrentRange = currentStart && currentEnd
      && availableDates.includes(currentStart)
      && availableDates.includes(currentEnd);

    const lastIndex = availableDates.length - 1;
    const defaultStartIndex = Math.max(lastIndex - 7, 0);
    const defaultStartDate = availableDates[defaultStartIndex];
    const defaultEndDate = availableDates[lastIndex];

    const startPreferred = hasCurrentRange ? currentStart : defaultStartDate;
    const endPreferred = hasCurrentRange ? currentEnd : defaultEndDate;

    populateDateSelect(economicChartStartDateSelect, availableDates, startPreferred, 'first');
    populateDateSelect(economicChartEndDateSelect, availableDates, endPreferred, 'last');

    const start = normalizeDateKey(economicChartStartDateSelect?.value);
    const end = normalizeDateKey(economicChartEndDateSelect?.value);
    if (start && end && start > end && economicChartEndDateSelect) {
      economicChartEndDateSelect.value = start;
    }
  }

  async function refreshTrendAnalysis() {
    try {
      const metricDef = getTrendMetricDefinition();
      let bankName = '';
      let bankSeries = [];

      const cert = getTrendSelectedBankCert();
      if (!cert) {
        renderTrendAnalysisChart([], metricDef, bankName);
        return;
      }

      const selectedOption = trendAnalysisBankSelect?.selectedOptions?.[0];
      bankName = (selectedOption?.textContent || '').trim();
      const peerCerts = sortCertsByBankSize(
        selectedTrendCompositeBankCerts().filter((value) => value !== cert)
      );

      const payload = await fetchBankTrendSeries(metricDef, cert, peerCerts);
      const byCert = new Map((payload.series || []).map((entry) => [Number(entry.cert_number), entry]));
      const orderedCerts = [cert, ...peerCerts];
      bankSeries = orderedCerts
        .map((value) => byCert.get(value))
        .filter((entry) => !!entry);

      const series = bankSeries.flatMap((entry) =>
        (entry.data || [])
          .map((point) => ({ date: point.date }))
          .filter((point) => normalizeDateKey(point.date))
      );

      hydrateTrendAnalysisDateControls(series);

      const startDate = normalizeDateKey(economicChartStartDateSelect?.value);
      const endDate = normalizeDateKey(economicChartEndDateSelect?.value);
      const filteredSeries = series.filter((point) => {
        const dateKey = normalizeDateKey(point.date);
        if (!dateKey) return false;
        if (startDate && dateKey < startDate) return false;
        if (endDate && dateKey > endDate) return false;
        return true;
      });

      const filteredBankSeries = bankSeries.map((entry) => ({
        ...entry,
        data: (entry.data || []).filter((point) => {
          const dateKey = normalizeDateKey(point.date);
          if (!dateKey) return false;
          if (startDate && dateKey < startDate) return false;
          if (endDate && dateKey > endDate) return false;
          return true;
        }),
      }));

      renderTrendAnalysisChart(filteredBankSeries, metricDef, bankName);
    } catch (error) {
      console.error(error);
    }
  }

  function renderTrendAnalysisChart(series, metricDef, bankName = '') {
    if (!hasChart) return;

    const canvas = document.getElementById('gdpTrendChart');
    if (!canvas) return;

    if (!series.length) {
      if (gdpChart) {
        gdpChart.destroy();
        gdpChart = null;
      }
      return;
    }

    if (metricDef.source === 'bank') {
      const trendPalette = [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
        '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
      ];

      const labelSet = new Set();
      series.forEach((entry) => {
        (entry.data || []).forEach((point) => {
          const dateKey = normalizeDateKey(point.date);
          if (dateKey) labelSet.add(dateKey);
        });
      });

      const sortedLabels = Array.from(labelSet).sort();
      const labels = sortedLabels.map((dateKey) => new Date(dateKey).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }));
      const primaryCert = getTrendSelectedBankCert();
      const isCurrencyFromThousands = metricDef.type === 'currency' && fdicAmountMetricsInThousands.has(metricDef.key);
      const usedColors = new Set();

      const datasets = series.map((entry, index) => {
        const cert = Number(entry.cert_number);
        const isPrimary = cert === primaryCert;
        const valuesByDate = new Map(
          (entry.data || [])
            .map((point) => [normalizeDateKey(point.date), toNumber(point.value)])
            .filter(([dateKey, value]) => !!dateKey && value !== null)
        );

        let lineColor = getBankBrandColor(cert);
        if (usedColors.has(lineColor)) {
          lineColor = trendPalette[index % trendPalette.length];
        }

        let paletteOffset = 0;
        while (usedColors.has(lineColor) && paletteOffset < trendPalette.length) {
          lineColor = trendPalette[(index + paletteOffset) % trendPalette.length];
          paletteOffset += 1;
        }
        usedColors.add(lineColor);

        return {
          label: entry.bank_name,
          data: sortedLabels.map((dateKey) => valuesByDate.get(dateKey) ?? null),
          borderColor: lineColor,
          backgroundColor: hexToRgba(lineColor, isPrimary ? 0.16 : 0.14),
          borderWidth: isPrimary ? 3 : 2,
          tension: 0.25,
          spanGaps: true,
        };
      });

      if (gdpChart) gdpChart.destroy();

      let hoveredTrendDatasetIndex = null;

      gdpChart = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          onHover: (event, _elements, chart) => {
            const nearest = chart.getElementsAtEventForMode(
              event,
              'nearest',
              { intersect: false },
              false
            );
            hoveredTrendDatasetIndex = nearest?.[0]?.datasetIndex ?? null;
          },
          plugins: {
            title: {
              display: true,
              text: `${metricDef.label} • ${bankName}`,
            },
            legend: { position: 'top' },
            tooltip: {
              itemSort: (itemA, itemB) => {
                const hoveredDatasetIndex = hoveredTrendDatasetIndex;

                if (hoveredDatasetIndex === undefined) {
                  return itemA.datasetIndex - itemB.datasetIndex;
                }

                if (itemA.datasetIndex === hoveredDatasetIndex && itemB.datasetIndex !== hoveredDatasetIndex) {
                  return -1;
                }

                if (itemB.datasetIndex === hoveredDatasetIndex && itemA.datasetIndex !== hoveredDatasetIndex) {
                  return 1;
                }

                return itemA.datasetIndex - itemB.datasetIndex;
              },
              callbacks: {
                title: (items) => {
                  if (!items.length) return '';

                  const chart = items[0].chart;
                  const hoveredLabel = hoveredTrendDatasetIndex !== null && hoveredTrendDatasetIndex !== undefined
                    ? chart?.data?.datasets?.[hoveredTrendDatasetIndex]?.label
                    : null;

                  return hoveredLabel || items[0].dataset.label || '';
                },
                label: (ctx) => {
                  const value = Number(ctx.parsed.y);
                  if (!Number.isFinite(value)) return `${ctx.dataset.label}: N/A`;
                  if (metricDef.type === 'currency') return `${ctx.dataset.label}: ${formatCurrency(value, { fromThousands: isCurrencyFromThousands })}`;
                  if (metricDef.type === 'percent') return `${ctx.dataset.label}: ${value.toFixed(2)}%`;
                  return `${ctx.dataset.label}: ${value.toFixed(2)}`;
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
                  if (metricDef.type === 'currency') {
                    const compactValue = new Intl.NumberFormat('en-US', {
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(isCurrencyFromThousands ? numeric * 1000 : numeric);
                    return `$${compactValue}`;
                  }
                  if (metricDef.type === 'percent') return `${numeric.toFixed(2)}%`;
                  return numeric;
                },
              },
            },
          },
        },
      });

      return;
    }

    const labels = series.map((point) => {
      const date = new Date(point.date);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    });
    const datasetValues = series.map((point) => toNumber(point.value));
    const titleSuffix = metricDef.source === 'bank' && bankName ? ` • ${bankName}` : '';

    if (gdpChart) gdpChart.destroy();

    gdpChart = new Chart(canvas, {
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
            text: `${metricDef.label}${titleSuffix}`,
          },
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = Number(ctx.parsed.y);
                if (!Number.isFinite(value)) return `${metricDef.label}: N/A`;
                if (metricDef.type === 'currency') return `${metricDef.label}: ${formatCurrency(value)}`;
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
                if (metricDef.type === 'currency') {
                  return new Intl.NumberFormat('en-US', {
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(numeric);
                }
                if (metricDef.type === 'percent') return `${numeric}%`;
                return numeric;
              },
            },
          },
        },
      },
    });
  }

  function renderBankCompositeIndexChart(payload) {
    if (!hasChart) return;

    const canvas = document.getElementById('bankCompositeIndexChart');
    if (!canvas) return;

    const startDate = normalizeDateKey(bankChartStartDateSelect?.value);
    const endDate = normalizeDateKey(bankChartEndDateSelect?.value);

    const series = (payload.series || []).filter((point) => {
      const dateKey = normalizeDateKey(point?.date);
      if (!dateKey) return false;
      if (startDate && dateKey < startDate) return false;
      if (endDate && dateKey > endDate) return false;
      return true;
    });

    const labels = series.map((point) => new Date(point.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }));
    const data = series.map((point) => toNumber(point.composite_value));
    const selectedData = series.map((point) => toNumber(point.selected_value));
    const primaryColor = getPrimaryBankBrandColor();

    if (bankCompositeChart) bankCompositeChart.destroy();

    bankCompositeChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `Selected Bank (${payload.selectedBankName || 'N/A'})`,
            data: selectedData,
            borderColor: primaryColor,
            backgroundColor: hexToRgba(primaryColor, 0.12),
            borderWidth: 3,
            spanGaps: true,
            tension: 0.2,
          },
          {
            label: `Bank Composite (${payload.selectedMetricLabel || 'Metric'})`,
            data,
            borderColor: '#8e44ad',
            backgroundColor: 'rgba(142, 68, 173, 0.12)',
            borderWidth: 2,
            spanGaps: true,
            tension: 0.2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          title: {
            display: true,
            text: `Equal-weighted average of selected banks • ${payload.selectedMetricLabel || ''}`,
          },
        },
        scales: {
          y: {},
        },
      },
    });
  }

  function updateKpis(payload) {
    const selectedBank = payload.selectedBank || {};
    const primaryColor = getPrimaryBankBrandColor();

    kpi.bankName.textContent = selectedBank.bank_name || 'N/A';
    kpi.bankLoansQoq.textContent = formatPercent(selectedBank.total_loans_qoq);
    kpi.bankLoansYoy.textContent = formatPercent(selectedBank.total_loans_yoy);
    kpi.bankRoaQoq.textContent = formatPercent(selectedBank.roa_qoq);
    kpi.bankRoaYoy.textContent = formatPercent(selectedBank.roa_yoy);

    [kpi.bankName, kpi.bankLoansQoq, kpi.bankLoansYoy, kpi.bankRoaQoq, kpi.bankRoaYoy]
      .filter((el) => !!el)
      .forEach((el) => {
        el.style.color = '';
        const card = el.closest('.kpi-card');
        if (card) {
          card.style.background = hexToRgba(primaryColor, 0.14);
          card.style.borderColor = hexToRgba(primaryColor, 0.45);
        }
      });

    if (bankAsOfNote) {
      const bankAsOf = formatDate(payload?.asOf?.bank || selectedBank.date);
      bankAsOfNote.textContent = `* Bank metrics as of ${bankAsOf}.`;
    }
  }

  async function fetchDashboardMetrics(cert) {
    if (!Number.isInteger(cert) || cert <= 0) {
      return null;
    }
    const response = await fetch(`/api/dashboard-metrics?cert=${cert}`);
    if (!response.ok) throw new Error('Failed to fetch dashboard metrics');
    return response.json();
  }

  async function fetchBankCompositeSeries() {
    const cert = getActiveSelectedCert();
    if (!cert) {
      return null;
    }
    const certs = selectedCompositeBankCerts().join(',');
    const metric = bankCompositeMetricSelect?.value || 'total_loans_qoq';
    const query = new URLSearchParams({
      cert: String(cert),
      metric,
      certs,
    });

    const asOfDate = normalizeDateKey(bankCompositeAsOfDateSelect?.value);
    const chartStartDate = normalizeDateKey(bankChartStartDateSelect?.value);
    const chartEndDate = normalizeDateKey(bankChartEndDateSelect?.value);

    if (asOfDate) query.set('as_of', asOfDate);
    if (chartStartDate) query.set('chart_start', chartStartDate);
    if (chartEndDate) query.set('chart_end', chartEndDate);

    const response = await fetch(`/api/bank-metric-composite?${query.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch bank metric composite');
    return response.json();
  }

  async function refreshDashboard() {
    try {
      const activeCert = getActiveSelectedCert();
      const metricsPayload = await fetchDashboardMetrics(activeCert || 6560);
      if (!metricsPayload) return;
      if (activeCert) {
        updateKpis(metricsPayload);
      } else {
        updateKpis({ selectedBank: {}, asOf: {} });
        if (kpi.bankName) kpi.bankName.textContent = 'None selected';
        if (bankAsOfNote) {
          bankAsOfNote.textContent = '* Select a primary bank to view bank metrics.';
        }
      }
      await refreshTrendAnalysis();
    } catch (error) {
      console.error(error);
    }
  }

  async function refreshBankCompositeIndex() {
    try {
      const activeCert = getActiveSelectedCert();
      if (!activeCert) {
        if (bankCompositeChart) {
          bankCompositeChart.destroy();
          bankCompositeChart = null;
        }
        if (kpi.bankComposite) {
          const names = selectedCompositeBankNames();
          kpi.bankComposite.textContent = names.length ? names.join(', ') : 'None selected';
        }
        if (kpi.compLoansQoq) kpi.compLoansQoq.textContent = '--';
        if (kpi.compLoansYoy) kpi.compLoansYoy.textContent = '--';
        if (kpi.compRoaQoq) kpi.compRoaQoq.textContent = '--';
        if (kpi.compRoaYoy) kpi.compRoaYoy.textContent = '--';
        if (bankAsOfNote) {
          bankAsOfNote.textContent = '* Select a primary bank to view bank metrics.';
        }
        return;
      }

      const selectedCount = selectedCompositeBankCerts().length;
      const rawPayload = await fetchBankCompositeSeries();
      if (!rawPayload) return;
      const payload = selectedCount === 0
        ? {
            ...rawPayload,
            series: (rawPayload.series || []).map((point) => ({
              ...point,
              composite_value: 0,
            })),
            latest: rawPayload.latest
              ? { ...rawPayload.latest, composite_value: 0 }
              : rawPayload.latest,
            defaultMetrics: Object.fromEntries(
              Object.entries(rawPayload.defaultMetrics || {}).map(([metric, metricPayload]) => [
                metric,
                {
                  ...metricPayload,
                  composite_value: 0,
                },
              ])
            ),
          }
        : rawPayload;

      hydrateCompositeDateControls(payload);
      renderBankCompositeIndexChart(payload);
      if (kpi.bankComposite) {
        const names = selectedCompositeBankNames();
        kpi.bankComposite.textContent = names.length ? names.join(', ') : 'None selected';
      }
      const defaults = payload.defaultMetrics || {};
      if (kpi.compLoansQoq) kpi.compLoansQoq.textContent = formatPercent(defaults.total_loans_qoq?.composite_value);
      if (kpi.compLoansYoy) kpi.compLoansYoy.textContent = formatPercent(defaults.total_loans_yoy?.composite_value);
      if (kpi.compRoaQoq) kpi.compRoaQoq.textContent = formatPercent(defaults.roa_qoq?.composite_value);
      if (kpi.compRoaYoy) kpi.compRoaYoy.textContent = formatPercent(defaults.roa_yoy?.composite_value);

      if (bankAsOfNote) {
        const bankCompositeAsOf = formatDate(payload?.asOf);
        bankAsOfNote.textContent = `* Bank metrics as of ${bankCompositeAsOf}. Composite uses ${selectedCount} selected bank(s), equal-weighted.`;
      }
    } catch (error) {
      console.error(error);
    }
  }

  compositeBankInputs.forEach((input) => {
    input.addEventListener('change', refreshBankCompositeIndex);
  });

  bankCompositeMetricSelect?.addEventListener('change', refreshBankCompositeIndex);
  bankCompositeAsOfDateSelect?.addEventListener('change', () => {
    if (bankChartEndDateSelect && bankCompositeAsOfDateSelect?.value) {
      bankChartEndDateSelect.value = bankCompositeAsOfDateSelect.value;
    }

    const start = normalizeDateKey(bankChartStartDateSelect?.value);
    const end = normalizeDateKey(bankChartEndDateSelect?.value);
    if (start && end && start > end && bankChartStartDateSelect && bankChartEndDateSelect) {
      bankChartStartDateSelect.value = bankChartEndDateSelect.value;
    }

    refreshBankCompositeIndex();
  });
  bankChartStartDateSelect?.addEventListener('change', () => {
    const start = normalizeDateKey(bankChartStartDateSelect?.value);
    const end = normalizeDateKey(bankChartEndDateSelect?.value);
    if (start && end && start > end && bankChartEndDateSelect) {
      bankChartEndDateSelect.value = bankChartStartDateSelect.value;
    }

    if (bankCompositeAsOfDateSelect && bankChartEndDateSelect?.value) {
      bankCompositeAsOfDateSelect.value = bankChartEndDateSelect.value;
    }

    refreshBankCompositeIndex();
  });
  bankChartEndDateSelect?.addEventListener('change', () => {
    if (bankCompositeAsOfDateSelect && bankChartEndDateSelect?.value) {
      bankCompositeAsOfDateSelect.value = bankChartEndDateSelect.value;
    }

    const start = normalizeDateKey(bankChartStartDateSelect?.value);
    const end = normalizeDateKey(bankChartEndDateSelect?.value);
    if (start && end && start > end && bankChartStartDateSelect && bankChartEndDateSelect) {
      bankChartStartDateSelect.value = bankChartEndDateSelect.value;
    }

    refreshBankCompositeIndex();
  });

  economicChartStartDateSelect?.addEventListener('change', refreshTrendAnalysis);
  economicChartEndDateSelect?.addEventListener('change', refreshTrendAnalysis);
  trendAnalysisMetricSelect?.addEventListener('change', refreshTrendAnalysis);
  trendAnalysisBankSelect?.addEventListener('change', refreshTrendAnalysis);

  performanceMetricSelect?.addEventListener('change', refreshPerformanceHistogram);
  performanceDateSelect?.addEventListener('change', refreshPerformanceHistogram);
  performanceHistogramBankInputs.forEach((input) => {
    input.addEventListener('change', refreshPerformanceHistogram);
  });
  trendCompositeBankInputs.forEach((input) => {
    input.addEventListener('change', refreshTrendAnalysis);
  });

  performancePrimaryBankSelect?.addEventListener('change', () => {
    if (!selectedBankInput) return;
    if (String(selectedBankInput.value) === String(performancePrimaryBankSelect.value)) return;

    selectedBankInput.value = performancePrimaryBankSelect.value || '';
    selectedBankInput.dispatchEvent(new Event('change'));
  });

  selectedBankInput?.addEventListener('change', async () => {
    const nextValue = String(selectedBankInput.value || '').trim();
    root.dataset.selectedCert = nextValue;

    try {
      if (nextValue) {
        localStorage.setItem(selectedBankStorageKey, nextValue);
      } else {
        localStorage.removeItem(selectedBankStorageKey);
      }
    } catch (error) {
      // no-op
    }

    syncPerformancePrimaryBankSelect();
    setDefaultCompositeBanks();
    setDefaultPerformanceHistogramBanks();
    await refreshDashboard();
    await refreshBankCompositeIndex();
    await refreshPerformanceHistogram();
  });

  applyCompositeBankVisualOrder();
  applyPersistedPrimaryBankSelection();
  syncPerformancePrimaryBankSelect();
  setDefaultCompositeBanks();
  setDefaultPerformanceHistogramBanks();
  refreshDashboard();
  refreshBankCompositeIndex();
  refreshPerformanceHistogram();
})();
