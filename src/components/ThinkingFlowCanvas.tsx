import React, { useMemo, useState } from 'react';
import type { Agent, Step } from '../../shared/types';

interface ThinkingFlowCanvasProps {
    agents: Agent[];
    steps: Step[];
}

// Fallback icon mapping for known role keywords
const getIconForRole = (role: string): string => {
    if (role.includes('research') || role.includes('investigat')) return 'search';
    if (role.includes('writ') || role.includes('content')) return 'edit_note';
    if (role.includes('review') || role.includes('qa') || role.includes('test')) return 'fact_check';
    if (role.includes('analy')) return 'analytics';
    if (role.includes('strateg') || role.includes('plan')) return 'target';
    if (role.includes('develop') || role.includes('code') || role.includes('engineer')) return 'code';
    if (role.includes('design') || role.includes('ux') || role.includes('ui')) return 'palette';
    if (role.includes('data') || role.includes('statist')) return 'query_stats';
    if (role.includes('edit') || role.includes('polish')) return 'edit_document';
    if (role.includes('expert') || role.includes('domain') || role.includes('specialist')) return 'school';
    return 'smart_toy';
};

const ThinkingFlowCanvas: React.FC<ThinkingFlowCanvasProps> = ({ agents, steps }) => {
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [activeTab, setActiveTab] = useState<'instructions' | 'output' | 'fullPrompt'>('instructions');

    // Layout nodes — multi-column by wave
    const nodes = useMemo(() => {
        const result: Array<{
            id: string;
            label: string;
            role: string;
            roleName: string;
            icon: string;
            color: string;
            status: string;
            progress: number;
            x: number;
            y: number;
            type: 'orchestrator' | 'agent' | 'merge' | 'output';
            statusText?: string;
            wave?: number;
            dependsOn?: string[];
        }> = [];

        // Always show orchestrator node
        const orchestratorStep = steps.find(s => s.type === 'understand' || s.type === 'plan');
        result.push({
            id: 'orchestrator',
            label: 'Analyze Request',
            role: 'orchestrator',
            roleName: 'Orchestrator',
            icon: 'psychology',
            color: 'var(--color-surface-light)',
            status: orchestratorStep?.status || 'pending',
            progress: orchestratorStep?.status === 'completed' ? 100 : orchestratorStep?.status === 'active' ? 50 : 0,
            x: 8,
            y: 50,
            type: 'orchestrator',
        });

        // Compute waves from agent data (filter out metadata agents)
        const visibleAgents = agents.filter(a => !a.id.startsWith('__'));
        const maxWave = visibleAgents.length > 0 ? Math.max(0, ...visibleAgents.map(a => a.wave || 0)) : 0;
        const totalWaves = maxWave + 1;

        // X positions: orchestrator=8, waves spread across 20-72, merge=88
        const getWaveX = (wave: number) => {
            if (totalWaves === 1) return 45; // Single wave — centered
            return 22 + (wave / (totalWaves - 1)) * 48; // Spread from 22% to 70%
        };

        if (visibleAgents.length > 0) {
            // Group agents by wave
            for (let wave = 0; wave <= maxWave; wave++) {
                const waveAgents = visibleAgents.filter(a => (a.wave || 0) === wave);
                const waveSpacing = 70 / (waveAgents.length + 1);
                const waveX = getWaveX(wave);

                waveAgents.forEach((agent, i) => {
                    const yPos = 15 + waveSpacing * (i + 1);
                    result.push({
                        id: agent.id,
                        label: agent.name?.replace(' Agent', '') || agent.role,
                        role: agent.role,
                        roleName: agent.name?.replace(' Agent', '') || agent.role,
                        icon: getIconForRole(agent.role),
                        color: agent.color,
                        status: agent.status,
                        progress: agent.progress,
                        x: waveX,
                        y: yPos,
                        type: 'agent',
                        wave: agent.wave || 0,
                        dependsOn: agent.dependsOn || [],
                        statusText: agent.status === 'active' ?
                            `Processing... ${agent.progress}%` :
                            agent.status === 'waiting' ? 'Waiting for dependencies...' :
                                agent.status === 'completed' ? 'Done' : undefined,
                    });
                });
            }
        } else {
            // Placeholder agents when no mission
            const placeholders = [
                { name: 'Research', role: 'researcher', color: 'var(--color-accent)' },
                { name: 'Analyze', role: 'analyst', color: 'var(--color-secondary)' },
                { name: 'Write', role: 'writer', color: 'var(--color-primary)' },
            ];
            const phSpacing = 70 / (placeholders.length + 1);
            placeholders.forEach((ph, i) => {
                result.push({
                    id: `placeholder-${i}`,
                    label: ph.name,
                    role: ph.role,
                    roleName: ph.name,
                    icon: getIconForRole(ph.role),
                    color: ph.color,
                    status: 'idle',
                    progress: 0,
                    x: 45,
                    y: 15 + phSpacing * (i + 1),
                    type: 'agent',
                });
            });
        }

        // Merge node
        const mergeStep = steps.find(s => s.type === 'merge');
        result.push({
            id: 'merge',
            label: 'Merge Results',
            role: 'orchestrator',
            roleName: 'Synthesizer',
            icon: 'merge_type',
            color: 'var(--color-success)',
            status: mergeStep?.status || 'pending',
            progress: mergeStep?.status === 'completed' ? 100 : 0,
            x: 88,
            y: 50,
            type: 'merge',
        });

        return result;
    }, [agents, steps]);

    // Generate SVG connection paths — dependency-aware
    const connections = useMemo(() => {
        const lines: Array<{
            key: string;
            x1: number; y1: number;
            x2: number; y2: number;
            color: string;
            active: boolean;
        }> = [];

        const orchestratorNode = nodes.find(n => n.type === 'orchestrator');
        const agentNodes = nodes.filter(n => n.type === 'agent');
        const mergeNode = nodes.find(n => n.type === 'merge');

        // Find Wave 0 agents (connect from orchestrator)
        const wave0Agents = agentNodes.filter(n => (n.wave || 0) === 0);
        // Find agents in the last wave (connect to merge)
        const maxWaveNum = agentNodes.length > 0 ? Math.max(...agentNodes.map(n => n.wave || 0)) : 0;
        const lastWaveAgents = agentNodes.filter(n => (n.wave || 0) === maxWaveNum);

        // Orchestrator → Wave 0 agents
        if (orchestratorNode) {
            wave0Agents.forEach((agent, i) => {
                lines.push({
                    key: `orch-${i}`,
                    x1: orchestratorNode.x + 8,
                    y1: orchestratorNode.y,
                    x2: agent.x - 2,
                    y2: agent.y,
                    color: agent.color,
                    active: agent.status === 'active' || agent.status === 'completed',
                });
            });
        }

        // Dependency arrows: source agent → dependent agent
        agentNodes.forEach((agent) => {
            if (agent.dependsOn?.length) {
                agent.dependsOn.forEach((depRole) => {
                    const sourceNode = agentNodes.find(n => {
                        // Match by role — look at the original agent data
                        const matchingAgent = agents.find(a => a.id === n.id);
                        return matchingAgent?.role === depRole;
                    });
                    if (sourceNode) {
                        lines.push({
                            key: `dep-${sourceNode.id}-${agent.id}`,
                            x1: sourceNode.x + 12,
                            y1: sourceNode.y,
                            x2: agent.x - 2,
                            y2: agent.y,
                            color: sourceNode.color,
                            active: sourceNode.status === 'completed',
                        });
                    }
                });
            }
        });

        // Last wave agents → Merge
        if (mergeNode) {
            lastWaveAgents.forEach((agent, i) => {
                lines.push({
                    key: `agent-merge-${i}`,
                    x1: agent.x + 12,
                    y1: agent.y,
                    x2: mergeNode.x - 2,
                    y2: mergeNode.y,
                    color: agent.color,
                    active: agent.status === 'completed',
                });
            });
        }

        return lines;
    }, [nodes, agents]);

    const getBorderStyle = (node: typeof nodes[0]) => {
        if (node.status === 'active') return `2px solid ${node.color}`;
        if (node.status === 'completed') return `2px solid var(--color-success)`;
        if (node.status === 'idle' || node.status === 'pending') return '1px solid var(--color-surface-light)';
        return '1px solid var(--color-surface-light)';
    };

    const getOpacity = (node: typeof nodes[0]) => {
        if (node.status === 'active' || node.status === 'completed') return 1;
        if (node.status === 'waiting') return 0.8;
        return 0.5;
    };

    const handleNodeClick = (node: typeof nodes[0]) => {
        // Orchestrator node — show real prompt data if available
        if (node.type === 'orchestrator') {
            const orchData = agents.find(a => a.id === '__orchestrator__');
            setSelectedAgent({
                id: 'orchestrator',
                missionId: '',
                name: 'Orchestrator',
                role: 'orchestrator',
                systemPrompt: orchData?.systemPrompt || 'The Orchestrator analyzes the mission goal and creates specialist agents.',
                status: 'completed',
                progress: 100,
                color: 'var(--color-surface-light)',
                finalPrompt: orchData?.finalPrompt || 'Orchestrator has not run yet.',
                output: orchData?.output || 'No plan output yet.',
            } as Agent);
            setActiveTab('instructions');
            return;
        }
        // Merge node — show real prompt data if available
        if (node.type === 'merge') {
            const mergeData = agents.find(a => a.id === '__merge__');
            setSelectedAgent({
                id: 'merge',
                missionId: '',
                name: 'Synthesizer',
                role: 'synthesizer',
                systemPrompt: mergeData?.systemPrompt || 'The Synthesizer merges agent outputs into a unified result.',
                status: node.status as any,
                progress: node.progress,
                color: 'var(--color-success)',
                finalPrompt: mergeData?.finalPrompt || 'Synthesizer has not run yet.',
                output: mergeData?.output || 'No merged output yet.',
            } as Agent);
            setActiveTab('instructions');
            return;
        }
        // Regular agent node
        if (node.type === 'agent') {
            const agent = agents.find(a => a.id === node.id);
            if (agent) {
                setSelectedAgent(agent);
                setActiveTab('instructions');
            }
        }
    };

    return (
        <main className="canvas">
            <div className="canvas__grid" />

            <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
            >
                {connections.map((conn) => {
                    const midX = (conn.x1 + conn.x2) / 2;
                    const path = `M ${conn.x1} ${conn.y1} C ${midX} ${conn.y1}, ${midX} ${conn.y2}, ${conn.x2} ${conn.y2}`;
                    return (
                        <g key={conn.key}>
                            <path
                                d={path}
                                fill="none"
                                stroke="var(--color-surface-light)"
                                strokeWidth="0.3"
                                vectorEffect="non-scaling-stroke"
                            />
                            {conn.active && (
                                <path
                                    d={path}
                                    fill="none"
                                    stroke={conn.color}
                                    strokeWidth="0.3"
                                    className="flow-line"
                                    opacity="0.6"
                                    vectorEffect="non-scaling-stroke"
                                />
                            )}
                        </g>
                    );
                })}
            </svg>

            <div className="canvas__content">
                {nodes.map((node) => (
                    <div
                        key={node.id}
                        className={`flow-node ${node.status === 'active' ? 'flow-node--active' : ''} ${agents.length > 0 || node.type === 'orchestrator' || node.type === 'merge' ? 'node-appear' : ''} flow-node--clickable`}
                        style={{
                            position: 'absolute',
                            left: `${node.x}%`,
                            top: `${node.y}%`,
                            transform: 'translate(-50%, -50%)',
                            border: getBorderStyle(node),
                            opacity: getOpacity(node),
                            boxShadow: node.status === 'active' ? `0 0 15px ${node.color}40` : undefined,
                            filter: node.status === 'idle' || node.status === 'pending' ? 'grayscale(0.5)' : undefined,
                            minWidth: 190,
                            cursor: 'pointer',
                        }}
                        onClick={() => handleNodeClick(node)}
                    >
                        <div className="flow-node__header">
                            <div
                                className="flow-node__icon"
                                style={{
                                    backgroundColor: `${node.color}20`,
                                    color: node.color,
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{node.icon}</span>
                            </div>
                            <div>
                                <div className="flow-node__role" style={{ color: node.color }}>{node.roleName}</div>
                                <div className="flow-node__label">{node.label}</div>
                            </div>
                        </div>

                        {node.status === 'active' && (
                            <>
                                <div className="progress-bar">
                                    <div
                                        className="progress-bar__fill progress-bar__fill--animated"
                                        style={{
                                            width: `${node.progress}%`,
                                            backgroundColor: node.color,
                                        }}
                                    />
                                </div>
                                {node.statusText && (
                                    <div className="flow-node__status">
                                        <span>{node.statusText}</span>
                                    </div>
                                )}
                            </>
                        )}

                        {node.status === 'waiting' && (
                            <div className="flow-node__waiting">
                                Waiting for data...
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Agent Detail Popup */}
            {selectedAgent && (
                <div className="agent-popup-overlay" onClick={() => setSelectedAgent(null)}>
                    <div className="agent-popup" onClick={(e) => e.stopPropagation()}>
                        <div className="agent-popup__header">
                            <div className="agent-popup__title-row">
                                <div
                                    className="agent-popup__icon"
                                    style={{ backgroundColor: `${selectedAgent.color}20`, color: selectedAgent.color }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                                        {getIconForRole(selectedAgent.role)}
                                    </span>
                                </div>
                                <div>
                                    <h3 className="agent-popup__name">{selectedAgent.name}</h3>
                                    <span className="agent-popup__role" style={{ color: selectedAgent.color }}>
                                        {selectedAgent.role}
                                    </span>
                                </div>
                            </div>
                            <button className="agent-popup__close" onClick={() => setSelectedAgent(null)}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="agent-popup__tabs">
                            <button
                                className={`agent-popup__tab ${activeTab === 'instructions' ? 'agent-popup__tab--active' : ''}`}
                                onClick={() => setActiveTab('instructions')}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>description</span>
                                Instructions
                            </button>
                            <button
                                className={`agent-popup__tab ${activeTab === 'output' ? 'agent-popup__tab--active' : ''}`}
                                onClick={() => setActiveTab('output')}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>output</span>
                                Output
                            </button>
                            <button
                                className={`agent-popup__tab ${activeTab === 'fullPrompt' ? 'agent-popup__tab--active' : ''}`}
                                onClick={() => setActiveTab('fullPrompt')}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>
                                Sent to AI
                            </button>
                        </div>

                        <div className="agent-popup__content">
                            {activeTab === 'instructions' ? (
                                <div className="agent-popup__text">
                                    {selectedAgent.id === 'orchestrator' || selectedAgent.id === 'merge'
                                        ? selectedAgent.systemPrompt
                                        : selectedAgent.taskPrompt || selectedAgent.systemPrompt || 'No task instructions available.'}
                                </div>
                            ) : activeTab === 'output' ? (
                                <div className="agent-popup__text">
                                    {selectedAgent.output || (
                                        selectedAgent.status === 'active'
                                            ? 'Agent is still working...'
                                            : selectedAgent.status === 'failed'
                                                ? 'Agent failed to produce output.'
                                                : 'No output yet.'
                                    )}
                                </div>
                            ) : (
                                <div className="agent-popup__text">
                                    {selectedAgent.finalPrompt || (
                                        selectedAgent.status === 'waiting'
                                            ? 'Prompt will be assembled when dependencies complete.'
                                            : selectedAgent.status === 'idle'
                                                ? 'Agent has not started yet.'
                                                : 'No prompt data available.'
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="agent-popup__footer">
                            <span className={`agent-popup__status agent-popup__status--${selectedAgent.status}`}>
                                {selectedAgent.status === 'completed' ? '✅ Completed' :
                                    selectedAgent.status === 'active' ? '🔄 Running' :
                                        selectedAgent.status === 'failed' ? '❌ Failed' :
                                            '⏳ Pending'}
                            </span>
                            <span className="agent-popup__progress">{selectedAgent.progress}%</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Canvas Controls */}
            <div className="canvas__controls">
                <button className="icon-btn" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-light)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                </button>
                <button className="icon-btn" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-light)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>remove</span>
                </button>
                <button className="icon-btn" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-light)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>center_focus_strong</span>
                </button>
            </div>
        </main>
    );
};

export default ThinkingFlowCanvas;
