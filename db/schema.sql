-- Drop existing tables if they exist
DROP TABLE IF EXISTS alert_settings CASCADE;
DROP TABLE IF EXISTS performance_records CASCADE;
DROP TABLE IF EXISTS scenario_allocations CASCADE;
DROP TABLE IF EXISTS saved_scenarios CASCADE;
DROP TABLE IF EXISTS portfolio_allocations CASCADE;
DROP TABLE IF EXISTS lending_strategies CASCADE;
DROP TABLE IF EXISTS bank_performance CASCADE;
DROP TABLE IF EXISTS economic_data CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Economic data table (FRED data)
CREATE TABLE economic_data (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    
    -- Delinquency Rates
    delinq_cc DECIMAL(10,4),           -- Credit Card Delinquency Rate
    delinq_mortgage DECIMAL(10,4),      -- Mortgage Delinquency Rate
    delinq_consumer DECIMAL(10,4),      -- Consumer Loan Delinquency Rate
    
    -- Interest Rates
    fed_funds_rate DECIMAL(10,4),       -- Federal Funds Rate
    prime_rate DECIMAL(10,4),           -- Prime Loan Rate
    mortgage_30y DECIMAL(10,4),         -- 30-Year Mortgage Rate
    treasury_10y DECIMAL(10,4),         -- 10-Year Treasury Rate
    treasury_2y DECIMAL(10,4),          -- 2-Year Treasury Rate
    
    -- Economic Indicators
    unemployment_rate DECIMAL(10,4),    -- Unemployment Rate
    gdp_growth DECIMAL(10,4),           -- GDP Growth Rate
    cpi DECIMAL(10,4),                  -- Consumer Price Index
    housing_starts DECIMAL(15,2),       -- Housing Starts (thousands)
    personal_income DECIMAL(15,2),      -- Personal Income (billions)
    consumer_sentiment DECIMAL(10,2),   -- Consumer Sentiment Index
    
    -- Banking Metrics
    net_interest_margin DECIMAL(10,4),  -- Bank Net Interest Margin
    
    -- Engineered Features
    yield_curve DECIMAL(10,4),          -- 10Y - 2Y Treasury Spread
    
    -- Lagged Features (1, 3, 6 months)
    unemployment_lag1 DECIMAL(10,4),
    unemployment_lag3 DECIMAL(10,4),
    unemployment_lag6 DECIMAL(10,4),
    fed_funds_lag1 DECIMAL(10,4),
    fed_funds_lag3 DECIMAL(10,4),
    fed_funds_lag6 DECIMAL(10,4),
    gdp_growth_lag1 DECIMAL(10,4),
    gdp_growth_lag3 DECIMAL(10,4),
    gdp_growth_lag6 DECIMAL(10,4),
    
    -- Rate Changes
    fed_funds_change DECIMAL(10,4),
    unemployment_change DECIMAL(10,4),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bank performance table (FDIC data)
CREATE TABLE bank_performance (
    id SERIAL PRIMARY KEY,
    cert_number INTEGER NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    
    -- Financial Metrics
    total_assets DECIMAL(20,2),         -- In thousands
    total_deposits DECIMAL(20,2),       -- In thousands
    total_loans DECIMAL(20,2),          -- In thousands
    net_income DECIMAL(20,2),           -- In thousands
    equity_capital DECIMAL(20,2),       -- In thousands
    
    -- Performance Ratios
    roa DECIMAL(10,4),                  -- Return on Assets (%)
    roe DECIMAL(10,4),                  -- Return on Equity (%)
    nim DECIMAL(10,4),                  -- Net Interest Margin (%)
    efficiency_ratio DECIMAL(10,4),     -- Efficiency Ratio (%)
    tier1_capital_ratio DECIMAL(10,4),  -- Tier 1 Capital Ratio (%)
    
    -- Location
    city VARCHAR(100),
    state VARCHAR(2),
    
    -- Status
    active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cert_number, date)
);

