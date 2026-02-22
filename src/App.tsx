import React, { useState, useCallback } from 'react';
import MissionBar from './components/MissionBar';
import ToolsMemoryPanel from './components/ToolsMemoryPanel';
import ThinkingFlowCanvas from './components/ThinkingFlowCanvas';
import ReasoningPanel from './components/ReasoningPanel';
import ResultTray from './components/ResultTray';
import MissionInput from './components/MissionInput';
import InterpretationPanel from './components/InterpretationPanel';
import { useMissionSSE } from './hooks/useMissionSSE';
import { useElapsedTime } from './hooks/useElapsedTime';

import type {
    Mission,
    Agent,
    Step,
    ReasoningLog,
    ToolUsed,
    MissionResult,
    MissionStatus,
    InterpretationProposal,
} from '../shared/types';

function App() {
    // ─── State ───────────────────────────────────────────────
    const [mission, setMission] = useState<Mission | null>(null);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [steps, setSteps] = useState<Step[]>([]);
    const [reasoningLogs, setReasoningLogs] = useState<ReasoningLog[]>([]);
    const [tools, setTools] = useState<ToolUsed[]>([]);
    const [result, setResult] = useState<MissionResult | null>(null);
    const [isLaunching, setIsLaunching] = useState(false);
    const [interpretationProposal, setInterpretationProposal] = useState<InterpretationProposal | null>(null);
    const [interpretationStatus, setInterpretationStatus] = useState('idle');
    const [interpretationMessage, setInterpretationMessage] = useState('');
    const [isInterpretationLoading, setIsInterpretationLoading] = useState(false);

    const isRunning = mission?.status === 'planning' || mission?.status === 'executing' || mission?.status === 'interpreting';
    const { formatted: elapsed, reset: resetTimer } = useElapsedTime(isRunning);

    // ─── SSE Handlers ────────────────────────────────────────
    const handleMissionUpdate = useCallback((data: { id: string; status: MissionStatus }) => {
        setMission((prev) => (prev ? { ...prev, status: data.status } : prev));
    }, []);

    const handleAgentUpdate = useCallback((data: Partial<Agent>) => {
        setAgents((prev) => {
            const existing = prev.find((a) => a.id === data.id);
            if (existing) {
                return prev.map((a) => (a.id === data.id ? { ...a, ...data } : a));
            }
            return [...prev, data as Agent];
        });
    }, []);

    const handleStepUpdate = useCallback((data: Partial<Step>) => {
        setSteps((prev) => {
            const existing = prev.find((s) => s.id === data.id);
            if (existing) {
                return prev.map((s) => (s.id === data.id ? { ...s, ...data } : s));
            }
            return [...prev, data as Step];
        });
    }, []);

    const handleReasoning = useCallback((data: ReasoningLog) => {
        setReasoningLogs((prev) => [...prev, data]);
    }, []);

    const handleToolUpdate = useCallback((data: Partial<ToolUsed>) => {
        setTools((prev) => {
            const existing = prev.find((t) => t.id === data.id);
            if (existing) {
                return prev.map((t) => (t.id === data.id ? { ...t, ...data } : t));
            }
            return [...prev, data as ToolUsed];
        });
    }, []);

    const handleResult = useCallback((data: MissionResult) => {
        setResult(data);
    }, []);

    const handleError = useCallback((data: { message: string }) => {
        console.error('Mission error:', data.message);
    }, []);

    const handleInterpretationProposal = useCallback((data: InterpretationProposal) => {
        setInterpretationProposal(data);
        setIsInterpretationLoading(false);
    }, []);

    const handleInterpretationStatus = useCallback((data: { status: string; message: string }) => {
        setInterpretationStatus(data.status);
        setInterpretationMessage(data.message);
        if (data.status === 'approved') {
            // Interpretation approved — clear proposal, mission will transition to 'planning'
            setInterpretationProposal(null);
            setInterpretationStatus('idle');
            setIsInterpretationLoading(false);
        }
    }, []);

    // ─── SSE Connection ─────────────────────────────────────
    useMissionSSE(mission?.id || null, {
        onMissionUpdate: handleMissionUpdate,
        onAgentUpdate: handleAgentUpdate,
        onStepUpdate: handleStepUpdate,
        onReasoning: handleReasoning,
        onToolUpdate: handleToolUpdate,
        onResult: handleResult,
        onError: handleError,
        onInterpretationProposal: handleInterpretationProposal,
        onInterpretationStatus: handleInterpretationStatus,
    });

    // ─── Launch Mission ──────────────────────────────────────
    const handleLaunchMission = async (goal: string) => {
        // Reset state
        setAgents([]);
        setSteps([]);
        setReasoningLogs([]);
        setTools([]);
        setResult(null);
        setInterpretationProposal(null);
        setInterpretationStatus('idle');
        setInterpretationMessage('');
        setIsInterpretationLoading(false);
        resetTimer();
        setIsLaunching(true);

        try {
            const response = await fetch('/api/missions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal }),
            });

            if (!response.ok) {
                throw new Error('Failed to create mission');
            }

            const missionData = await response.json();
            setMission({
                id: missionData.id,
                goal: missionData.goal,
                status: missionData.status as MissionStatus,
                createdAt: missionData.createdAt,
                elapsedMs: 0,
            });
        } catch (error) {
            console.error('Failed to launch mission:', error);
        } finally {
            setIsLaunching(false);
        }
    };

    // ─── Load Existing Mission ───────────────────────────────
    const handleLoadMission = async (missionId: string) => {
        setIsLaunching(true);
        try {
            const response = await fetch(`/api/missions/${missionId}`);
            if (!response.ok) throw new Error('Failed to load mission');

            const data = await response.json();

            setMission({
                id: data.mission.id,
                goal: data.mission.goal,
                status: data.mission.status as MissionStatus,
                createdAt: data.mission.createdAt,
                elapsedMs: data.mission.elapsedMs || 0,
            });
            setAgents(data.agents || []);
            setSteps(data.steps || []);
            setReasoningLogs(data.reasoningLogs || []);
            setTools(data.toolsUsed || []);
            setResult(data.results?.[0] || null);
            resetTimer();
        } catch (error) {
            console.error('Failed to load mission:', error);
        } finally {
            setIsLaunching(false);
        }
    };

    // ─── New Mission (reset to input) ────────────────────────
    const handleNewMission = () => {
        setMission(null);
        setAgents([]);
        setSteps([]);
        setReasoningLogs([]);
        setTools([]);
        setResult(null);
        setInterpretationProposal(null);
        setInterpretationStatus('idle');
        setInterpretationMessage('');
        setIsInterpretationLoading(false);
        resetTimer();
    };

    // ─── Interpretation Actions ──────────────────────────────
    const handleApproveInterpretation = async () => {
        if (!mission) return;
        setIsInterpretationLoading(true);
        try {
            await fetch(`/api/missions/${mission.id}/interpret/approve`, {
                method: 'POST',
            });
        } catch (error) {
            console.error('Failed to approve interpretation:', error);
            setIsInterpretationLoading(false);
        }
    };

    const handleRefineInterpretation = async (feedback: string) => {
        if (!mission) return;
        setIsInterpretationLoading(true);
        setInterpretationProposal(null); // Clear current proposal while refining
        try {
            await fetch(`/api/missions/${mission.id}/interpret/refine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedback }),
            });
        } catch (error) {
            console.error('Failed to refine interpretation:', error);
            setIsInterpretationLoading(false);
        }
    };

    const handleFollowUp = async (question: string) => {
        if (!mission) return;
        // Reset UI to show interpretation pipeline again
        setInterpretationProposal(null);
        setInterpretationStatus('analyzing');
        setInterpretationMessage('Processing follow-up...');
        setIsInterpretationLoading(true);
        setResult(null);
        try {
            await fetch(`/api/missions/${mission.id}/follow-up`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question }),
            });
        } catch (error) {
            console.error('Failed to submit follow-up:', error);
            setIsInterpretationLoading(false);
        }
    };

    // ─── Derived Data ────────────────────────────────────────
    const confidence = result
        ? 94
        : agents.some((a) => a.status === 'completed')
            ? 72
            : agents.some((a) => a.status === 'active')
                ? 45
                : 0;

    const memoryItems = reasoningLogs
        .filter((l) => l.content.length < 150)
        .slice(-3)
        .map((l) => l.content);

    const sourceCount = result?.sources?.length || tools.length || 0;

    // ─── Render ──────────────────────────────────────────────
    if (!mission) {
        return (
            <div className="app-layout">
                <MissionBar
                    goal=""
                    status="idle"
                    elapsed="00:00"
                    agents={[]}
                />
                <div className="app-workspace">
                    <MissionInput
                        onSubmit={handleLaunchMission}
                        onLoadMission={handleLoadMission}
                        isLoading={isLaunching}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="app-layout">
            <MissionBar
                goal={mission.goal}
                status={mission.status}
                elapsed={elapsed}
                agents={agents}
                onNewMission={handleNewMission}
            />
            <div className="app-workspace">
                <ToolsMemoryPanel
                    tools={tools}
                    confidence={confidence}
                    memoryItems={memoryItems}
                    sourceCount={sourceCount}
                />
                {mission.status === 'interpreting' ? (
                    <InterpretationPanel
                        proposal={interpretationProposal}
                        interpretationStatus={interpretationStatus}
                        statusMessage={interpretationMessage}
                        onApprove={handleApproveInterpretation}
                        onRefine={handleRefineInterpretation}
                        isLoading={isInterpretationLoading}
                    />
                ) : (
                    <ThinkingFlowCanvas
                        agents={agents}
                        steps={steps}
                    />
                )}
                <ReasoningPanel
                    logs={reasoningLogs}
                    missionStatus={mission.status}
                    onFollowUp={handleFollowUp}
                />
            </div>
            <ResultTray
                result={result}
                isRunning={isRunning}
                agentNames={agents.map((a) => a.name)}
            />
        </div>
    );
}

export default App;
