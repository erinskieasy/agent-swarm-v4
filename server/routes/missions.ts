import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { runMission } from '../services/orchestrator.js';

const router = Router();

// Create and start a new mission
router.post('/', async (req, res) => {
    try {
        const { goal } = req.body;

        if (!goal || typeof goal !== 'string') {
            return res.status(400).json({ error: 'A goal is required' });
        }

        const [mission] = await db.insert(schema.missions).values({
            goal,
            status: 'planning',
        }).returning();

        // Fire-and-forget: start orchestration in background
        runMission(mission.id, goal).catch((err) => {
            console.error(`Mission ${mission.id} failed:`, err);
        });

        res.json(mission);
    } catch (error: any) {
        console.error('Failed to create mission:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get mission by ID with all related data
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const mission = await db.query.missions.findFirst({
            where: eq(schema.missions.id, id),
        });

        if (!mission) {
            return res.status(404).json({ error: 'Mission not found' });
        }

        const [agentsList, stepsList, logsList, toolsList, resultsList] = await Promise.all([
            db.query.agents.findMany({ where: eq(schema.agents.missionId, id) }),
            db.query.steps.findMany({ where: eq(schema.steps.missionId, id) }),
            db.query.reasoningLogs.findMany({ where: eq(schema.reasoningLogs.missionId, id) }),
            db.query.toolsUsed.findMany({ where: eq(schema.toolsUsed.missionId, id) }),
            db.query.missionResults.findMany({ where: eq(schema.missionResults.missionId, id) }),
        ]);

        res.json({
            mission,
            agents: agentsList,
            steps: stepsList,
            reasoningLogs: logsList,
            toolsUsed: toolsList,
            results: resultsList,
        });
    } catch (error: any) {
        console.error('Failed to get mission:', error);
        res.status(500).json({ error: error.message });
    }
});

// List all missions
router.get('/', async (_req, res) => {
    try {
        const allMissions = await db.query.missions.findMany({
            orderBy: (missions, { desc }) => [desc(missions.createdAt)],
        });
        res.json(allMissions);
    } catch (error: any) {
        console.error('Failed to list missions:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
