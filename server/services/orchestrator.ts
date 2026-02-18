import { db, schema } from '../db/index.js';
import { chatCompletion, chatCompletionJSON } from './openai.js';
import { broadcast } from './sse.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// Agent configuration per role
const AGENT_CONFIGS: Record<string, { name: string; color: string; systemPrompt: string }> = {
    researcher: {
        name: 'Research Agent',
        color: '#0ea5e9',
        systemPrompt: `You are a meticulous research agent. Your job is to research the given topic thoroughly.
Provide well-sourced, factual information. Include specific data points, statistics, and cite sources when possible.
Format your response clearly with sections and bullet points.`,
    },
    writer: {
        name: 'Writer Agent',
        color: '#6366f1',
        systemPrompt: `You are a skilled writing agent. Your job is to take research findings and craft compelling, clear content.
Write in a professional yet engaging tone. Structure the content logically with headers and sections.
Focus on clarity and actionable recommendations.`,
    },
    reviewer: {
        name: 'Review Agent',
        color: '#195de6',
        systemPrompt: `You are a critical review agent. Your job is to check the work of other agents for accuracy, completeness, and quality.
Verify claims, identify gaps, and suggest improvements. Provide a confidence score for the overall output.
Be constructive and specific in your feedback.`,
    },
};

interface PlanResult {
    subtasks: Array<{
        role: string;
        description: string;
        prompt: string;
    }>;
    reasoning: string;
}

// Utility to pause execution
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMission(missionId: string, goal: string): Promise<void> {
    try {
        // ── Phase 1: Understanding ──────────────────────────────
        await updateMissionStatus(missionId, 'planning');
        broadcast(missionId, 'mission-update', { id: missionId, status: 'planning' });

        // Create the "Understand Request" step
        const understandStep = await createStep(missionId, null, 'understand', 'Analyze Request', 0);
        broadcast(missionId, 'step-update', { ...understandStep, status: 'active' });

        await addReasoning(missionId, null, 'Orchestrator', 'orchestrator',
            `Received mission: "${goal}". Analyzing the request to determine what specialist agents are needed...`
        );

        await sleep(1000);

        // ── Phase 2: Planning ───────────────────────────────────
        const planStep = await createStep(missionId, null, 'plan', 'Create Plan', 1);
        await markStepComplete(understandStep.id, missionId);
        broadcast(missionId, 'step-update', { ...planStep, status: 'active' });

        // Use OpenAI to decompose the goal into sub-tasks
        const plan = await chatCompletionJSON<PlanResult>(
            `You are an AI orchestrator. Given a user's goal, decompose it into 2-3 specialist sub-tasks.
Each sub-task should be assigned to one of these roles: researcher, writer, reviewer.
Respond in JSON format:
{
  "subtasks": [
    { "role": "researcher", "description": "short description", "prompt": "detailed prompt for the agent" },
    { "role": "writer", "description": "short description", "prompt": "detailed prompt for the agent" }
  ],
  "reasoning": "explain why you chose this decomposition"
}`,
            goal
        );

        await addReasoning(missionId, null, 'Orchestrator', 'orchestrator',
            plan.reasoning || `Decomposed the mission into ${plan.subtasks?.length || 0} specialist sub-tasks.`
        );

        await markStepComplete(planStep.id, missionId);

        // ── Phase 3: Spawn Agents ────────────────────────────────
        await updateMissionStatus(missionId, 'executing');
        broadcast(missionId, 'mission-update', { id: missionId, status: 'executing' });

        const subtasks = plan.subtasks || [];
        const agentRecords = [];

        // Create agent records in DB
        for (const task of subtasks) {
            const config = AGENT_CONFIGS[task.role] || AGENT_CONFIGS.researcher;
            const agent = await createAgent(missionId, {
                name: config.name,
                role: task.role,
                systemPrompt: config.systemPrompt,
                color: config.color,
            });
            agentRecords.push({ agent, task });
            broadcast(missionId, 'agent-update', { ...agent, status: 'idle' });
        }

        // Create execute steps for each agent
        const executeSteps = [];
        for (let i = 0; i < agentRecords.length; i++) {
            const step = await createStep(
                missionId,
                agentRecords[i].agent.id,
                'execute',
                agentRecords[i].task.description,
                i + 2
            );
            executeSteps.push(step);
            broadcast(missionId, 'step-update', { ...step, status: 'pending' });
        }

        // Register tools
        const webSearchTool = await registerTool(missionId, null, 'Web Search');
        const dataAnalysisTool = await registerTool(missionId, null, 'Data Analysis');

        // ── Phase 4: Execute Agents Concurrently ─────────────────
        const agentResults: string[] = [];

        const agentPromises = agentRecords.map(async ({ agent, task }, idx) => {
            // Mark agent as active
            await updateAgentStatus(agent.id, missionId, 'active', 10);
            broadcast(missionId, 'step-update', { ...executeSteps[idx], status: 'active' });

            await addReasoning(missionId, agent.id, agent.name, task.role as any,
                `Starting work: ${task.description}`
            );

            // Simulate tool usage for researcher
            if (task.role === 'researcher') {
                await updateToolStatus(webSearchTool.id, missionId, 'active');
                await sleep(800);
            }

            // Update progress incrementally
            await updateAgentStatus(agent.id, missionId, 'active', 30);
            await sleep(500);
            await updateAgentStatus(agent.id, missionId, 'active', 60);

            // Call OpenAI
            const result = await chatCompletion(task.prompt, goal);
            agentResults.push(result);

            await updateAgentStatus(agent.id, missionId, 'active', 90);

            await addReasoning(missionId, agent.id, agent.name, task.role as any,
                `Completed analysis. Generated ${result.length} characters of output.`
            );

            // Mark complete
            if (task.role === 'researcher') {
                await updateToolStatus(webSearchTool.id, missionId, 'completed');
            }

            await updateAgentStatus(agent.id, missionId, 'completed', 100);
            await markStepComplete(executeSteps[idx].id, missionId);
        });

        await Promise.all(agentPromises);

        // ── Phase 5: Merge Results ──────────────────────────────
        const mergeStep = await createStep(missionId, null, 'merge', 'Merge Results', subtasks.length + 2);
        broadcast(missionId, 'step-update', { ...mergeStep, status: 'active' });

        await addReasoning(missionId, null, 'Orchestrator', 'orchestrator',
            `All agents completed. Merging ${agentResults.length} outputs into a cohesive final answer...`
        );

        const mergedContent = await chatCompletion(
            `You are a synthesis agent. Combine the following agent outputs into one cohesive, well-structured final answer.
Maintain the best insights from each contribution. Format with clear sections, headers, and actionable points.
Do NOT mention that you are combining outputs — present it as one unified response.`,
            `Original Goal: ${goal}\n\n${agentResults.map((r, i) => `--- Agent ${i + 1} Output ---\n${r}`).join('\n\n')}`
        );

        await markStepComplete(mergeStep.id, missionId);

        // ── Phase 6: Final Output ────────────────────────────────
        const outputStep = await createStep(missionId, null, 'output', 'Final Output', subtasks.length + 3);
        broadcast(missionId, 'step-update', { ...outputStep, status: 'active' });

        // Create reasoning summary
        const reasoningSummary = await chatCompletion(
            'Summarize the reasoning process in 2-3 sentences. Explain how the agents collaborated.',
            `Goal: ${goal}\nAgents used: ${agentRecords.map(a => a.agent.name).join(', ')}\nPlan reasoning: ${plan.reasoning}`
        );

        // Store final result
        const result = await db.insert(schema.missionResults).values({
            missionId,
            content: mergedContent,
            sources: ['OpenAI Analysis', 'Market Research', 'Expert Review'],
            reasoningSummary,
            agentsInvolved: agentRecords.map(a => a.agent.name),
        }).returning();

        broadcast(missionId, 'result', result[0]);
        await markStepComplete(outputStep.id, missionId);

        // Mark mission complete
        await updateMissionStatus(missionId, 'completed');
        broadcast(missionId, 'mission-update', { id: missionId, status: 'completed' });

        await addReasoning(missionId, null, 'Orchestrator', 'orchestrator',
            'Mission completed successfully. All results have been synthesized and delivered.'
        );

    } catch (error: any) {
        console.error('Mission failed:', error);
        await updateMissionStatus(missionId, 'failed');
        broadcast(missionId, 'error', { message: error.message });
        await addReasoning(missionId, null, 'System', 'orchestrator',
            `Mission failed: ${error.message}`
        );
    }
}

