import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as calcomService from "../services/calcom.service.js";
import * as vagaroService from "../services/vagaro.service.js";
import logger from "../utils/logger.js";

/**
 * POST /api/v1/webhooks/vagaro
 *
 * Single endpoint — Vagaro sends all event types here.
 * Acknowledge FIRST (res.sendStatus(200)) before any async work.
 * Vagaro retries if it doesn't get a fast 200.
 */
export const handleVagaroWebhook = asyncHandler(async (req, res) => {
  console.log("🔥 VAGARO WEBHOOK HIT", new Date().toISOString(), req.body?.type, req.body?.action);

  // Acknowledge immediately
  res.sendStatus(200);

  const event = `${req.body.type}.${req.body.action}`;
  const data = req.body.payload;
  console.log("RAW WEBHOOK:", JSON.stringify(req.body, null, 2));

  // ✅ Wrap post-response work in its own try/catch — NEVER let it throw to Express
  try {
    switch (event) {
      case "appointment.created":
      case "appointment.updated":
        await vagaroService.handleAppointmentEvent(data);
        break;
      case "appointment.deleted":
        await vagaroService.handleAppointmentDeleted(data);
        break;
      case "customer.created":
      case "customer.updated":
        await vagaroService.handleCustomerEvent(data);
        break;
      case "employee.created":
      case "employee.updated":
        await vagaroService.handleEmployeeEvent(data);
        break;
      case "form_response": {
        const formName = data?.formName ?? "";
        if (formName.toLowerCase().includes("weight loss intake")) {
          await vagaroService.handleWeightLossIntakeForm(data);
        } else if (
          formName.toLowerCase().includes("drop") ||
          formName.toLowerCase().includes("virtual consultation")
        ) {
          await vagaroService.handleDropConsultationForm(data);
        } else {
          logger.warn(`[Vagaro] form_response — unrecognized form: "${formName}"`);
        }
        break;
      }
      default:
        logger.warn(`[Vagaro] Unhandled event: ${event}`);
    }
  } catch (err) {
    // Log it, but NEVER re-throw — response is already sent
    logger.error(`[Vagaro] Post-ack processing error for event "${event}": ${err.message}`, err);
  }
});

/**
 * POST /api/v1/webhooks/calcom
 *
 * Cal.com booking lifecycle events.
 * Respond first, then process.
 */
export const handleCalcomWebhook = asyncHandler(async (req, res) => {
  // Acknowledge immediately
  res.status(200).json(new ApiResponse(200, null, "Webhook received"));

  const event = req.body;
  logger.info(`[Webhook] Cal.com event received: ${event.triggerEvent}`);

  await calcomService.processCalcomWebhook(event);
});

/**
 * POST /api/v1/webhooks/stripe
 * Post-MVP — stub only.
 */
export const handleStripeWebhook = asyncHandler(async (req, res) => {
  logger.info("[Webhook] Stripe event received — not processed (post-MVP)");
  res.status(200).json(new ApiResponse(200, null, "Webhook received"));
});
