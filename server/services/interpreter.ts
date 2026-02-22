import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { chatCompletionJSON, chatCompletion } from './openai.js';
import { broadcast } from './sse.js';
import { runMission } from './orchestrator.js';
import { researchTopic, shouldResearchFeedback, webSearch } from './tavily.js';
import type { SearchResult, ResearchFindings } from './tavily.js';

// ─── Interpretation Prompts ──────────────────────────────────

const INTERPRET_SYSTEM_PROMPT = `You are an expert mission interpreter. Your job is to deeply analyze a user's raw goal and extract a structured understanding of their intent.

Given the user's goal (and optionally their feedback from a previous iteration), produce a JSON object with:

{
  "interpretation": {
    "objective": "A clear, specific statement of what the user is trying to achieve",
    "scope": "The boundaries, constraints, and domain of the task",
    "deliverables": ["List of concrete outputs the user expects"],
    "audience": "Who the final result is intended for",
    "assumptions": ["Things you're assuming that the user hasn't explicitly stated"]
  },
  "weakPoints": ["Identified gaps, ambiguities, or missing context that could lead to a suboptimal result"],
  "clarifyingQuestions": ["Questions you'd ask the user to improve the result (max 3-4)"],
  "confidence": <number 0-100 representing how well-specified the goal is>
}

Be thorough but concise. Identify real gaps, not trivial ones. If the goal is already very clear and specific, give high confidence and few/no weak points.`;

const CRITIQUE_SYSTEM_PROMPT = `You are a critical reviewer of mission interpretations. Given an interpretation of a user's goal, identify weaknesses, blind spots, and missing context.

You will receive the user's original goal and a structured interpretation. Your job is to:
1. Find gaps the interpreter missed
2. Identify assumptions that might be wrong
3. Suggest what additional context would dramatically improve the output quality
4. Rate the overall quality

Respond with a JSON object:
{
  "additionalWeakPoints": ["Any weak points the interpreter missed"],
  "riskyAssumptions": ["Assumptions that seem particularly risky or likely wrong"],
  "missingContext": ["Critical context that would improve results"],
  "qualityScore": <number 0-100>,
  "improvementSuggestions": ["Specific ways to improve the refined prompt"]
}`;

const SYNTHESIZE_SYSTEM_PROMPT = `You are a precision prompt engineer. Your job is to take a raw user goal, a structured interpretation, and a critique — then synthesize them into a single, highly specific, actionable mission brief.

The output should be a refined version of the user's goal that:
1. Is unambiguous and specific
2. Incorporates the interpretation's understanding
3. Addresses the critique's concerns where possible
4. Maintains the user's original intent
5. Is written as a direct instruction (as if the user wrote it perfectly the first time)

Respond with a JSON object:
{
  "refinedGoal": "The complete, refined mission brief as a single detailed paragraph or short set of paragraphs"
}`;

// ─── Refinement-Specific Prompts ─────────────────────────────

const REFINE_SYSTEM_PROMPT = `You are an expert mission interpreter performing an ITERATIVE REFINEMENT. You are NOT starting from scratch — you are updating an existing interpretation based on new user feedback.

IMPORTANT RULES:
- You will receive the PREVIOUS interpretation (objective, scope, deliverables, audience, assumptions) and the user's feedback
- PRESERVE every field the user did NOT challenge or contradict
- ONLY MODIFY fields that the user's feedback directly affects
- INCORPORATE the feedback as additional constraints, context, or corrections — don't discard prior understanding
- REMOVE weak points and assumptions that the user's feedback has now resolved
- LOWER the number of clarifying questions (remove ones the feedback answered, only ask NEW follow-ups if critical)
- The confidence score should generally INCREASE since the user provided more context

Respond with the same JSON structure:
{
  "interpretation": {
    "objective": "Updated objective (preserve if unchanged)",
    "scope": "Updated scope incorporating feedback",
    "deliverables": ["Preserve existing + add/modify based on feedback"],
    "audience": "Updated if feedback clarifies",
    "assumptions": ["Only assumptions NOT resolved by feedback"]
  },
  "weakPoints": ["Only gaps that STILL exist after incorporating feedback"],
  "clarifyingQuestions": ["Only NEW questions raised by the feedback, max 2"],
  "confidence": <number 0-100, should generally be HIGHER than previous iteration>
}`;

const REFINE_CRITIQUE_PROMPT = `You are reviewing an UPDATED mission interpretation. The user provided additional feedback and the interpreter revised the interpretation.

Your job is focused:
1. Was the user's feedback properly incorporated? (most important)
2. Did the revision introduce any NEW issues?
3. Are there remaining gaps the user should know about?
4. Has the quality improved compared to what was there before?

Do NOT repeat concerns that were already identified — only flag NEW issues or concerns about whether the feedback was handled correctly.

Respond with a JSON object:
{
  "additionalWeakPoints": ["Only NEW weak points not already identified"],
  "riskyAssumptions": ["Only assumptions that are STILL risky after feedback"],
  "missingContext": ["Only context STILL missing"],
  "qualityScore": <number 0-100, should reflect improvement>,
  "improvementSuggestions": ["Specific remaining improvements"]
}`;

