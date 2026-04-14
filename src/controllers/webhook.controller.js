import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as calcomService from "../services/calcom.service.js";
import * as vagaroService from "../services/vagaro.service.js";

/**
 * Cal.com webhook handler
 * Events: BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED
 */
export const handleCalcomWebhook = asyncHandler(async (req, res) => {
  const event = req.body;

  // TODO: Verify Cal.com webhook signature when secret is configured
  console.log(`[Webhook] Cal.com event received: ${event.triggerEvent}`);

  await calcomService.processWebhookEvent(event);

  res.status(200).json(new ApiResponse(200, null, "Webhook processed"));
});

/**
 * Vagaro webhook handler
 * Events: customer.created, customer.updated, employee.created, employee.updated, transaction.created
 */
export const handleVagaroWebhook = asyncHandler(async (req, res) => {
  const { eventType, payload } = req.body;

  console.log(`[Webhook] Vagaro event received: ${eventType}`);

  await vagaroService.processWebhookEvent(eventType, payload);

  res.status(200).json(new ApiResponse(200, null, "Webhook processed"));
});

/**
 * Stripe webhook handler — stub for future use
 */
export const handleStripeWebhook = asyncHandler(async (req, res) => {
  // Stripe billing is not part of MVP
  console.log("[Webhook] Stripe event received — not processed (post-MVP)");
  res.status(200).json(new ApiResponse(200, null, "Webhook received"));
});
