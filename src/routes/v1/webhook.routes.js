const express = require('express');
const router = express.Router();

// TODO: Import webhook controller

/**
 * @route   POST /api/v1/webhooks/calcom
 * @desc    Handle Cal.com webhook events
 * @access  Public
 */
// router.post('/calcom', webhookController.handleCalcomWebhook);

/**
 * @route   POST /api/v1/webhooks/vagaro
 * @desc    Handle Vagaro webhook events
 * @access  Public
 */
// router.post('/vagaro', webhookController.handleVagaroWebhook);

/**
 * @route   POST /api/v1/webhooks/stripe
 * @desc    Handle Stripe webhook events
 * @access  Public
 */
// router.post('/stripe', webhookController.handleStripeWebhook);

module.exports = router;
