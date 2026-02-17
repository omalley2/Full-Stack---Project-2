const express = require('express');
const homeController = require('../controllers/homeController');

const router = express.Router();

router.get('/', (req, res) => res.redirect('/bank-performance'));
router.get('/bank-performance', homeController.getBankPerformancePage);
router.get('/us-economic-performance', homeController.getEconomicPerformancePage);
router.get('/about', homeController.getAboutPage);
router.get('/strategies', homeController.getStrategiesPage);
router.get('/methodology-analysis', homeController.getMethodologyPage);

module.exports = router;
