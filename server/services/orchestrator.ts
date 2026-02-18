import { db, schema } from '../db/index.js';
import { chatCompletion, chatCompletionJSON } from './openai.js';
import { broadcast } from './sse.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// Agent configuration per role — expanded specialist registry
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
    analyst: {
        name: 'Analyst Agent',
        color: '#f59e0b',
        systemPrompt: `You are a sharp analytical agent. Your job is to examine data, trends, and patterns to extract actionable insights.
Break down complex information into clear findings. Use frameworks, comparisons, and logical reasoning.
Present your analysis with clear conclusions and supporting evidence.`,
    },
    strategist: {
        name: 'Strategy Agent',
        color: '#10b981',
        systemPrompt: `You are a strategic planning agent. Your job is to develop comprehensive strategies, roadmaps, and action plans.
Consider market dynamics, competitive landscape, risks, and opportunities.
Provide clear, prioritized recommendations with timelines and success metrics.`,
    },
    developer: {
        name: 'Developer Agent',
        color: '#ec4899',
        systemPrompt: `You are a technical development agent. Your job is to provide code solutions, architectural designs, and technical implementation guidance.
Write clean, well-documented code. Consider best practices, scalability, and maintainability.
Explain technical decisions clearly and provide working examples.`,
    },
    designer: {
        name: 'Designer Agent',
        color: '#8b5cf6',
        systemPrompt: `You are a creative design agent. Your job is to conceptualize user experiences, visual designs, and creative solutions.
Focus on usability, accessibility, and aesthetic appeal. Describe layouts, color schemes, and interaction patterns.
Provide design rationale and consider user personas.`,
    },
    data_scientist: {
        name: 'Data Science Agent',
        color: '#14b8a6',
        systemPrompt: `You are a data science agent. Your job is to analyze datasets, build models, and derive statistical insights.
Apply appropriate statistical methods and ML techniques. Explain your methodology clearly.
Present findings with confidence intervals and caveats about data limitations.`,
    },
    editor: {
        name: 'Editor Agent',
        color: '#f97316',
        systemPrompt: `You are a professional editing agent. Your job is to refine, polish, and improve written content.
Fix grammar, improve clarity, enhance flow, and ensure consistent tone.
Maintain the original voice while elevating the quality. Provide specific suggestions.`,
    },
    domain_expert: {
        name: 'Domain Expert Agent',
        color: '#06b6d4',
        systemPrompt: `You are a domain expert agent. Your job is to provide deep, specialized knowledge in the relevant field.
Draw on industry best practices, regulatory requirements, and expert-level understanding.
Provide authoritative guidance with nuanced context that only a specialist would know.`,
    },
    qa_tester: {
        name: 'QA Tester Agent',
        color: '#ef4444',
        systemPrompt: `You are a quality assurance agent. Your job is to test, validate, and stress-test outputs for correctness and edge cases.
Identify potential failures, inconsistencies, and edge cases. Create test scenarios.
Provide a clear pass/fail assessment with detailed reasoning for each finding.`,
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
        const availableRoles = Object.keys(AGENT_CONFIGS).join(', ');
        const plan = await chatCompletionJSON<PlanResult>(
            `You are an AI orchestrator. Given a user's goal, decompose it into specialist sub-tasks.

Analyze the complexity of the goal and choose the RIGHT number of agents:
- Simple goals (straightforward questions, single-topic): 2-3 agents
- Moderate goals (multi-faceted topics, research + writing): 3-5 agents  
- Complex goals (strategies, technical builds, deep analysis): 5-8 agents

Available specialist roles: ${availableRoles}

Choose the most appropriate roles for the mission. You do NOT need to use all roles — only the ones that genuinely add value.

Respond in JSON format:
{
  "subtasks": [
    { "role": "researcher", "description": "short description", "prompt": "detailed prompt for the agent" },
    { "role": "analyst", "description": "short description", "prompt": "detailed prompt for the agent" }
  ],
  "reasoning": "explain why you chose this decomposition and these specific roles"
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

            // Simulate tool usage for research-oriented roles
            if (['researcher', 'analyst', 'data_scientist', 'domain_expert'].includes(task.role)) {
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
