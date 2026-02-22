import {
    pgTable,
    text,
    timestamp,
    integer,
    json,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

// ─── Missions ────────────────────────────────────────────────
export const missions = pgTable('missions', {
    id: uuid('id').primaryKey().defaultRandom(),
    goal: text('goal').notNull(),
    status: varchar('status', { length: 50 }).notNull().default('idle'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    elapsedMs: integer('elapsed_ms').default(0).notNull(),
});

// ─── Agents ──────────────────────────────────────────────────
export const agents = pgTable('agents', {
    id: uuid('id').primaryKey().defaultRandom(),
    missionId: uuid('mission_id')
        .references(() => missions.id, { onDelete: 'cascade' })
        .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    role: varchar('role', { length: 50 }).notNull(),
    systemPrompt: text('system_prompt').notNull().default(''),
    status: varchar('status', { length: 50 }).notNull().default('idle'),
    progress: integer('progress').default(0).notNull(),
    color: varchar('color', { length: 50 }).notNull().default('#6366f1'),
    taskPrompt: text('task_prompt').notNull().default(''),
    output: text('output').notNull().default(''),
    finalPrompt: text('final_prompt').notNull().default(''),
    wave: integer('wave').default(0).notNull(),
    dependsOn: json('depends_on').$type<string[]>().notNull().default([]),
});

// ─── Steps ───────────────────────────────────────────────────
export const steps = pgTable('steps', {
    id: uuid('id').primaryKey().defaultRandom(),
    missionId: uuid('mission_id')
        .references(() => missions.id, { onDelete: 'cascade' })
        .notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    type: varchar('type', { length: 50 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    order: integer('order').notNull().default(0),
});

// ─── Reasoning Logs ──────────────────────────────────────────
export const reasoningLogs = pgTable('reasoning_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    missionId: uuid('mission_id')
        .references(() => missions.id, { onDelete: 'cascade' })
        .notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    content: text('content').notNull(),
    sources: json('sources').$type<string[]>().default([]),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// ─── Tools Used ──────────────────────────────────────────────
export const toolsUsed = pgTable('tools_used', {
    id: uuid('id').primaryKey().defaultRandom(),
    missionId: uuid('mission_id')
        .references(() => missions.id, { onDelete: 'cascade' })
        .notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    toolName: varchar('tool_name', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('idle'),
    data: json('data').$type<Record<string, unknown>>().default({}),
});

// ─── Mission Results ─────────────────────────────────────────
export const missionResults = pgTable('mission_results', {
    id: uuid('id').primaryKey().defaultRandom(),
    missionId: uuid('mission_id')
        .references(() => missions.id, { onDelete: 'cascade' })
        .notNull(),
    content: text('content').notNull().default(''),
    sources: json('sources').$type<string[]>().default([]),
    reasoningSummary: text('reasoning_summary').notNull().default(''),
    agentsInvolved: json('agents_involved').$type<string[]>().default([]),
});

// ─── Interpretations ─────────────────────────────────────────
export const interpretations = pgTable('interpretations', {
    id: uuid('id').primaryKey().defaultRandom(),
    missionId: uuid('mission_id')
        .references(() => missions.id, { onDelete: 'cascade' })
        .notNull(),
    iteration: integer('iteration').notNull(),
    rawGoal: text('raw_goal').notNull(),
    refinedGoal: text('refined_goal').notNull().default(''),
    interpretation: json('interpretation').$type<{
        objective: string;
        scope: string;
        deliverables: string[];
        audience: string;
        assumptions: string[];
    }>().notNull(),
    weakPoints: json('weak_points').$type<string[]>().notNull().default([]),
    clarifyingQuestions: json('clarifying_questions').$type<string[]>().notNull().default([]),
    confidence: integer('confidence').notNull().default(0),
    userFeedback: text('user_feedback'),
    researchSources: json('research_sources').$type<Array<{ title: string; url: string; snippet: string; score: number }>>().notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});
