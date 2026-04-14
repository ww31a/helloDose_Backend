const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const patientRoutes = require('./patient.routes');
const providerRoutes = require('./provider.routes');
const appointmentRoutes = require('./appointment.routes');
const weightLogRoutes = require('./weightLog.routes');
const injectionLogRoutes = require('./injectionLog.routes');
const chatRoutes = require('./chat.routes');
const programRoutes = require('./program.routes');
const webhookRoutes = require('./webhook.routes');

router.use('/auth', authRoutes);
router.use('/patients', patientRoutes);
router.use('/providers', providerRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/weight-logs', weightLogRoutes);
router.use('/injection-logs', injectionLogRoutes);
router.use('/chat', chatRoutes);
router.use('/programs', programRoutes);
router.use('/webhooks', webhookRoutes);

module.exports = router;
