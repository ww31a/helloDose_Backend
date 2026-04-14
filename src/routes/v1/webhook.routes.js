import { Router } from "express";
import * as webhookController from "../../controllers/webhook.controller.js";

const router = Router();

// POST /api/v1/webhooks/calcom
router.post("/calcom", webhookController.handleCalcomWebhook);

// POST /api/v1/webhooks/vagaro
router.post("/vagaro", webhookController.handleVagaroWebhook);

// POST /api/v1/webhooks/stripe
router.post("/stripe", webhookController.handleStripeWebhook);

export default router;
