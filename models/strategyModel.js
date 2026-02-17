const pool = require('../config/connection');

async function listStrategies() {
  const result = await pool.query(`
    SELECT
      id,
      user_id,
      strategy_name,
      description,
      risk_tolerance,
      min_expected_return,
      max_risk_threshold,
      created_at,
      updated_at
    FROM lending_strategies
    ORDER BY created_at DESC
  `);

  return result.rows;
}

async function getStrategy(id) {
  const result = await pool.query(`
    SELECT
      id,
      user_id,
      strategy_name,
      description,
      risk_tolerance,
      min_expected_return,
      max_risk_threshold,
      created_at,
      updated_at
    FROM lending_strategies
    WHERE id = $1
  `, [id]);

  return result.rows[0] || null;
}

async function createStrategy(strategy) {
  const {
    userId,
    strategyName,
    description,
    riskTolerance,
    minExpectedReturn,
    maxRiskThreshold,
  } = strategy;

  const result = await pool.query(`
    INSERT INTO lending_strategies (
      user_id,
      strategy_name,
      description,
      risk_tolerance,
      min_expected_return,
      max_risk_threshold
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      id,
      user_id,
      strategy_name,
      description,
      risk_tolerance,
      min_expected_return,
      max_risk_threshold,
      created_at,
      updated_at
  `, [
    userId,
    strategyName,
    description || null,
    riskTolerance || null,
    minExpectedReturn ?? null,
    maxRiskThreshold ?? null,
  ]);

  return result.rows[0];
}

async function updateStrategy(id, strategy) {
  const {
    strategyName,
    description,
    riskTolerance,
    minExpectedReturn,
    maxRiskThreshold,
  } = strategy;

  const result = await pool.query(`
    UPDATE lending_strategies
    SET
      strategy_name = COALESCE($2, strategy_name),
      description = COALESCE($3, description),
      risk_tolerance = COALESCE($4, risk_tolerance),
      min_expected_return = COALESCE($5, min_expected_return),
      max_risk_threshold = COALESCE($6, max_risk_threshold),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING
      id,
      user_id,
      strategy_name,
      description,
      risk_tolerance,
      min_expected_return,
      max_risk_threshold,
      created_at,
      updated_at
  `, [
    id,
    strategyName,
    description,
    riskTolerance,
    minExpectedReturn,
    maxRiskThreshold,
  ]);

  return result.rows[0] || null;
}

async function deleteStrategy(id) {
  const result = await pool.query(`
    DELETE FROM lending_strategies
    WHERE id = $1
    RETURNING id
  `, [id]);

  return result.rows[0] || null;
}

module.exports = {
  listStrategies,
  getStrategy,
  createStrategy,
  updateStrategy,
  deleteStrategy,
};
