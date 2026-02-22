import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { startInterpretation, refineInterpretation, approveInterpretation, followUpInterpretation } from '../services/interpreter.js';

const router = Router();

// Create and start a new mission (now starts with interpretation)
router.post('/', async (req, res) => {
    try {
        const { goal } = req.body;

        if (!goal || typeof goal !== 'string') {
            return res.status(400).json({ error: 'A goal is required' });
        }

        const [mission] = await db.insert(schema.missions).values({
            goal,
            status: 'interpreting',
        }).returning();

        // Fire-and-forget: start interpretation loop in background
        startInterpretation(mission.id, goal).catch((err) => {
            console.error(`Interpretation for mission ${mission.id} failed:`, err);
        });

        res.json(mission);
    } catch (error: any) {
        console.error('Failed to create mission:', error);
        res.status(500).json({ error: error.message });
    }
});

// Approve interpretation → hand off to orchestrator
router.post('/:id/interpret/approve', async (req, res) => {
    try {
        const { id } = req.params;
        approveInterpretation(id).catch((err) => {
            console.error(`Approval failed for mission ${id}:`, err);
        });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Failed to approve interpretation:', error);
        res.status(500).json({ error: error.message });
    }
});

// Refine interpretation with user feedback
router.post('/:id/interpret/refine', async (req, res) => {
    try {
        const { id } = req.params;
        const { feedback } = req.body;

        if (!feedback || typeof feedback !== 'string') {
            return res.status(400).json({ error: 'Feedback is required' });
        }

        refineInterpretation(id, feedback).catch((err) => {
            console.error(`Refinement failed for mission ${id}:`, err);
        });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Failed to refine interpretation:', error);
        res.status(500).json({ error: error.message });
    }
});

// Follow-up: re-enter interpretation loop with synthesized output + user question
router.post('/:id/follow-up', async (req, res) => {
    try {
        const { id } = req.params;
        const { question } = req.body;

        if (!question || typeof question !== 'string') {
            return res.status(400).json({ error: 'A follow-up question is required' });
        }

        followUpInterpretation(id, question).catch((err) => {
            console.error(`Follow-up failed for mission ${id}:`, err);
        });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Failed to process follow-up:', error);
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

        const [agentsList, stepsList, logsList, toolsList, resultsList, interpretationsList] = await Promise.all([
            db.query.agents.findMany({ where: eq(schema.agents.missionId, id) }),
            db.query.steps.findMany({ where: eq(schema.steps.missionId, id) }),
            db.query.reasoningLogs.findMany({ where: eq(schema.reasoningLogs.missionId, id) }),
            db.query.toolsUsed.findMany({ where: eq(schema.toolsUsed.missionId, id) }),
            db.query.missionResults.findMany({ where: eq(schema.missionResults.missionId, id) }),
            db.query.interpretations.findMany({
                where: eq(schema.interpretations.missionId, id),
                orderBy: (interp, { desc }) => [desc(interp.iteration)],
            }),
        ]);

        res.json({
            mission,
            agents: agentsList,
            steps: stepsList,
            reasoningLogs: logsList,
            toolsUsed: toolsList,
            results: resultsList,
            interpretations: interpretationsList,
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
