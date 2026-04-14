const express = require('express');
const router = express.Router();

// TODO: Import patient controller

/**
 * @route   GET /api/v1/patients
 * @desc    Get all patients
 * @access  Private
 */
// router.get('/', patientController.getAllPatients);

/**
 * @route   GET /api/v1/patients/:id
 * @desc    Get patient by ID
 * @access  Private
 */
// router.get('/:id', patientController.getPatientById);

/**
 * @route   POST /api/v1/patients
 * @desc    Create a new patient
 * @access  Private
 */
// router.post('/', patientController.createPatient);

/**
 * @route   PUT /api/v1/patients/:id
 * @desc    Update patient
 * @access  Private
 */
// router.put('/:id', patientController.updatePatient);

/**
 * @route   DELETE /api/v1/patients/:id
 * @desc    Delete patient
 * @access  Private
 */
// router.delete('/:id', patientController.deletePatient);

module.exports = router;
