const pool = require('../config/connection');

const HARD_CODED_COMPOSITE_BANK_ORDER = [628, 3510, 7213, 3511, 6548, 4297, 33124, 18409, 6560];
const DEFAULT_PRIMARY_BANK_CERT = 6560;
const DEFAULT_COMPOSITE_CERTS = new Set([628, 3510, 7213, 3511]);
const API_ENDPOINTS = [
  'GET /api/economic-data',
  'GET /api/bank-performance/:cert',
  'GET /api/correlation',
  'GET /api/dashboard-metrics',
  'GET /api/bank-comparison-series',
  'GET /api/bank-composite-scores',
  'GET /api/bank-composite-series',
  'GET /api/bank-metric-composite',
  'GET /api/strategies',
  'GET /api/strategies/:id',
  'POST /api/strategies',
  'PUT /api/strategies/:id',
  'DELETE /api/strategies/:id',
];

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

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function norm(vector) {
  return Math.sqrt(dot(vector, vector));
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

function powerIteration(matrix, seed = null, iterations = 80, orthogonalTo = null) {
  const size = matrix.length;
  let vector = seed ? [...seed] : Array.from({ length: size }, (_, index) => 1 + index * 0.1);

  for (let iter = 0; iter < iterations; iter += 1) {
    let next = multiplyMatrixVector(matrix, vector);

    if (orthogonalTo) {
      const projection = dot(next, orthogonalTo);
      next = next.map((value, index) => value - projection * orthogonalTo[index]);
    }

    const length = norm(next) || 1;
    vector = next.map((value) => value / length);
  }

  return vector;
}

function computePca2D(rows, featureKeys) {
  const matrix = rows.map((row) => featureKeys.map((key) => Number(row[key])));
  const rowCount = matrix.length;
  const colCount = featureKeys.length;

  if (rowCount < 2 || colCount < 2) {
    return null;
  }

  const means = Array.from({ length: colCount }, (_, col) =>
    matrix.reduce((sum, row) => sum + row[col], 0) / rowCount
  );

  const stds = Array.from({ length: colCount }, (_, col) => {
    const variance = matrix.reduce((sum, row) => {
      const diff = row[col] - means[col];
      return sum + diff * diff;
    }, 0) / Math.max(1, rowCount - 1);
    return Math.sqrt(variance) || 1;
  });

  const standardized = matrix.map((row) => row.map((value, col) => (value - means[col]) / stds[col]));

  const covariance = Array.from({ length: colCount }, (_, i) =>
    Array.from({ length: colCount }, (_, j) =>
      standardized.reduce((sum, row) => sum + row[i] * row[j], 0) / Math.max(1, rowCount - 1)
    )
  );

  const pc1 = powerIteration(covariance);
  const lambda1 = dot(pc1, multiplyMatrixVector(covariance, pc1));
  const deflated = covariance.map((row, i) =>
    row.map((value, j) => value - lambda1 * pc1[i] * pc1[j])
  );
  const pc2 = powerIteration(deflated, null, 80, pc1);

  const projections = standardized.map((row) => ({
    pc1: dot(row, pc1),
    pc2: dot(row, pc2),
  }));

  return projections;
}

async function getBankPerformancePage(req, res) {
  try {
    const banksResult = await pool.query(`
      SELECT DISTINCT ON (cert_number)
        cert_number,
        bank_name,
        city,
        state,
           date,
           total_deposits
      FROM bank_performance
      WHERE active = true
      ORDER BY cert_number, date DESC
    `);

    const banksWithData = banksResult.rows.map((bank) => {
      const cleanedName = cleanBankName(bank.bank_name);

      return {
        cert_number: Number(bank.cert_number),
        bank_name: cleanedName,
        city: bank.city,
        state: bank.state,
        total_deposits: Number(bank.total_deposits),
        is_default_composite: DEFAULT_COMPOSITE_CERTS.has(Number(bank.cert_number)),
      };
    });

    const banks = [...banksWithData].sort((a, b) =>
      a.bank_name.localeCompare(b.bank_name)
    );

    const orderIndex = new Map(HARD_CODED_COMPOSITE_BANK_ORDER.map((cert, index) => [cert, index]));
    const compositeBanks = [...banksWithData].sort((a, b) => {
      const indexA = orderIndex.has(a.cert_number) ? orderIndex.get(a.cert_number) : Number.MAX_SAFE_INTEGER;
      const indexB = orderIndex.has(b.cert_number) ? orderIndex.get(b.cert_number) : Number.MAX_SAFE_INTEGER;

      if (indexA !== indexB) {
        return indexA - indexB;
      }

      return a.bank_name.localeCompare(b.bank_name);
    });

    const defaultCert = banks.some((bank) => bank.cert_number === DEFAULT_PRIMARY_BANK_CERT)
      ? DEFAULT_PRIMARY_BANK_CERT
      : banks[0]?.cert_number;
    const selectedCert = null;
    const performanceCert = defaultCert;

    let performanceData = [];
    if (performanceCert) {
      const perfResult = await pool.query(`
        SELECT
          date,
          total_assets,
          total_deposits,
          total_loans,
          net_income,
          roa,
          roe,
          nim,
          efficiency_ratio,
          tier1_capital_ratio
        FROM bank_performance
        WHERE cert_number = $1
        ORDER BY date DESC
        LIMIT 20
      `, [performanceCert]);

      performanceData = perfResult.rows;
    }

    const comparisonResult = await pool.query(`
      SELECT DISTINCT ON (cert_number)
        cert_number,
        bank_name,
        city,
        state,
        date,
        roa,
        roe,
        nim,
        total_assets
      FROM bank_performance
      WHERE active = true
      ORDER BY cert_number, date DESC
    `);

    const comparison = comparisonResult.rows.map((bank) => ({
      ...bank,
      bank_name: cleanBankName(bank.bank_name),
    }));

    res.render('bank-performance', {
      isBank: true,
      banks,
      compositeBanks,
      availableBankCount: banks.length,
      selectedCert,
      performanceData,
      performanceDataJson: JSON.stringify(performanceData || []),
      comparison,
    });
  } catch (err) {
    console.error('Error fetching bank performance data:', err);
    res.status(500).send('Server error');
  }
}

async function getEconomicPerformancePage(req, res) {
  try {
    res.render('economic-performance', {
      isEconomic: true,
    });
  } catch (err) {
    console.error('Error loading economic performance page:', err);
    res.status(500).send('Server error');
  }
}

async function getAboutPage(req, res) {
  try {
    const [
      bankRowsResult,
      economicRowsResult,
      strategyRowsResult,
      bankColumnsResult,
      economicColumnsResult,
      latestBankDateResult,
      latestEconomicDateResult,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM bank_performance'),
      pool.query('SELECT COUNT(*)::int AS count FROM economic_data'),
      pool.query('SELECT COUNT(*)::int AS count FROM lending_strategies'),
      pool.query(`
        SELECT COUNT(*)::int AS count
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'bank_performance'
      `),
      pool.query(`
        SELECT COUNT(*)::int AS count
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'economic_data'
      `),
      pool.query('SELECT MAX(date)::date AS date FROM bank_performance'),
      pool.query('SELECT MAX(date)::date AS date FROM economic_data'),
    ]);

    const telemetry = req.app?.locals?.apiTelemetry || { totalCalls: 0, lastApiCallAt: null };
    const lastApiCallAt = telemetry.lastApiCallAt
      ? new Date(telemetry.lastApiCallAt).toLocaleString('en-US')
      : 'Not tracked yet in this server session';

    const aboutMetrics = {
      apiCount: API_ENDPOINTS.length,
      bankRows: bankRowsResult.rows[0]?.count ?? 0,
      economicRows: economicRowsResult.rows[0]?.count ?? 0,
      strategyRows: strategyRowsResult.rows[0]?.count ?? 0,
      bankColumns: bankColumnsResult.rows[0]?.count ?? 0,
      economicColumns: economicColumnsResult.rows[0]?.count ?? 0,
      latestBankDate: latestBankDateResult.rows[0]?.date || null,
      latestEconomicDate: latestEconomicDateResult.rows[0]?.date || null,
      totalApiCalls: telemetry.totalCalls || 0,
      lastApiCallAt,
    };

    res.render('about', {
      isAbout: true,
      aboutMetrics,
      apiEndpoints: API_ENDPOINTS,
    });
  } catch (err) {
    console.error('Error loading about page:', err);
    res.status(500).send('Server error');
  }
}

