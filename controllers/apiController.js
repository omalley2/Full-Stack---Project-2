const pool = require('../config/connection');
const strategyModel = require('../models/strategyModel');

const DASHBOARD_BANK_METRICS = [
  'roa',
  'roe',
  'nim',
  'total_assets',
  'total_loans',
  'total_deposits',
  'net_income',
  'efficiency_ratio',
  'tier1_capital_ratio',
];

const BANK_COMPOSITE_COMPONENTS = {
  roa: { label: 'ROA', inverse: false },
  roe: { label: 'ROE', inverse: false },
  nim: { label: 'NIM', inverse: false },
  total_loans_yoy: { label: 'Loans YoY Growth', inverse: false },
  total_deposits_yoy: { label: 'Deposits YoY Growth', inverse: false },
  net_income_yoy: { label: 'Net Income YoY Growth', inverse: false },
  tier1_capital_ratio: { label: 'Tier 1 Capital Ratio', inverse: false },
  efficiency_ratio: { label: 'Efficiency Ratio', inverse: true },
};

const BANK_COMPOSITE_METRICS = {
  total_loans_qoq: 'Loans QoQ Growth',
  total_loans_yoy: 'Loans YoY Growth',
  roa_qoq: 'ROA QoQ Change',
  roa_yoy: 'ROA YoY Change',
};

function cleanBankName(name) {
  if (!name) return '';

  const cleaned = String(name)
    .replace(/\s*-\s*,\s*$/, '')
    .replace(/\s*,\s*$/, '')
    .trim();

  const key = cleaned.toLowerCase();
  const displayMap = {
    'jpmorgan chase': 'JPMorgan Chase',
    'bank of america': 'Bank of America',
    'wells fargo': 'Wells Fargo',
    'citibank': 'Citibank',
    'u.s. bank': 'U.S. Bank',
    'goldman sachs bank': 'Goldman Sachs',
    'goldman sachs bank usa': 'Goldman Sachs',
    'td bank': 'TD Bank',
    'capital one': 'Capital One',
    'huntington national bank': 'Huntington',
    'the huntington national bank': 'Huntington',
  };

  return displayMap[key] || cleaned;
}

function parseCertList(certsRaw) {
  if (!certsRaw) return [];

  return String(certsRaw)
    .split(',')
    .map((cert) => Number(cert.trim()))
    .filter((cert) => Number.isInteger(cert) && cert > 0);
}