// ─── Helper Functions ──────────────────────────────────────────

async function updateMissionStatus(missionId: string, status: string) {
    await db.update(schema.missions)
        .set({ status })
        .where(eq(schema.missions.id, missionId));
}

async function createStep(missionId: string, agentId: string | null, type: string, label: string, order: number) {
    const [step] = await db.insert(schema.steps).values({
        missionId,
        agentId,
        type,
        label,
        status: 'pending',
        order,
    }).returning();
    return step;
}

async function markStepComplete(stepId: string, missionId: string) {
    await db.update(schema.steps)
        .set({ status: 'completed' })
        .where(eq(schema.steps.id, stepId));
    broadcast(missionId, 'step-update', { id: stepId, status: 'completed' });
}

async function createAgent(
    missionId: string,
    config: { name: string; role: string; systemPrompt: string; color: string }
) {
    const [agent] = await db.insert(schema.agents).values({
        missionId,
        name: config.name,
        role: config.role,
        systemPrompt: config.systemPrompt,
        status: 'idle',
        progress: 0,
        color: config.color,
    }).returning();
    return agent;
}

async function updateAgentStatus(agentId: string, missionId: string, status: string, progress: number) {
    await db.update(schema.agents)
        .set({ status, progress })
        .where(eq(schema.agents.id, agentId));
    broadcast(missionId, 'agent-update', { id: agentId, status, progress });
}

async function addReasoning(
    missionId: string,
    agentId: string | null,
    agentName: string,
    agentRole: string,
    content: string,
    sources: string[] = []
) {
    const [log] = await db.insert(schema.reasoningLogs).values({
        missionId,
        agentId,
        content,
        sources,
    }).returning();
    broadcast(missionId, 'reasoning', { ...log, agentName, agentRole });
}

async function registerTool(missionId: string, agentId: string | null, toolName: string) {
    const [tool] = await db.insert(schema.toolsUsed).values({
        missionId,
        agentId,
        toolName,
        status: 'idle',
        data: {},
    }).returning();
    broadcast(missionId, 'tool-update', tool);
    return tool;
}

async function updateToolStatus(toolId: string, missionId: string, status: string) {
    await db.update(schema.toolsUsed)
        .set({ status })
        .where(eq(schema.toolsUsed.id, toolId));
    broadcast(missionId, 'tool-update', { id: toolId, status });
}
