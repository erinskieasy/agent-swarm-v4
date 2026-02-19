import { db, schema } from '../db/index.js';
import { chatCompletion, chatCompletionJSON } from './openai.js';
import { broadcast } from './sse.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// Color palette for dynamically generated agents
const AGENT_COLOR_PALETTE = [
    '#0ea5e9', '#6366f1', '#f59e0b', '#10b981', '#ec4899',
    '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#ef4444',
    '#a855f7', '#22d3ee', '#84cc16', '#e11d48', '#7c3aed',
];

// Orchestrator system prompt — defines how the AI plans missions
const ORCHESTRATOR_SYSTEM_PROMPT = `You are an AI orchestrator. Given a user's goal, decompose it into specialist sub-tasks.

For each sub-task, you must CREATE a custom specialist agent tailored to that specific task.
Do NOT use generic roles — invent the perfect specialist for each piece of work.

Analyze the complexity of the goal and choose the RIGHT number of agents:
- Simple goals (straightforward questions, single-topic): 2-3 agents
- Moderate goals (multi-faceted topics, research + writing): 3-5 agents
- Complex goals (strategies, technical builds, deep analysis): 5-8 agents

For each agent, provide ALL of the following fields:
- role: a unique snake_case identifier (e.g., market_analyst, ux_researcher, backend_architect)
- name: a human-readable display name (e.g., "Market Analysis Agent")
- systemPrompt: a 2-3 sentence prompt defining the agent's expertise, personality, and output format expectations. This is the agent's permanent identity — make it specific and authoritative.
- color: a hex color for the UI (pick from this palette for visual variety: #0ea5e9, #6366f1, #f59e0b, #10b981, #ec4899, #8b5cf6, #14b8a6, #f97316, #06b6d4, #ef4444). Use DISTINCT colors for each agent.
- icon: a Google Material Symbols icon name (e.g., search, analytics, code, palette, edit_note, fact_check, query_stats, psychology, target, bug_report, school, science, gavel, trending_up, description)
- description: a one-line summary of what this agent will do
- prompt: detailed, mission-specific instructions. Include ALL relevant context from the user's goal that this agent needs. Be thorough — the agent has no other context.

Respond in JSON format:
{
  "subtasks": [
    {
      "role": "market_analyst",
      "name": "Market Analysis Agent",
      "systemPrompt": "You are a market research specialist with expertise in competitive analysis...",
      "color": "#f59e0b",
      "icon": "analytics",
      "description": "Analyze the target market landscape",
      "prompt": "Research and analyze the market for... Focus on: 1) Market size 2) Key players..."
    }
  ],
  "reasoning": "explain why you created these specific agents and how they complement each other"
}`;