-- Lending strategies table
CREATE TABLE lending_strategies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    strategy_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Strategy parameters
    risk_tolerance VARCHAR(20) CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
    min_expected_return DECIMAL(10,4),
    max_risk_threshold DECIMAL(10,4),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portfolio allocations table
CREATE TABLE portfolio_allocations (
    id SERIAL PRIMARY KEY,
    strategy_id INTEGER REFERENCES lending_strategies(id) ON DELETE CASCADE,
    
    -- Loan type allocations (as percentages)
    credit_card_allocation DECIMAL(5,2) CHECK (credit_card_allocation >= 0 AND credit_card_allocation <= 100),
    mortgage_allocation DECIMAL(5,2) CHECK (mortgage_allocation >= 0 AND mortgage_allocation <= 100),
    consumer_loan_allocation DECIMAL(5,2) CHECK (consumer_loan_allocation >= 0 AND consumer_loan_allocation <= 100),
    commercial_allocation DECIMAL(5,2) CHECK (commercial_allocation >= 0 AND commercial_allocation <= 100),
    
    -- Economic condition context
    created_for_date DATE,
    unemployment_at_creation DECIMAL(10,4),
    fed_funds_at_creation DECIMAL(10,4),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure allocations sum to 100%
    CONSTRAINT total_allocation_100 CHECK (
        credit_card_allocation + mortgage_allocation + 
        consumer_loan_allocation + commercial_allocation = 100
    )
);

-- Saved scenarios table
CREATE TABLE saved_scenarios (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    scenario_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Economic scenario parameters
    unemployment_scenario DECIMAL(10,4),
    gdp_growth_scenario DECIMAL(10,4),
    fed_funds_scenario DECIMAL(10,4),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scenario allocations table (links scenarios to portfolio allocations)
CREATE TABLE scenario_allocations (
    id SERIAL PRIMARY KEY,
    scenario_id INTEGER REFERENCES saved_scenarios(id) ON DELETE CASCADE,
    allocation_id INTEGER REFERENCES portfolio_allocations(id) ON DELETE CASCADE,
    
    -- Predicted outcomes
    predicted_return DECIMAL(10,4),
    predicted_risk DECIMAL(10,4),
    confidence_interval_low DECIMAL(10,4),
    confidence_interval_high DECIMAL(10,4),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance records table (backtesting results)
CREATE TABLE performance_records (
    id SERIAL PRIMARY KEY,
    strategy_id INTEGER REFERENCES lending_strategies(id) ON DELETE CASCADE,
    
    -- Performance metrics
    test_date DATE NOT NULL,
    actual_return DECIMAL(10,4),
    predicted_return DECIMAL(10,4),
    mae DECIMAL(10,4),                  -- Mean Absolute Error
    rmse DECIMAL(10,4),                 -- Root Mean Squared Error
    sharpe_ratio DECIMAL(10,4),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alert settings table
CREATE TABLE alert_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    -- Alert thresholds
    delinquency_threshold DECIMAL(10,4),
    unemployment_threshold DECIMAL(10,4),
    rate_change_threshold DECIMAL(10,4),
    
    -- Alert preferences
    email_alerts BOOLEAN DEFAULT true,
    alert_frequency VARCHAR(20) CHECK (alert_frequency IN ('immediate', 'daily', 'weekly')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_economic_data_date ON economic_data(date);
CREATE INDEX idx_bank_performance_cert ON bank_performance(cert_number);
CREATE INDEX idx_bank_performance_date ON bank_performance(date);
CREATE INDEX idx_bank_performance_cert_date ON bank_performance(cert_number, date);
CREATE INDEX idx_lending_strategies_user ON lending_strategies(user_id);
CREATE INDEX idx_portfolio_allocations_strategy ON portfolio_allocations(strategy_id);
CREATE INDEX idx_saved_scenarios_user ON saved_scenarios(user_id);
CREATE INDEX idx_performance_records_strategy ON performance_records(strategy_id);
CREATE INDEX idx_alert_settings_user ON alert_settings(user_id);
