// Shared types between client and server

export type MissionStatus = 'idle' | 'planning' | 'executing' | 'completed' | 'failed';
export type AgentRole = 'orchestrator' | 'researcher' | 'writer' | 'reviewer' | 'analyst';
export type AgentStatus = 'idle' | 'active' | 'completed' | 'failed' | 'waiting';
export type StepType = 'understand' | 'plan' | 'execute' | 'merge' | 'output';
export type StepStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface Mission {
    id: string;
    goal: string;
    status: MissionStatus;
    createdAt: string;
    elapsedMs: number;
}

export interface Agent {
    id: string;
    missionId: string;
    name: string;
    role: AgentRole;
    systemPrompt: string;
    status: AgentStatus;
    progress: number;
    color: string;
}

export interface Step {
    id: string;
    missionId: string;
    agentId: string | null;
    type: StepType;
    label: string;
    status: StepStatus;
    order: number;
}

export interface ReasoningLog {
    id: string;
    missionId: string;
    agentId: string | null;
    agentName?: string;
    agentRole?: AgentRole;
    content: string;
    sources: string[];
    timestamp: string;
}

export interface ToolUsed {
    id: string;
    missionId: string;
    agentId: string | null;
    toolName: string;
    status: 'active' | 'completed' | 'idle';
    data: Record<string, unknown>;
}

export interface MissionResult {
    id: string;
    missionId: string;
    content: string;
    sources: string[];
    reasoningSummary: string;
    agentsInvolved: string[];
}

// SSE Event Types
export type SSEEventType =
    | 'mission-update'
    | 'agent-update'
    | 'step-update'
    | 'reasoning'
    | 'tool-update'
    | 'result'
    | 'error';

export interface SSEEvent {
    type: SSEEventType;
    data: unknown;
}
