import React, { useState } from 'react';
import type { MissionStatus, Agent } from '../../shared/types';

interface MissionBarProps {
    goal: string;
    status: MissionStatus;
    elapsed: string;
    agents: Agent[];
    onNewMission?: () => void;
}

const STATUS_CONFIG: Record<MissionStatus, { label: string; dotClass: string; badgeClass: string }> = {
    idle: { label: 'Idle', dotClass: '', badgeClass: 'status-badge--idle' },
    planning: { label: 'Planning Phase', dotClass: 'pulse-dot--warning', badgeClass: 'status-badge--planning' },
    executing: { label: 'Executing', dotClass: 'pulse-dot--accent', badgeClass: 'status-badge--executing' },
    completed: { label: 'Completed', dotClass: 'pulse-dot--success', badgeClass: 'status-badge--completed' },
    failed: { label: 'Failed', dotClass: 'pulse-dot--danger', badgeClass: 'status-badge--failed' },
};

const MissionBar: React.FC<MissionBarProps> = ({ goal, status, elapsed, agents, onNewMission }) => {
    const config = STATUS_CONFIG[status];
    const activeAgents = agents.filter(a => a.status !== 'idle');
    const [showGoalPopup, setShowGoalPopup] = useState(false);

    return (
        <>
            <header className="mission-bar">
                {/* Left: Brand + Mission Info */}
                <div className="flex items-center gap-6">
                    <div className="mission-bar__brand">
                        <div className="mission-bar__icon">
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>rocket_launch</span>
                        </div>
                        <div>
                            <h1 className="mission-bar__title">Mission Control</h1>
                            <p className="mission-bar__subtitle">Orchestrator v2.4</p>
                        </div>
                    </div>

                    <div className="mission-bar__divider" />

                    <div className="flex items-center gap-4">
                        <div className="flex-col">
                            <span className="mission-bar__goal-label">Current Mission</span>
                            <span
                                className="mission-bar__goal-text"
                                onClick={() => goal && setShowGoalPopup(true)}
                                title={goal || undefined}
                                style={{ cursor: goal ? 'pointer' : 'default' }}
                            >
                                {goal ? (goal.length > 100 ? goal.slice(0, 100) + '...' : goal) : 'No active mission'}
                            </span>
                        </div>
                        <div className={`status-badge ${config.badgeClass}`}>
                            {status !== 'idle' && status !== 'completed' && (
                                <div className={`pulse-dot ${config.dotClass}`} />
                            )}
                            <span>{config.label}</span>
                        </div>
                    </div>
                </div>

                {/* Right: Timer + Agents + Controls */}
                <div className="flex items-center gap-6">
                    <div className="flex-col text-right">
                        <span className="mission-bar__elapsed-label">Elapsed Time</span>
                        <span className="mission-bar__elapsed-time">{elapsed}</span>
                    </div>

                    <div className="mission-bar__divider" />

                    <div className="flex items-center gap-3">
                        <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>
                            {activeAgents.length} Agent{activeAgents.length !== 1 ? 's' : ''} Active
                        </span>
                        <div className="agent-avatars">
                            {agents.map((agent) => (
                                <div
                                    key={agent.id}
                                    className="agent-avatar"
                                    style={{ backgroundColor: agent.color }}
                                    title={agent.name}
                                >
                                    {agent.name.charAt(0)}
                                </div>
                            ))}
                        </div>

                        {onNewMission && (
                            <button className="new-mission-btn" onClick={onNewMission} title="New Mission">
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                                New
                            </button>
                        )}
                        <button className="icon-btn" title="Pause">
                            <span className="material-symbols-outlined">pause</span>
                        </button>
                        <button className="icon-btn icon-btn--danger" title="Stop">
                            <span className="material-symbols-outlined">stop</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Goal Popup Overlay */}
            {showGoalPopup && (
                <div className="goal-popup-overlay" onClick={() => setShowGoalPopup(false)}>
                    <div className="goal-popup" onClick={(e) => e.stopPropagation()}>
                        <div className="goal-popup__header">
                            <div className="goal-popup__icon">
                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>target</span>
                            </div>
                            <h3>Mission Objective</h3>
                            <button
                                className="icon-btn"
                                onClick={() => setShowGoalPopup(false)}
                                style={{ marginLeft: 'auto' }}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="goal-popup__body">
                            <p>{goal}</p>
                        </div>
                        <div className="goal-popup__footer">
                            <div className={`status-badge ${config.badgeClass}`}>
                                {status !== 'idle' && status !== 'completed' && (
                                    <div className={`pulse-dot ${config.dotClass}`} />
                                )}
                                <span>{config.label}</span>
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>{elapsed}</span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default MissionBar;