// ─── Types ───────────────────────────────────────────────────

interface InterpretResult {
    interpretation: {
        objective: string;
        scope: string;
        deliverables: string[];
        audience: string;
        assumptions: string[];
    };
    weakPoints: string[];
    clarifyingQuestions: string[];
    confidence: number;
}

interface CritiqueResult {
    additionalWeakPoints: string[];
    riskyAssumptions: string[];
    missingContext: string[];
    qualityScore: number;
    improvementSuggestions: string[];
}

interface SynthesizeResult {
    refinedGoal: string;
}

// ─── Helper ──────────────────────────────────────────────────

async function addReasoning(
    missionId: string,
    agentName: string,
    agentRole: string,
    content: string,
) {
    const [log] = await db.insert(schema.reasoningLogs).values({
        missionId,
        agentId: null,
        content,
        sources: [],
    }).returning();
    broadcast(missionId, 'reasoning', { ...log, agentName, agentRole });
}

async function updateMissionStatus(missionId: string, status: string) {
    await db.update(schema.missions)
        .set({ status })
        .where(eq(schema.missions.id, missionId));
}

// ─── Core Interpretation Loop ────────────────────────────────

export async function startInterpretation(missionId: string, rawGoal: string): Promise<void> {
    try {
        await updateMissionStatus(missionId, 'interpreting');
        broadcast(missionId, 'mission-update', { id: missionId, status: 'interpreting' });

        await addReasoning(missionId, 'Interpreter', 'interpreter',
            `📝 Received goal: "${rawGoal}". Starting interpretation analysis...`
        );

        broadcast(missionId, 'interpretation-status', { status: 'analyzing', message: 'Analyzing your request...' });

        // Step 1: Interpret
        const interpretation = await chatCompletionJSON<InterpretResult>(
            INTERPRET_SYSTEM_PROMPT,
            `User's goal: ${rawGoal}`
        );

        await addReasoning(missionId, 'Interpreter', 'interpreter',
            `🔍 Initial interpretation complete. Confidence: ${interpretation.confidence}%. Found ${interpretation.weakPoints?.length || 0} weak points.`
        );

        // Step 1.5: Web Research — ground interpretation in reality
        broadcast(missionId, 'interpretation-status', { status: 'researching', message: 'Researching to ground interpretation in reality...' });

        const research = await researchTopic(
            interpretation.interpretation?.objective || rawGoal,
            {
                weakPoints: interpretation.weakPoints,
                scope: interpretation.interpretation?.scope,
            }
        );

        const researchContext = research.sources.length > 0
            ? `\n\nWEB RESEARCH FINDINGS (${research.sources.length} sources):\n${research.sources.map((s, i) => `${i + 1}. [${s.title}](${s.url}): ${s.snippet}`).join('\n')}`
            : '';

        if (research.sources.length > 0) {
            await addReasoning(missionId, 'Researcher', 'researcher',
                `🌐 Found ${research.sources.length} relevant sources across ${research.queriesUsed.length} queries: ${research.sources.map(s => s.title).slice(0, 3).join(', ')}${research.sources.length > 3 ? '...' : ''}`
            );
        }

        broadcast(missionId, 'interpretation-status', { status: 'critiquing', message: 'Evaluating interpretation for gaps...' });

        // Step 2: Critique (now informed by research)
        const critique = await chatCompletionJSON<CritiqueResult>(
            CRITIQUE_SYSTEM_PROMPT,
            `Original goal: ${rawGoal}\n\nInterpretation:\n${JSON.stringify(interpretation, null, 2)}${researchContext}`
        );

        // Merge weak points from both interpret and critique
        const allWeakPoints = [
            ...(interpretation.weakPoints || []),
            ...(critique.additionalWeakPoints || []),
        ];

        // Adjust confidence based on critique
        const adjustedConfidence = Math.round(
            (interpretation.confidence * 0.6 + critique.qualityScore * 0.4)
        );

        await addReasoning(missionId, 'Critic', 'critic',
            `⚡ Critique complete. Quality score: ${critique.qualityScore}%. Adjusted confidence: ${adjustedConfidence}%. Found ${critique.additionalWeakPoints?.length || 0} additional concerns.`
        );

        broadcast(missionId, 'interpretation-status', { status: 'synthesizing', message: 'Crafting refined mission brief...' });

        // Step 3: Synthesize refined prompt (also informed by research)
        const synthesis = await chatCompletionJSON<SynthesizeResult>(
            SYNTHESIZE_SYSTEM_PROMPT,
            `Original goal: ${rawGoal}\n\nInterpretation:\n${JSON.stringify(interpretation.interpretation, null, 2)}\n\nCritique:\n${JSON.stringify(critique, null, 2)}${researchContext}`
        );

        await addReasoning(missionId, 'Synthesizer', 'synthesizer',
            `✅ Refined mission brief ready. Presenting proposal for your approval.`
        );

        // Save to DB
        const [proposal] = await db.insert(schema.interpretations).values({
            missionId,
            iteration: 1,
            rawGoal,
            refinedGoal: synthesis.refinedGoal || rawGoal,
            interpretation: interpretation.interpretation || {
                objective: rawGoal,
                scope: 'Not specified',
                deliverables: [],
                audience: 'Not specified',
                assumptions: [],
            },
            weakPoints: allWeakPoints,
            clarifyingQuestions: interpretation.clarifyingQuestions || [],
            confidence: adjustedConfidence,
            userFeedback: null,
            researchSources: research.sources,
        }).returning();

        // Broadcast proposal to frontend
        broadcast(missionId, 'interpretation-proposal', {
            ...proposal,
            interpretation: interpretation.interpretation,
        });

        broadcast(missionId, 'interpretation-status', { status: 'waiting', message: 'Waiting for your approval...' });
    } catch (error: any) {
        console.error(`Interpretation failed for mission ${missionId}:`, error);
        await addReasoning(missionId, 'Interpreter', 'interpreter',
            `❌ Interpretation failed: ${error.message}. Falling back to direct orchestration.`
        );
        // Fallback: skip interpretation and go straight to orchestrator
        await runMission(missionId, rawGoal);
    }
}

