const express = require('express');
const router = express.Router();

// TODO: Import weight log controller

/**
 * @route   GET /api/v1/weight-logs
 * @desc    Get all weight logs
 * @access  Private
 */
// router.get('/', weightLogController.getAllWeightLogs);

/**
 * @route   GET /api/v1/weight-logs/:id
 * @desc    Get weight log by ID
 * @access  Private
 */
// router.get('/:id', weightLogController.getWeightLogById);

/**
 * @route   POST /api/v1/weight-logs
 * @desc    Create a new weight log
 * @access  Private
 */
// router.post('/', weightLogController.createWeightLog);

/**
 * @route   PUT /api/v1/weight-logs/:id
 * @desc    Update weight log
 * @access  Private
 */
// router.put('/:id', weightLogController.updateWeightLog);

/**
 * @route   DELETE /api/v1/weight-logs/:id
 * @desc    Delete weight log
 * @access  Private
 */
// router.delete('/:id', weightLogController.deleteWeightLog);

module.exports = router;
