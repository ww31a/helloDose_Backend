const express = require('express');
const router = express.Router();

// TODO: Import program controller

/**
 * @route   GET /api/v1/programs
 * @desc    Get all programs
 * @access  Private
 */
// router.get('/', programController.getAllPrograms);

/**
 * @route   GET /api/v1/programs/:id
 * @desc    Get program by ID
 * @access  Private
 */
// router.get('/:id', programController.getProgramById);

/**
 * @route   POST /api/v1/programs
 * @desc    Create a new program
 * @access  Private
 */
// router.post('/', programController.createProgram);

/**
 * @route   PUT /api/v1/programs/:id
 * @desc    Update program
 * @access  Private
 */
// router.put('/:id', programController.updateProgram);

/**
 * @route   DELETE /api/v1/programs/:id
 * @desc    Delete program
 * @access  Private
 */
// router.delete('/:id', programController.deleteProgram);

module.exports = router;