export async function refineInterpretation(missionId: string, userFeedback: string): Promise<void> {
    try {
        broadcast(missionId, 'interpretation-status', { status: 'refining', message: 'Incorporating your feedback...' });

        // Get the latest proposal for this mission
        const proposals = await db.query.interpretations.findMany({
            where: eq(schema.interpretations.missionId, missionId),
            orderBy: (interp, { desc }) => [desc(interp.iteration)],
            limit: 1,
        });

        const prevProposal = proposals[0];
        if (!prevProposal) {
            throw new Error('No previous interpretation found');
        }

        const iteration = prevProposal.iteration + 1;

        await addReasoning(missionId, 'Interpreter', 'interpreter',
            `🔄 Iteration ${iteration}: Incorporating feedback: "${userFeedback}"`
        );

        // Step 1: REFINE (not re-interpret) with feedback context
        const interpretation = await chatCompletionJSON<InterpretResult>(
            REFINE_SYSTEM_PROMPT,
            `ORIGINAL USER GOAL:
${prevProposal.rawGoal}

PREVIOUS INTERPRETATION (Iteration ${prevProposal.iteration}):
${JSON.stringify(prevProposal.interpretation, null, 2)}

PREVIOUS WEAK POINTS:
${JSON.stringify(prevProposal.weakPoints, null, 2)}

PREVIOUS CLARIFYING QUESTIONS:
${JSON.stringify((prevProposal as any).clarifyingQuestions || [], null, 2)}

PREVIOUS CONFIDENCE: ${prevProposal.confidence}%

USER'S FEEDBACK (treat as authoritative — this resolves ambiguity):
${userFeedback}`
        );

        // Step 1.5: Smart research trigger — only if feedback introduces new topics
        let researchSources: SearchResult[] = (prevProposal.researchSources as SearchResult[]) || [];
        let researchContext = '';

        const researchDecision = await shouldResearchFeedback(
            prevProposal.rawGoal,
            researchSources,
            userFeedback
        );

        if (researchDecision.needed && researchDecision.queries.length > 0) {
            broadcast(missionId, 'interpretation-status', { status: 'researching', message: 'Researching new topics from your feedback...' });

            await addReasoning(missionId, 'Researcher', 'researcher',
                `🌐 Feedback introduces new topics — running targeted research: ${researchDecision.queries.join(', ')}`
            );

            // Run targeted searches for the new topics
            const newResults: SearchResult[] = [];
            for (const query of researchDecision.queries.slice(0, 3)) {
                const results = await webSearch(query, { maxResults: 3 });
                newResults.push(...results);
            }

            // Merge with previous sources, deduplicating by URL
            const existingUrls = new Set(researchSources.map(s => s.url));
            const uniqueNew = newResults.filter(r => !existingUrls.has(r.url));
            researchSources = [...researchSources, ...uniqueNew];

            if (uniqueNew.length > 0) {
                await addReasoning(missionId, 'Researcher', 'researcher',
                    `📚 Found ${uniqueNew.length} new sources: ${uniqueNew.map(s => s.title).join(', ')}`
                );
            }

            researchContext = `\n\nWEB RESEARCH FINDINGS (${researchSources.length} total sources):\n${researchSources.map((s, i) => `${i + 1}. [${s.title}](${s.url}): ${s.snippet}`).join('\n')}`;
        } else if (researchSources.length > 0) {
            // Carry forward previous research for context
            researchContext = `\n\nPREVIOUS RESEARCH (${researchSources.length} sources):\n${researchSources.map((s, i) => `${i + 1}. [${s.title}](${s.url}): ${s.snippet}`).join('\n')}`;
        }

        broadcast(missionId, 'interpretation-status', { status: 'critiquing', message: 'Checking if feedback was properly incorporated...' });

        // Step 2: Focused critique — did we properly incorporate the feedback?
        const critique = await chatCompletionJSON<CritiqueResult>(
            REFINE_CRITIQUE_PROMPT,
            `ORIGINAL GOAL: ${prevProposal.rawGoal}

USER FEEDBACK: ${userFeedback}

PREVIOUS INTERPRETATION:
${JSON.stringify(prevProposal.interpretation, null, 2)}

UPDATED INTERPRETATION:
${JSON.stringify(interpretation.interpretation, null, 2)}

Did the revision properly incorporate the user's feedback?${researchContext}`
        );

        // Only include genuinely NEW weak points
        const allWeakPoints = [
            ...(interpretation.weakPoints || []),
            ...(critique.additionalWeakPoints || []),
        ];

        const adjustedConfidence = Math.round(
            (interpretation.confidence * 0.6 + critique.qualityScore * 0.4)
        );

        broadcast(missionId, 'interpretation-status', { status: 'synthesizing', message: 'Crafting improved mission brief...' });

        // Step 3: Synthesize — include BOTH the previous refined goal and the feedback
        const synthesis = await chatCompletionJSON<SynthesizeResult>(
            SYNTHESIZE_SYSTEM_PROMPT,
            `Original goal: ${prevProposal.rawGoal}
User feedback: ${userFeedback}
Previous refined goal: ${prevProposal.refinedGoal}

Revised interpretation:
${JSON.stringify(interpretation.interpretation, null, 2)}

Critique:
${JSON.stringify(critique, null, 2)}${researchContext}

IMPORTANT: Build upon the previous refined goal — incorporate the user's feedback as updates, don't rewrite from scratch.`
        );

        await addReasoning(missionId, 'Synthesizer', 'synthesizer',
            `✅ Iteration ${iteration} complete. Confidence: ${adjustedConfidence}% (${adjustedConfidence > (prevProposal.confidence || 0) ? '↑ improved' : 'unchanged'}).`
        );

        // Save refined proposal
        const [proposal] = await db.insert(schema.interpretations).values({
            missionId,
            iteration,
            rawGoal: prevProposal.rawGoal,
            refinedGoal: synthesis.refinedGoal || prevProposal.refinedGoal,
            interpretation: interpretation.interpretation || prevProposal.interpretation,
            weakPoints: allWeakPoints,
            clarifyingQuestions: interpretation.clarifyingQuestions || [],
            confidence: adjustedConfidence,
            userFeedback,
            researchSources,
        }).returning();

        // Broadcast updated proposal
        broadcast(missionId, 'interpretation-proposal', {
            ...proposal,
            interpretation: interpretation.interpretation,
        });

        broadcast(missionId, 'interpretation-status', { status: 'waiting', message: 'Waiting for your approval...' });
    } catch (error: any) {
        console.error(`Refinement failed for mission ${missionId}:`, error);
        await addReasoning(missionId, 'Interpreter', 'interpreter',
            `❌ Refinement failed: ${error.message}`
        );
        broadcast(missionId, 'interpretation-status', { status: 'error', message: error.message });
    }
}

export async function approveInterpretation(missionId: string): Promise<void> {
    // Get the latest proposal
    const proposals = await db.query.interpretations.findMany({
        where: eq(schema.interpretations.missionId, missionId),
        orderBy: (interp, { desc }) => [desc(interp.iteration)],
        limit: 1,
    });

    const latestProposal = proposals[0];
    if (!latestProposal) {
        throw new Error('No interpretation to approve');
    }

    await addReasoning(missionId, 'Interpreter', 'interpreter',
        `🚀 Proposal approved (Iteration ${latestProposal.iteration}, Confidence: ${latestProposal.confidence}%). Handing off to Orchestrator with refined mission brief.`
    );

    broadcast(missionId, 'interpretation-status', { status: 'approved', message: 'Approved! Launching orchestrator...' });

    // Hand off to the orchestrator with the refined goal
    await runMission(missionId, latestProposal.refinedGoal);
}