async function getStrategiesPage(req, res) {
  try {
    const strategiesResult = await pool.query(`
      SELECT
        ls.id,
        ls.user_id,
        COALESCE(
          NULLIF(TRIM(u.username), ''),
          CASE
            WHEN ls.user_id IS NOT NULL THEN CONCAT('User ', ls.user_id::text)
            ELSE 'Unknown User'
          END
        ) AS user_name,
        ls.strategy_name,
        ls.description,
        ls.risk_tolerance,
        ls.min_expected_return,
        ls.max_risk_threshold,
        ls.created_at,
        ls.updated_at
      FROM lending_strategies ls
      LEFT JOIN users u ON u.id = ls.user_id
      ORDER BY ls.created_at DESC
    `);

    res.render('strategies', {
      isStrategies: true,
      strategies: strategiesResult.rows,
      strategiesJson: JSON.stringify(strategiesResult.rows || []),
    });
  } catch (err) {
    console.error('Error loading strategies page:', err);
    res.status(500).send('Server error');
  }
}

async function getMethodologyPage(req, res) {
  try {
    const methodologySteps = [
      'Define capstone questions around bank segmentation and next-period ROA forecasting.',
      'Load and validate FDIC-derived bank data and FRED-derived macroeconomic data from PostgreSQL.',
      'Clean and align data at the month level, then engineer lag and change features for modeling.',
      'Build a baseline linear regression model, then test robust preprocessing with train-only winsorization.',
      'Compare model families (Random Forest, tuned RF, XGBoost, Prophet) using holdout metrics.',
      'Run KMeans clustering with scaling, silhouette scoring, and PCA for bank profile segmentation.',
      'Evaluate model quality, inspect overfitting gaps, and summarize limitations and recommendations.',
    ];

    const keyFindings = [
      'Best holdout forecast model: winsorized linear regression (RMSE 0.3531, MAE 0.2429, R² 0.0357).',
      'Random Forest variants were slightly worse than the winsorized linear baseline on holdout.',
      'XGBoost and Prophet showed larger train-vs-test performance gaps, indicating overfitting in this setup.',
      'Best cluster count by silhouette score was k=3, producing three distinct peer groups.',
      'Clusters are useful for peer benchmarking and strategy context, not as standalone risk labels.',
    ];

    const clusterSummary = [
      {
        name: 'Cluster 0',
        banks: 'Bank of America, Citibank, JPMorgan Chase, Wells Fargo',
      },
      {
        name: 'Cluster 1',
        banks: 'Capital One, TD Bank',
      },
      {
        name: 'Cluster 2',
        banks: 'Goldman Sachs Bank, Huntington National Bank, U.S. Bank',
      },
    ];

    const modelComparison = [
      { model: 'Winsorized Linear', rmse: 0.3531 },
      { model: 'Random Forest', rmse: 0.3604 },
      { model: 'Tuned RF', rmse: 0.3685 },
      { model: 'XGBoost', rmse: 0.4195 },
      { model: 'Prophet', rmse: 0.5409 },
    ];

    const maxRmse = Math.max(...modelComparison.map((item) => item.rmse));
    const rmseChart = {
      width: 520,
      height: 240,
      leftPad: 150,
      topPad: 20,
      rightPad: 20,
      barHeight: 24,
      rowGap: 14,
      bars: modelComparison.map((item, index) => {
        const y = 20 + index * (24 + 14);
        const plotWidth = 520 - 150 - 20;
        const barWidth = Math.max(6, Math.round((item.rmse / maxRmse) * plotWidth));

        return {
          ...item,
          y,
          valueX: 150 + barWidth + 8,
          barWidth,
          labelY: y + 16,
        };
      }),
      axisX1: 150,
      axisY1: 220,
      axisX2: 500,
      axisY2: 220,
      axisXText: 250,
      axisYText: 236,
    };

    const clusterByBank = {
      'Bank of America': 'Cluster 0',
      Citibank: 'Cluster 0',
      'JPMorgan Chase': 'Cluster 0',
      'Wells Fargo': 'Cluster 0',
      'Capital One': 'Cluster 1',
      'TD Bank': 'Cluster 1',
      'Goldman Sachs': 'Cluster 2',
      Huntington: 'Cluster 2',
      'U.S. Bank': 'Cluster 2',
    };

    const clusterColors = {
      'Cluster 0': '#2563eb',
      'Cluster 1': '#16a34a',
      'Cluster 2': '#f59e0b',
      Unknown: '#6b7280',
    };

    const clusterSnapshotResult = await pool.query(`
      SELECT DISTINCT ON (cert_number)
        cert_number,
        bank_name,
        roa,
        nim,
        roe,
        efficiency_ratio,
        tier1_capital_ratio
      FROM bank_performance
      WHERE active = true
        AND roa IS NOT NULL
        AND nim IS NOT NULL
        AND roe IS NOT NULL
        AND efficiency_ratio IS NOT NULL
        AND tier1_capital_ratio IS NOT NULL
      ORDER BY cert_number, date DESC
    `);

    const rawClusterPoints = clusterSnapshotResult.rows
      .map((row) => {
        const bankName = cleanBankName(row.bank_name);
        const cluster = clusterByBank[bankName] || 'Unknown';
        const roa = Number(row.roa);
        const nim = Number(row.nim);

        if (!Number.isFinite(roa) || !Number.isFinite(nim)) {
          return null;
        }

        return {
          bankName,
          cluster,
          roa,
          nim,
          roe: Number(row.roe),
          efficiency_ratio: Number(row.efficiency_ratio),
          tier1_capital_ratio: Number(row.tier1_capital_ratio),
          color: clusterColors[cluster] || clusterColors.Unknown,
        };
      })
      .filter(Boolean);

    const fallbackPoints = [
      {
        bankName: 'JPMorgan Chase', cluster: 'Cluster 0', roa: 1.1, nim: 2.8, roe: 12.5, efficiency_ratio: 58, tier1_capital_ratio: 12.1,
        color: clusterColors['Cluster 0'],
      },
      {
        bankName: 'Bank of America', cluster: 'Cluster 0', roa: 1.0, nim: 2.6, roe: 11.4, efficiency_ratio: 60, tier1_capital_ratio: 11.8,
        color: clusterColors['Cluster 0'],
      },
      {
        bankName: 'Citibank', cluster: 'Cluster 0', roa: 0.9, nim: 2.4, roe: 10.8, efficiency_ratio: 63, tier1_capital_ratio: 12.3,
        color: clusterColors['Cluster 0'],
      },
      {
        bankName: 'Wells Fargo', cluster: 'Cluster 0', roa: 0.95, nim: 2.7, roe: 11.0, efficiency_ratio: 61, tier1_capital_ratio: 11.9,
        color: clusterColors['Cluster 0'],
      },
      {
        bankName: 'Capital One', cluster: 'Cluster 1', roa: 1.2, nim: 3.1, roe: 13.2, efficiency_ratio: 54, tier1_capital_ratio: 11.1,
        color: clusterColors['Cluster 1'],
      },
      {
        bankName: 'TD Bank', cluster: 'Cluster 1', roa: 1.05, nim: 2.95, roe: 12.7, efficiency_ratio: 56, tier1_capital_ratio: 11.4,
        color: clusterColors['Cluster 1'],
      },
      {
        bankName: 'Goldman Sachs', cluster: 'Cluster 2', roa: 0.8, nim: 2.1, roe: 9.5, efficiency_ratio: 67, tier1_capital_ratio: 13.0,
        color: clusterColors['Cluster 2'],
      },
      {
        bankName: 'Huntington', cluster: 'Cluster 2', roa: 1.15, nim: 3.0, roe: 12.2, efficiency_ratio: 57, tier1_capital_ratio: 11.6,
        color: clusterColors['Cluster 2'],
      },
      {
        bankName: 'U.S. Bank', cluster: 'Cluster 2', roa: 1.0, nim: 2.75, roe: 11.6, efficiency_ratio: 59, tier1_capital_ratio: 11.7,
        color: clusterColors['Cluster 2'],
      },
    ];

    const clusterPointsSource = rawClusterPoints.length ? rawClusterPoints : fallbackPoints;

    const clusteringFeatures = ['roa', 'roe', 'nim', 'efficiency_ratio', 'tier1_capital_ratio'];
    const pcaProjections = computePca2D(clusterPointsSource, clusteringFeatures);

    const clusterPointsWithPca = clusterPointsSource.map((point, index) => ({
      ...point,
      pc1: pcaProjections?.[index]?.pc1 ?? index,
      pc2: pcaProjections?.[index]?.pc2 ?? 0,
    }));

    const scatter = {
      width: 520,
      height: 300,
      leftPad: 60,
      rightPad: 20,
      topPad: 20,
      bottomPad: 46,
    };

    const xValues = clusterPointsWithPca.map((point) => point.pc1);
    const yValues = clusterPointsWithPca.map((point) => point.pc2);

    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const xPad = xRange * 0.12;
    const yPad = yRange * 0.14;

    const xMinPadded = xMin - xPad;
    const xMaxPadded = xMax + xPad;
    const yMinPadded = yMin - yPad;
    const yMaxPadded = yMax + yPad;

    const plotWidth = scatter.width - scatter.leftPad - scatter.rightPad;
    const plotHeight = scatter.height - scatter.topPad - scatter.bottomPad;

    const safeScale = (value, min, max) => {
      if (max === min) return 0.5;
      return (value - min) / (max - min);
    };

    const clusterScatterPoints = clusterPointsWithPca.map((point) => {
      const nx = safeScale(point.pc1, xMinPadded, xMaxPadded);
      const ny = safeScale(point.pc2, yMinPadded, yMaxPadded);

      return {
        ...point,
        x: Math.round(scatter.leftPad + nx * plotWidth),
        y: Math.round(scatter.topPad + (1 - ny) * plotHeight),
      };
    });

    const tickCount = 4;
    const xTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const t = i / tickCount;
      const value = xMinPadded + t * (xMaxPadded - xMinPadded);
      return {
        value: value.toFixed(2),
        x: Math.round(scatter.leftPad + t * plotWidth),
      };
    });

    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const t = i / tickCount;
      const value = yMaxPadded - t * (yMaxPadded - yMinPadded);
      return {
        value: value.toFixed(2),
        y: Math.round(scatter.topPad + t * plotHeight),
      };
    });

    const clusterLegend = ['Cluster 0', 'Cluster 1', 'Cluster 2'].map((name) => ({
      name,
      color: clusterColors[name],
    }));

    res.render('methodology-analysis', {
      isMethodology: true,
      methodologySteps,
      keyFindings,
      clusterSummary,
      rmseChart,
      clusterScatter: {
        ...scatter,
        axisX1: scatter.leftPad,
        axisY1: scatter.height - scatter.bottomPad,
        axisX2: scatter.width - scatter.rightPad,
        axisY2: scatter.height - scatter.bottomPad,
        axisYX2: scatter.leftPad,
        axisYY2: scatter.topPad,
        xTitleX: Math.round(scatter.leftPad + plotWidth / 2) - 18,
        xTitleY: scatter.height - 10,
        yTitleX: 8,
        yTitleY: Math.round(scatter.topPad + plotHeight / 2),
        points: clusterScatterPoints,
        xTicks,
        yTicks,
      },
      clusterLegend,
    });
  } catch (err) {
    console.error('Error loading methodology page:', err);
    res.status(500).send('Server error');
  }
}

module.exports = {
  getBankPerformancePage,
  getEconomicPerformancePage,
  getAboutPage,
  getStrategiesPage,
  getMethodologyPage,
};
