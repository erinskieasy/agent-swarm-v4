import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import missionsRouter from './routes/missions.js';
import eventsRouter from './routes/events.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/missions', missionsRouter);
app.use('/events', eventsRouter);

// Serve static files in production
const clientPath = path.resolve(__dirname, '../dist/client');
app.use(express.static(clientPath));
app.get('*', (_req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Mission Control server running on port ${PORT}`);
});

export default app;
