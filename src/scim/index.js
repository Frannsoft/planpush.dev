import express from 'express';
import SCIMMY from 'scimmy';
import SCIMMYRouters from 'scimmy-routers';
import { scimAuth } from '../middleware/scimAuth.js';
import { scimUsersHandler } from './users.js';

const router = express.Router();

// Declare SCIM User resource with our handlers
SCIMMY.Resources.declare(SCIMMY.Resources.User, scimUsersHandler);

// Create SCIMMY Routers middleware with bearer token authentication
const scimmyRouters = new SCIMMYRouters({
  type: 'bearer',
  handler: (request) => {
    // Authentication is already done by scimAuth middleware,
    // so just return a placeholder user ID
    return 'scim_provisioner';
  },
});

// Apply SCIM auth middleware first
router.use(scimAuth);

// Mount SCIMMY routers
router.use(scimmyRouters);

export { router as scimRouter };
