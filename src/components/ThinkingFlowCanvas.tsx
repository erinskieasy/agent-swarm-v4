import React, { useMemo } from 'react';
import type { Agent, Step } from '../../shared/types';

interface ThinkingFlowCanvasProps {
    agents: Agent[];
    steps: Step[];
}

const ROLE_ICONS: Record<string, string> = {
    orchestrator: 'psychology',
    researcher: 'search',
    writer: 'edit_note',
    reviewer: 'fact_check',
    analyst: 'analytics',
};

const ThinkingFlowCanvas: React.FC<ThinkingFlowCanvasProps> = ({ agents, steps }) => {
    // Layout nodes
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
            x: 12,
            y: 50,
            type: 'orchestrator',
        });

        // Agent nodes
        const agentCount = agents.length || 3;
        const agentSpacing = 70 / (agentCount + 1);

        if (agents.length > 0) {
            agents.forEach((agent, i) => {
                const yPos = 15 + agentSpacing * (i + 1);
                result.push({
                    id: agent.id,
                    label: agent.role === 'researcher' ? 'Scanning Market' :
                        agent.role === 'writer' ? 'Draft Strategy' : 'Verify Output',
                    role: agent.role,
                    roleName: agent.name.replace(' Agent', ''),
                    icon: ROLE_ICONS[agent.role] || 'smart_toy',
                    color: agent.color,
                    status: agent.status,
                    progress: agent.progress,
                    x: 45,
                    y: yPos,
                    type: 'agent',
                    statusText: agent.status === 'active' ?
                        `Processing... ${agent.progress}%` :
                        agent.status === 'waiting' ? 'Waiting for data...' :
                            agent.status === 'completed' ? 'Done' : undefined,
                });
            });
        } else {
            // Placeholder agents when no mission
            const placeholders = [
                { name: 'Researcher', role: 'researcher', color: 'var(--color-accent)' },
                { name: 'Writer', role: 'writer', color: 'var(--color-secondary)' },
                { name: 'Reviewer', role: 'reviewer', color: 'var(--color-primary)' },
            ];
            placeholders.forEach((ph, i) => {
                result.push({
                    id: `placeholder-${i}`,
                    label: ph.role === 'researcher' ? 'Scanning Market' :
                        ph.role === 'writer' ? 'Draft Strategy' : 'Verify Output',
                    role: ph.role,
                    roleName: ph.name,
                    icon: ROLE_ICONS[ph.role],
                    color: ph.color,
                    status: 'idle',
                    progress: 0,
                    x: 45,
                    y: 15 + agentSpacing * (i + 1),
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
            x: 78,
            y: 50,
            type: 'merge',
        });

        return result;
    }, [agents, steps]);

    // Generate SVG connection paths
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

        if (orchestratorNode) {
            agentNodes.forEach((agent, i) => {
                lines.push({
                    key: `orch-${i}`,
                    x1: orchestratorNode.x + 12,
                    y1: orchestratorNode.y,
                    x2: agent.x - 2,
                    y2: agent.y,
                    color: agent.color,
                    active: agent.status === 'active' || agent.status === 'completed',
                });
            });
        }

        if (mergeNode) {
            agentNodes.forEach((agent, i) => {
                lines.push({
                    key: `agent-merge-${i}`,
                    x1: agent.x + 15,
                    y1: agent.y,
                    x2: mergeNode.x - 2,
                    y2: mergeNode.y,
                    color: agent.color,
                    active: agent.status === 'completed',
                });
            });
        }

        return lines;
    }, [nodes]);

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
                        className={`flow-node ${node.status === 'active' ? 'flow-node--active' : ''} ${agents.length > 0 || node.type === 'orchestrator' || node.type === 'merge' ? 'node-appear' : ''}`}
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
                        }}
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
