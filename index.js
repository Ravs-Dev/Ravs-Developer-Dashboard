import express from 'express';
import dashboardApp from './server/index.js';

// Vercel's Express framework detector requires the deployment entrypoint
// itself to import Express and export an Express application.
// The application routes and middleware remain centralized in server/index.js.
const app = express();
app.use(dashboardApp);

export default app;
