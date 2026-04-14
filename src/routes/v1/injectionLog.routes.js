const express = require('express');
const router = express.Router();

// TODO: Import injection log controller

/**
 * @route   GET /api/v1/injection-logs
 * @desc    Get all injection logs
 * @access  Private
 */
// router.get('/', injectionLogController.getAllInjectionLogs);

/**
 * @route   GET /api/v1/injection-logs/:id
 * @desc    Get injection log by ID
 * @access  Private
 */
// router.get('/:id', injectionLogController.getInjectionLogById);

/**
 * @route   POST /api/v1/injection-logs
 * @desc    Create a new injection log
 * @access  Private
 */
// router.post('/', injectionLogController.createInjectionLog);

/**
 * @route   PUT /api/v1/injection-logs/:id
 * @desc    Update injection log
 * @access  Private
 */
// router.put('/:id', injectionLogController.updateInjectionLog);

/**
 * @route   DELETE /api/v1/injection-logs/:id
 * @desc    Delete injection log
 * @access  Private
 */
// router.delete('/:id', injectionLogController.deleteInjectionLog);

module.exports = router;
