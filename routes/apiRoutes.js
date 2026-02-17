const express = require('express');
const apiController = require('../controllers/apiController');

const router = express.Router();

router.get('/economic-data', apiController.getEconomicData);
router.get('/bank-performance/:cert', apiController.getBankPerformanceByCert);
router.get('/correlation', apiController.getCorrelationData);
router.get('/dashboard-metrics', apiController.getDashboardMetrics);
router.get('/bank-comparison-series', apiController.getBankComparisonSeries);
router.get('/bank-composite-scores', apiController.getBankCompositeScores);
router.get('/bank-composite-series', apiController.getBankCompositeSeries);
router.get('/bank-metric-composite', apiController.getBankMetricComposite);

router.get('/strategies', apiController.getStrategies);
router.get('/strategies/:id', apiController.getStrategyById);
router.post('/strategies', apiController.createStrategy);
router.put('/strategies/:id', apiController.updateStrategy);
router.delete('/strategies/:id', apiController.deleteStrategy);

module.exports = router;
