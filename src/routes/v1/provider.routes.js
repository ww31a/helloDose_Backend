const express = require('express');
const router = express.Router();

// TODO: Import provider controller

/**
 * @route   GET /api/v1/providers
 * @desc    Get all providers
 * @access  Private
 */
// router.get('/', providerController.getAllProviders);

/**
 * @route   GET /api/v1/providers/:id
 * @desc    Get provider by ID
 * @access  Private
 */
// router.get('/:id', providerController.getProviderById);

/**
 * @route   POST /api/v1/providers
 * @desc    Create a new provider
 * @access  Private
 */
// router.post('/', providerController.createProvider);

/**
 * @route   PUT /api/v1/providers/:id
 * @desc    Update provider
 * @access  Private
 */
// router.put('/:id', providerController.updateProvider);

/**
 * @route   DELETE /api/v1/providers/:id
 * @desc    Delete provider
 * @access  Private
 */
// router.delete('/:id', providerController.deleteProvider);

module.exports = router;