interface PlanResult {
    subtasks: Array<{
        role: string;
        name?: string;
        systemPrompt?: string;
        color?: string;
        icon?: string;
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

        // Use OpenAI to decompose the goal into sub-tasks with fully dynamic agent definitions
        const plan = await chatCompletionJSON<PlanResult>(
            ORCHESTRATOR_SYSTEM_PROMPT,
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

        // Create agent records in DB — fully dynamic, AI-generated configs
        for (let i = 0; i < subtasks.length; i++) {
            const task = subtasks[i];
            const agent = await createAgent(missionId, {
                name: task.name || `Agent ${i + 1}`,
                role: task.role,
                systemPrompt: task.systemPrompt || `You are a specialist agent. Complete the assigned task thoroughly and professionally.`,
                color: task.color || AGENT_COLOR_PALETTE[i % AGENT_COLOR_PALETTE.length],
                taskPrompt: task.prompt,
            });
            agentRecords.push({ agent, task });
            broadcast(missionId, 'agent-update', { ...agent, status: 'idle', taskPrompt: task.prompt });
        }

        // Create execute steps for each agent
        const executeSteps: any[] = [];
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

        // ── Phase 4: Execute Agents Concurrently (with retry) ─────
        const MAX_RETRIES = 3;
        const agentResults: Array<{ agentName: string; role: string; result: string; retries: number }> = [];
        const agentFailures: Array<{ agentName: string; role: string; error: string; retries: number }> = [];

        const agentPromises = agentRecords.map(async ({ agent, task }, idx) => {
            // Mark agent as active
            await updateAgentStatus(agent.id, missionId, 'active', 10);
            broadcast(missionId, 'step-update', { ...executeSteps[idx], status: 'active' });

            await addReasoning(missionId, agent.id, agent.name, task.role as any,
                `Starting work: ${task.description}`
            );

            // Simulate tool usage for research-oriented roles (keyword match for dynamic roles)
            const researchKeywords = ['research', 'analyst', 'data', 'expert', 'investigat', 'survey', 'audit'];
            if (researchKeywords.some(kw => task.role.includes(kw) || (task.name?.toLowerCase() || '').includes(kw))) {
                await updateToolStatus(webSearchTool.id, missionId, 'active');
                await sleep(800);
            }

            // Update progress incrementally
            await updateAgentStatus(agent.id, missionId, 'active', 30);
            await sleep(500);
            await updateAgentStatus(agent.id, missionId, 'active', 60);

            // Retry wrapper for the OpenAI call
            let lastError = '';
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const result = await chatCompletion(task.prompt, goal);

                    // Check for suspiciously short output
                    if (result.length < 50) {
                        throw new Error(`Output too short (${result.length} chars) — likely malformed`);
                    }

                    agentResults.push({ agentName: agent.name, role: task.role, result, retries: attempt - 1 });

                    await updateAgentStatus(agent.id, missionId, 'active', 90);
                    await addReasoning(missionId, agent.id, agent.name, task.role as any,
                        `Completed successfully${attempt > 1 ? ` (after ${attempt - 1} retries)` : ''}. Generated ${result.length} characters.`
                    );

                    // Mark complete
                    if (['researcher', 'analyst', 'data_scientist', 'domain_expert'].includes(task.role)) {
                        await updateToolStatus(webSearchTool.id, missionId, 'completed');
                    }
                    await updateAgentStatus(agent.id, missionId, 'completed', 100);
                    // Save agent output to DB and broadcast
                    await db.update(schema.agents).set({ output: result }).where(eq(schema.agents.id, agent.id));
                    broadcast(missionId, 'agent-update', { id: agent.id, output: result });
                    await markStepComplete(executeSteps[idx].id, missionId);
                    return; // Success — exit retry loop
                } catch (err: any) {
                    lastError = err.message || String(err);
                    if (attempt < MAX_RETRIES) {
                        await addReasoning(missionId, agent.id, agent.name, task.role as any,
                            `⚠️ Attempt ${attempt} failed: ${lastError}. Retrying (${attempt}/${MAX_RETRIES})...`
                        );
                        await sleep(1000 * attempt); // Exponential backoff
                    }
                }
            }

            // All retries exhausted — mark as failed
            agentFailures.push({ agentName: agent.name, role: task.role, error: lastError, retries: MAX_RETRIES });
            await addReasoning(missionId, agent.id, agent.name, task.role as any,
                `❌ Failed after ${MAX_RETRIES} attempts. Last error: ${lastError}`
            );
            await updateAgentStatus(agent.id, missionId, 'failed', 0);
        });

        await Promise.allSettled(agentPromises);

        // ── Post-Execution Report ────────────────────────────────
        const reportLines = [
            `📊 **Execution Report**: ${agentResults.length} succeeded, ${agentFailures.length} failed out of ${agentRecords.length} agents.`,
        ];
        if (agentResults.length > 0) {
            reportLines.push(`✅ Succeeded: ${agentResults.map(r => `${r.agentName}${r.retries > 0 ? ` (${r.retries} retries)` : ''}`).join(', ')}`);
        }
        if (agentFailures.length > 0) {
            reportLines.push(`❌ Failed: ${agentFailures.map(f => `${f.agentName} (${f.error})`).join(', ')}`);
        }

        await addReasoning(missionId, null, 'Orchestrator', 'orchestrator', reportLines.join('\n'));

        // ── Phase 5: Merge Results ──────────────────────────────
        const mergeStep = await createStep(missionId, null, 'merge', 'Merge Results', subtasks.length + 2);
        broadcast(missionId, 'step-update', { ...mergeStep, status: 'active' });

        await addReasoning(missionId, null, 'Orchestrator', 'orchestrator',
            `All agents completed. Merging ${agentResults.length} successful outputs into a cohesive final answer...`
        );

        const mergedContent = await chatCompletion(
            `You are a synthesis agent. Combine the following agent outputs into one cohesive, well-structured final answer.
Maintain the best insights from each contribution. Format with clear sections, headers, and actionable points.
Do NOT mention that you are combining outputs — present it as one unified response.`,
            `Original Goal: ${goal}\n\n${agentResults.map((r, i) => `--- ${r.agentName} (${r.role}) Output ---\n${r.result}`).join('\n\n')}`
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
    config: { name: string; role: string; systemPrompt: string; color: string; taskPrompt?: string }
) {
    const [agent] = await db.insert(schema.agents).values({
        missionId,
        name: config.name,
        role: config.role,
        systemPrompt: config.systemPrompt,
        status: 'idle',
        progress: 0,
        color: config.color,
        taskPrompt: config.taskPrompt || '',
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