function parseWeight(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeDateInput(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function toDateKey(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseComponentList(raw) {
  if (!raw) return [];

  return String(raw)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => Object.prototype.hasOwnProperty.call(BANK_COMPOSITE_COMPONENTS, part));
}

async function getEconomicData(req, res) {
  try {
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    let query = 'SELECT * FROM economic_data';
    const params = [];

    if (startDate || endDate) {
      query += ' WHERE';

      if (startDate) {
        params.push(startDate);
        query += ` date >= $${params.length}`;
      }

      if (endDate) {
        if (startDate) query += ' AND';
        params.push(endDate);
        query += ` date <= $${params.length}`;
      }
    }

    query += ' ORDER BY date ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching economic data API:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getBankPerformanceByCert(req, res) {
  try {
    const cert = req.params.cert;

    const result = await pool.query(`
      SELECT * FROM bank_performance
      WHERE cert_number = $1
      ORDER BY date ASC
    `, [cert]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching bank performance API:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getCorrelationData(req, res) {
  try {
    const cert = Number(req.query.cert) || 628;

    const result = await pool.query(`
      SELECT
        e.date,
        e.unemployment_rate,
        e.fed_funds_rate,
        e.gdp_growth,
        e.delinq_cc,
        e.delinq_mortgage,
        b.roa,
        b.roe,
        b.nim
      FROM economic_data e
      LEFT JOIN bank_performance b
        ON DATE_TRUNC('month', e.date) = DATE_TRUNC('month', b.date)
        AND b.cert_number = $1
      WHERE b.roa IS NOT NULL
      ORDER BY e.date ASC
    `, [cert]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching correlation data:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getDashboardMetrics(req, res) {
  try {
    const cert = Number(req.query.cert) || 6560;

    const gdpSeriesResult = await pool.query(`
      WITH quarterly_base AS (
        SELECT DISTINCT ON (DATE_TRUNC('quarter', date))
          DATE_TRUNC('quarter', date)::date AS quarter_date,
          date,
          gdp_growth,
          unemployment_rate,
          fed_funds_rate,
          yield_curve
        FROM economic_data
        WHERE gdp_growth IS NOT NULL
        ORDER BY
          DATE_TRUNC('quarter', date),
          CASE WHEN ABS(gdp_growth) > 0.0001 THEN 0 ELSE 1 END,
          date DESC
      ),
      econ AS (
        SELECT
          date,
          quarter_date,
          gdp_growth,
          unemployment_rate,
          fed_funds_rate,
          yield_curve,
          gdp_growth - LAG(gdp_growth, 1) OVER (ORDER BY quarter_date) AS gdp_growth_qoq,
          gdp_growth - LAG(gdp_growth, 4) OVER (ORDER BY quarter_date) AS gdp_growth_yoy
        FROM quarterly_base
      )
      SELECT
        date,
        quarter_date,
        (quarter_date::timestamp + INTERVAL '3 months' - INTERVAL '1 day')::date AS quarter_end_date,
        gdp_growth,
        gdp_growth_qoq,
        gdp_growth_yoy,
        unemployment_rate,
        fed_funds_rate,
        yield_curve
      FROM econ
      ORDER BY quarter_date DESC
      LIMIT 24
    `);

    const latestEconomic = gdpSeriesResult.rows[0] || null;

    const selectedBankResult = await pool.query(`
      WITH bank_trend AS (
        SELECT
          cert_number,
          bank_name,
          date,
          total_assets,
          total_deposits,
          total_loans,
          net_income,
          roa,
          roe,
          nim,
          efficiency_ratio,
          tier1_capital_ratio,
          (total_loans / NULLIF(LAG(total_loans, 1) OVER (PARTITION BY cert_number ORDER BY date), 0) - 1) * 100 AS total_loans_qoq,
          (total_loans / NULLIF(LAG(total_loans, 4) OVER (PARTITION BY cert_number ORDER BY date), 0) - 1) * 100 AS total_loans_yoy,
          (total_deposits / NULLIF(LAG(total_deposits, 1) OVER (PARTITION BY cert_number ORDER BY date), 0) - 1) * 100 AS deposits_qoq,
          (total_deposits / NULLIF(LAG(total_deposits, 4) OVER (PARTITION BY cert_number ORDER BY date), 0) - 1) * 100 AS deposits_yoy,
          roa - LAG(roa, 1) OVER (PARTITION BY cert_number ORDER BY date) AS roa_qoq,
          roa - LAG(roa, 4) OVER (PARTITION BY cert_number ORDER BY date) AS roa_yoy,
          roe - LAG(roe, 1) OVER (PARTITION BY cert_number ORDER BY date) AS roe_qoq,
          roe - LAG(roe, 4) OVER (PARTITION BY cert_number ORDER BY date) AS roe_yoy
        FROM bank_performance
      )
      SELECT *
      FROM bank_trend
      WHERE cert_number = $1
      ORDER BY date DESC
      LIMIT 1
    `, [cert]);

    const latestBank = selectedBankResult.rows[0]
      ? {
          ...selectedBankResult.rows[0],
          bank_name: cleanBankName(selectedBankResult.rows[0].bank_name),
        }
      : null;

    res.json({
      cert,
      latestEconomic,
      gdpSeries: gdpSeriesResult.rows.reverse(),
      selectedBank: latestBank,
      asOf: {
        gdp: latestEconomic?.quarter_end_date || latestEconomic?.date || null,
        bank: latestBank?.date || null,
      },
      frequency: {
        gdp: 'quarterly',
      },
    });
  } catch (err) {
    console.error('Error fetching dashboard metrics:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getBankComparisonSeries(req, res) {
  try {
    const certs = parseCertList(req.query.certs);
    const metric = DASHBOARD_BANK_METRICS.includes(req.query.metric)
      ? req.query.metric
      : 'roa';

    let selectedCerts = certs.slice(0, 8);
    if (!selectedCerts.length) {
      const fallbackResult = await pool.query(`
        SELECT cert_number
        FROM bank_performance
        GROUP BY cert_number
        ORDER BY MAX(date) DESC, cert_number ASC
        LIMIT 6
      `);

      selectedCerts = fallbackResult.rows
        .map((row) => Number(row.cert_number))
        .filter((cert) => Number.isInteger(cert) && cert > 0);
    }

    if (!selectedCerts.length) {
      return res.json({
        metric,
        certs: [],
        series: [],
      });
    }

    const result = await pool.query(`
      SELECT
        cert_number,
        bank_name,
        date,
        ${metric} AS metric_value
      FROM bank_performance
      WHERE cert_number = ANY($1::int[])
        AND ${metric} IS NOT NULL
      ORDER BY cert_number ASC, date ASC
    `, [selectedCerts]);

    const grouped = new Map();

    result.rows.forEach((row) => {
      if (!grouped.has(row.cert_number)) {
        grouped.set(row.cert_number, {
          cert_number: row.cert_number,
          bank_name: cleanBankName(row.bank_name),
          data: [],
        });
      }

      grouped.get(row.cert_number).data.push({
        date: row.date,
        value: row.metric_value,
      });
    });

    res.json({
      metric,
      certs: selectedCerts,
      series: Array.from(grouped.values()),
    });
  } catch (err) {
    console.error('Error fetching bank comparison series:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getBankCompositeScores(req, res) {
  try {
    const profitWeight = parseWeight(req.query.profit_weight, 0.4);
    const growthWeight = parseWeight(req.query.growth_weight, 0.35);
    const capitalWeight = parseWeight(req.query.capital_weight, 0.25);

    const totalWeight = profitWeight + growthWeight + capitalWeight;
    const normalizedWeights = totalWeight > 0
      ? {
          profitWeight: profitWeight / totalWeight,
          growthWeight: growthWeight / totalWeight,
          capitalWeight: capitalWeight / totalWeight,
        }
      : {
          profitWeight: 0.4,
          growthWeight: 0.35,
          capitalWeight: 0.25,
        };

    const result = await pool.query(`
      WITH bank_trend AS (
        SELECT
          cert_number,
          bank_name,
          city,
          state,
          date,
          roa,
          roe,
          tier1_capital_ratio,
          total_loans,
          (total_loans / NULLIF(LAG(total_loans, 4) OVER (PARTITION BY cert_number ORDER BY date), 0) - 1) * 100 AS loans_yoy_growth,
          ROW_NUMBER() OVER (PARTITION BY cert_number ORDER BY date DESC) AS recency_rank
        FROM bank_performance
        WHERE active = true
      ),
      latest AS (
        SELECT
          cert_number,
          bank_name,
          city,
          state,
          date,
          COALESCE(roa, 0) AS roa,
          COALESCE(roe, 0) AS roe,
          COALESCE(tier1_capital_ratio, 0) AS tier1_capital_ratio,
          COALESCE(loans_yoy_growth, 0) AS loans_yoy_growth,
          (COALESCE(roa, 0) * 0.6 + COALESCE(roe, 0) * 0.4) AS profitability_raw,
          COALESCE(loans_yoy_growth, 0) AS growth_raw,
          COALESCE(tier1_capital_ratio, 0) AS capital_raw
        FROM bank_trend
        WHERE recency_rank = 1
      ),
      ranges AS (
        SELECT
          MIN(profitability_raw) AS profitability_min,
          MAX(profitability_raw) AS profitability_max,
          MIN(growth_raw) AS growth_min,
          MAX(growth_raw) AS growth_max,
          MIN(capital_raw) AS capital_min,
          MAX(capital_raw) AS capital_max
        FROM latest
      ),
      scored AS (
        SELECT
          l.cert_number,
          l.bank_name,
          l.city,
          l.state,
          l.date,
          l.roa,
          l.roe,
          l.tier1_capital_ratio,
          l.loans_yoy_growth,
          CASE
            WHEN r.profitability_max = r.profitability_min THEN 50
            ELSE ((l.profitability_raw - r.profitability_min) / NULLIF(r.profitability_max - r.profitability_min, 0)) * 100
          END AS profitability_score,
          CASE
            WHEN r.growth_max = r.growth_min THEN 50
            ELSE ((l.growth_raw - r.growth_min) / NULLIF(r.growth_max - r.growth_min, 0)) * 100
          END AS growth_score,
          CASE
            WHEN r.capital_max = r.capital_min THEN 50
            ELSE ((l.capital_raw - r.capital_min) / NULLIF(r.capital_max - r.capital_min, 0)) * 100
          END AS capital_score
        FROM latest l
        CROSS JOIN ranges r
      )
      SELECT
        cert_number,
        bank_name,
        city,
        state,
        date,
        roa,
        roe,
        tier1_capital_ratio,
        loans_yoy_growth,
        profitability_score,
        growth_score,
        capital_score,
        (
          profitability_score * $1 +
          growth_score * $2 +
          capital_score * $3
        ) AS composite_score
      FROM scored
      ORDER BY composite_score DESC, cert_number ASC
    `, [
      normalizedWeights.profitWeight,
      normalizedWeights.growthWeight,
      normalizedWeights.capitalWeight,
    ]);

    res.json({
      weights: normalizedWeights,
      scoredBanks: result.rows.map((row, index) => ({
        rank: index + 1,
        cert_number: row.cert_number,
        bank_name: cleanBankName(row.bank_name),
        city: row.city,
        state: row.state,
        date: row.date,
        roa: row.roa,
        roe: row.roe,
        tier1_capital_ratio: row.tier1_capital_ratio,
        loans_yoy_growth: row.loans_yoy_growth,
        profitability_score: row.profitability_score,
        growth_score: row.growth_score,
        capital_score: row.capital_score,
        composite_score: row.composite_score,
      })),
    });
  } catch (err) {
    console.error('Error fetching bank composite scores:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getBankCompositeSeries(req, res) {
  try {
    const cert = Number(req.query.cert) || 6560;
    const requestedComponents = parseComponentList(req.query.components);
    const components = requestedComponents.length
      ? requestedComponents
      : ['roa', 'roe', 'total_loans_yoy', 'tier1_capital_ratio'];

    const result = await pool.query(`
      WITH bank_trend AS (
        SELECT
          cert_number,
          bank_name,
          date,
          roa,
          roe,
          nim,
          efficiency_ratio,
          tier1_capital_ratio,
          (total_loans / NULLIF(LAG(total_loans, 4) OVER (PARTITION BY cert_number ORDER BY date), 0) - 1) * 100 AS total_loans_yoy,
          (total_deposits / NULLIF(LAG(total_deposits, 4) OVER (PARTITION BY cert_number ORDER BY date), 0) - 1) * 100 AS total_deposits_yoy,
          (net_income / NULLIF(LAG(net_income, 4) OVER (PARTITION BY cert_number ORDER BY date), 0) - 1) * 100 AS net_income_yoy
        FROM bank_performance
      )
      SELECT
        cert_number,
        bank_name,
        date,
        roa,
        roe,
        nim,
        efficiency_ratio,
        tier1_capital_ratio,
        total_loans_yoy,
        total_deposits_yoy,
        net_income_yoy
      FROM bank_trend
      WHERE cert_number = $1
      ORDER BY date ASC
    `, [cert]);

    if (!result.rows.length) {
      return res.json({
        cert,
        bankName: null,
        components,
        componentLabels: components.map((name) => BANK_COMPOSITE_COMPONENTS[name].label),
        series: [],
        latest: null,
      });
    }

    const ranges = {};
    components.forEach((component) => {
      const values = result.rows
        .map((row) => Number(row[component]))
        .filter((value) => Number.isFinite(value));

      const min = values.length ? Math.min(...values) : null;
      const max = values.length ? Math.max(...values) : null;
      ranges[component] = { min, max };
    });

    const series = result.rows.map((row) => {
      const componentScores = [];

      components.forEach((component) => {
        const value = Number(row[component]);
        const { min, max } = ranges[component];

        if (!Number.isFinite(value) || min === null || max === null) return;

        let score = 50;
        if (max !== min) {
          score = ((value - min) / (max - min)) * 100;
        }

        if (BANK_COMPOSITE_COMPONENTS[component].inverse) {
          score = 100 - score;
        }

        componentScores.push(score);
      });

      const compositeIndex = componentScores.length
        ? componentScores.reduce((sum, value) => sum + value, 0) / componentScores.length
        : null;

      return {
        date: row.date,
        composite_index: compositeIndex,
      };
    });

    const latest = [...series].reverse().find((point) => Number.isFinite(point.composite_index)) || null;

    res.json({
      cert,
      bankName: cleanBankName(result.rows[result.rows.length - 1].bank_name),
      components,
      componentLabels: components.map((name) => BANK_COMPOSITE_COMPONENTS[name].label),
      series,
      latest,
      asOf: latest?.date || null,
    });
  } catch (err) {
    console.error('Error fetching bank composite series:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getBankMetricComposite(req, res) {
  try {
    const cert = Number(req.query.cert) || 6560;
    const requestedPeers = parseCertList(req.query.certs);
    const selectedMetric = Object.prototype.hasOwnProperty.call(BANK_COMPOSITE_METRICS, req.query.metric)
      ? req.query.metric
      : 'total_loans_qoq';
    const asOfInput = normalizeDateInput(req.query.as_of);
    const chartStartInput = normalizeDateInput(req.query.chart_start);
    const chartEndInput = normalizeDateInput(req.query.chart_end);

    const peerCerts = requestedPeers.slice(0, 12);

    const allCerts = Array.from(new Set([cert, ...peerCerts])).filter((value) => Number.isInteger(value) && value > 0);
    const effectivePeers = Array.from(new Set(peerCerts.filter((value) => Number.isInteger(value) && value > 0)));

    if (!allCerts.length) {
      return res.json({
        cert,
        selectedMetric,
        selectedMetricLabel: BANK_COMPOSITE_METRICS[selectedMetric],
        peerCerts: [],
        series: [],
        latest: null,
        defaultMetrics: {},
        asOf: null,
        availableDates: [],
        chartRange: {
          start: null,
          end: null,
        },
      });
    }

    const trendResult = await pool.query(`
      WITH bank_trend AS (
        SELECT
          cert_number,
          bank_name,
          date,
          roa,
          roe,
          nim,
          efficiency_ratio,
          tier1_capital_ratio,
          (total_loans / NULLIF(LAG(total_loans, 1) OVER (PARTITION BY cert_number ORDER BY date), 0) - 1) * 100 AS total_loans_qoq,
          (total_loans / NULLIF(LAG(total_loans, 4) OVER (PARTITION BY cert_number ORDER BY date), 0) - 1) * 100 AS total_loans_yoy,
          roa - LAG(roa, 1) OVER (PARTITION BY cert_number ORDER BY date) AS roa_qoq,
          roa - LAG(roa, 4) OVER (PARTITION BY cert_number ORDER BY date) AS roa_yoy
        FROM bank_performance
      )
      SELECT
        cert_number,
        bank_name,
        date,
        total_loans_qoq,
        total_loans_yoy,
        roa_qoq,
        roa_yoy
      FROM bank_trend
      WHERE cert_number = ANY($1::int[])
      ORDER BY date ASC
    `, [allCerts]);

    const rows = trendResult.rows;
    const rowsByCert = new Map();

    rows.forEach((row) => {
      if (!rowsByCert.has(row.cert_number)) {
        rowsByCert.set(row.cert_number, []);
      }
      rowsByCert.get(row.cert_number).push(row);
    });

    const selectedRows = rowsByCert.get(cert) || [];
    const selectedBankName = selectedRows.length
      ? cleanBankName(selectedRows[selectedRows.length - 1].bank_name)
      : null;

    const availableDates = Array.from(new Set(
      selectedRows
        .map((row) => toDateKey(row.date))
        .filter((value) => value)
    )).sort();

    const resolvedAsOf = (() => {
      if (!availableDates.length) return null;
      if (!asOfInput) return availableDates[availableDates.length - 1];
      if (availableDates.includes(asOfInput)) return asOfInput;

      const notAfter = availableDates.filter((dateValue) => dateValue <= asOfInput);
      if (notAfter.length) return notAfter[notAfter.length - 1];
      return availableDates[0];
    })();

    let chartStart = chartStartInput;
    let chartEnd = chartEndInput;
    if (chartStart && chartEnd && chartStart > chartEnd) {
      [chartStart, chartEnd] = [chartEnd, chartStart];
    }

    const dateToPeerValues = new Map();
    rows.forEach((row) => {
      if (!effectivePeers.includes(row.cert_number)) return;

      const dateKey = toDateKey(row.date);
      if (!dateKey) return;
      const metricValue = Number(row[selectedMetric]);
      if (!Number.isFinite(metricValue)) return;

      if (!dateToPeerValues.has(dateKey)) {
        dateToPeerValues.set(dateKey, []);
      }
      dateToPeerValues.get(dateKey).push(metricValue);
    });

    const fullSeries = selectedRows.map((row) => {
      const dateKey = toDateKey(row.date);
      const selectedValue = Number(row[selectedMetric]);
      const peerValues = dateToPeerValues.get(dateKey) || [];
      const compositeValue = peerValues.length
        ? peerValues.reduce((sum, value) => sum + value, 0) / peerValues.length
        : 0;

      return {
        date: row.date,
        selected_value: Number.isFinite(selectedValue) ? selectedValue : null,
        composite_value: Number.isFinite(compositeValue) ? compositeValue : null,
      };
    });

    const series = fullSeries.filter((point) => {
      const dateKey = toDateKey(point.date);
      if (!dateKey) return false;
      if (chartStart && dateKey < chartStart) return false;
      if (chartEnd && dateKey > chartEnd) return false;
      return true;
    });

    const latest = [...fullSeries].reverse().find((point) => {
      const dateKey = toDateKey(point.date);
      if (!dateKey) return false;
      if (resolvedAsOf && dateKey > resolvedAsOf) return false;
      return Number.isFinite(point.selected_value) || Number.isFinite(point.composite_value);
    }) || null;

    const selectedAsOfRow = resolvedAsOf
      ? [...selectedRows].reverse().find((row) => toDateKey(row.date) === resolvedAsOf) || null
      : (selectedRows[selectedRows.length - 1] || null);
    const defaultMetrics = {};

    Object.keys(BANK_COMPOSITE_METRICS).forEach((metric) => {
      const selectedValue = selectedAsOfRow ? Number(selectedAsOfRow[metric]) : null;

      const peerValuesAtLatest = rows
        .filter((row) =>
          selectedAsOfRow
          && effectivePeers.includes(row.cert_number)
          && toDateKey(row.date) === toDateKey(selectedAsOfRow.date)
        )
        .map((row) => Number(row[metric]))
        .filter((value) => Number.isFinite(value));

      const compositeValue = peerValuesAtLatest.length
        ? peerValuesAtLatest.reduce((sum, value) => sum + value, 0) / peerValuesAtLatest.length
        : 0;

      defaultMetrics[metric] = {
        label: BANK_COMPOSITE_METRICS[metric],
        selected_value: Number.isFinite(selectedValue) ? selectedValue : null,
        composite_value: Number.isFinite(compositeValue) ? compositeValue : 0,
      };
    });

    res.json({
      cert,
      selectedBankName,
      selectedMetric,
      selectedMetricLabel: BANK_COMPOSITE_METRICS[selectedMetric],
      peerCerts: effectivePeers,
      series,
      latest,
      defaultMetrics,
      asOf: resolvedAsOf || toDateKey(latest?.date) || toDateKey(selectedAsOfRow?.date) || null,
      availableDates,
      chartRange: {
        start: chartStart || null,
        end: chartEnd || null,
      },
      weighting: {
        method: 'equal',
        selectedBankWeight: effectivePeers.length ? 1 / effectivePeers.length : null,
      },
    });
  } catch (err) {
    console.error('Error fetching bank metric composite:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getStrategies(req, res) {
  try {
    const strategies = await strategyModel.listStrategies();
    res.json(strategies);
  } catch (err) {
    console.error('Error fetching strategies:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getStrategyById(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Invalid strategy ID' });
    }

    const strategy = await strategyModel.getStrategy(id);
    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    res.json(strategy);
  } catch (err) {
    console.error('Error fetching strategy:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function resolveUserIdFromInput(userInput) {
  const rawValue = String(userInput || '').trim();
  if (!rawValue) return null;

  const numericId = Number(rawValue);
  if (Number.isInteger(numericId) && numericId > 0) {
    return numericId;
  }

  const username = rawValue.slice(0, 50);

  const existingResult = await pool.query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
    [username]
  );

  if (existingResult.rows[0]?.id) {
    return Number(existingResult.rows[0].id);
  }

  const emailBase = username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '') || 'user';

  const email = `${emailBase}.${Date.now()}@banknotes.local`;

  const createdUserResult = await pool.query(`
    INSERT INTO users (username, email, password_hash)
    VALUES ($1, $2, $3)
    ON CONFLICT (username)
    DO UPDATE SET username = EXCLUDED.username
    RETURNING id
  `, [username, email, 'bank_notes_placeholder']);

  return Number(createdUserResult.rows[0]?.id) || null;
}

async function createStrategy(req, res) {
  try {
    const {
      user_id,
      strategy_name,
      description,
      risk_tolerance,
      min_expected_return,
      max_risk_threshold,
    } = req.body;

    if (!user_id || !strategy_name) {
      return res.status(400).json({
        error: 'Required fields: user_id, strategy_name',
      });
    }

    const resolvedUserId = await resolveUserIdFromInput(user_id);
    if (!resolvedUserId) {
      return res.status(400).json({
        error: 'Invalid user_id value',
      });
    }

    const created = await strategyModel.createStrategy({
      userId: resolvedUserId,
      strategyName: strategy_name,
      description,
      riskTolerance: risk_tolerance,
      minExpectedReturn: min_expected_return,
      maxRiskThreshold: max_risk_threshold,
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('Error creating strategy:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateStrategy(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Invalid strategy ID' });
    }

    const {
      strategy_name,
      description,
      risk_tolerance,
      min_expected_return,
      max_risk_threshold,
    } = req.body;

    const updated = await strategyModel.updateStrategy(id, {
      strategyName: strategy_name,
      description,
      riskTolerance: risk_tolerance,
      minExpectedReturn: min_expected_return,
      maxRiskThreshold: max_risk_threshold,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    res.json(updated);
  } catch (err) {
    console.error('Error updating strategy:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteStrategy(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Invalid strategy ID' });
    }

    const deleted = await strategyModel.deleteStrategy(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    res.status(204).send();
  } catch (err) {
    console.error('Error deleting strategy:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  getEconomicData,
  getBankPerformanceByCert,
  getCorrelationData,
  getDashboardMetrics,
  getBankComparisonSeries,
  getBankCompositeScores,
  getBankCompositeSeries,
  getBankMetricComposite,
  getStrategies,
  getStrategyById,
  createStrategy,
  updateStrategy,
  deleteStrategy,
};
