const express = require('express');
const router = express.Router();

// TODO: Import appointment controller

/**
 * @route   GET /api/v1/appointments
 * @desc    Get all appointments
 * @access  Private
 */
// router.get('/', appointmentController.getAllAppointments);

/**
 * @route   GET /api/v1/appointments/:id
 * @desc    Get appointment by ID
 * @access  Private
 */
// router.get('/:id', appointmentController.getAppointmentById);

/**
 * @route   POST /api/v1/appointments
 * @desc    Create a new appointment
 * @access  Private
 */
// router.post('/', appointmentController.createAppointment);

/**
 * @route   PUT /api/v1/appointments/:id
 * @desc    Update appointment
 * @access  Private
 */
// router.put('/:id', appointmentController.updateAppointment);

/**
 * @route   DELETE /api/v1/appointments/:id
 * @desc    Cancel appointment
 * @access  Private
 */
// router.delete('/:id', appointmentController.deleteAppointment);

module.exports = router;
