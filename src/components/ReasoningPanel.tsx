import React, { useState, useEffect, useRef } from 'react';
import type { ReasoningLog, AgentRole } from '../../shared/types';

interface ReasoningPanelProps {
    logs: ReasoningLog[];
    missionStatus: string;
    onFollowUp: (question: string) => void;
}

const ROLE_COLORS: Record<string, string> = {
    orchestrator: 'var(--color-text-dim)',
    researcher: 'var(--color-accent)',
    writer: 'var(--color-secondary)',
    reviewer: 'var(--color-primary)',
    analyst: '#4ade80',
};

function getTimestamp(log: ReasoningLog, firstLog?: ReasoningLog): string {
    if (!firstLog) return '00:00';
    const start = new Date(firstLog.timestamp).getTime();
    const current = new Date(log.timestamp).getTime();
    const diff = Math.max(0, current - start);
    const totalSeconds = Math.floor(diff / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

const ReasoningPanel: React.FC<ReasoningPanelProps> = ({ logs, missionStatus, onFollowUp }) => {
    const bodyRef = useRef<HTMLDivElement>(null);
    const [question, setQuestion] = useState('');

    // Auto-scroll to bottom on new logs
    useEffect(() => {
        if (bodyRef.current) {
            bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }
    }, [logs]);

    const isCompleted = missionStatus === 'completed';
    const isActive = missionStatus === 'planning' || missionStatus === 'executing' || missionStatus === 'interpreting';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (question.trim() && isCompleted) {
            onFollowUp(question.trim());
            setQuestion('');
        }
    };

    const getPlaceholder = () => {
        if (isCompleted) return 'Ask a follow-up question...';
        if (isActive) return 'Agents working...';
        return 'Waiting for mission...';
    };

    return (
        <aside className="reasoning-panel">
            <div className="reasoning-panel__header">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>neurology</span>
                REASONING ENGINE
                <button
                    className="reasoning-panel__clear-btn"
                    title="Clear"
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-text-ultra-dim)' }}>
                        history
                    </span>
                </button>
            </div>

            <div className="reasoning-panel__body" ref={bodyRef}>
                {logs.length === 0 && (
                    <div className="reasoning-panel__empty">
                        Reasoning trace will appear here...
                    </div>
                )}
                {logs.map((log, index) => {
                    const color = ROLE_COLORS[log.agentRole || ''] || 'var(--color-text-dim)';
                    const isLast = index === logs.length - 1;
                    return (
                        <div key={index} className="thought-item">
                            <div className="thought-item__indicator">
                                <div
                                    className="thought-item__dot"
                                    style={{ backgroundColor: color }}
                                />
                                {index < logs.length - 1 && (
                                    <div className="thought-item__line" />
                                )}
                            </div>
                            <div className="thought-item__content">
                                <div className="thought-item__meta">
                                    <span className="thought-item__dot-mini" style={{ backgroundColor: color }} />
                                    <span className="thought-item__agent">{log.agentName}</span>
                                    <span className="thought-item__time">
                                        {getTimestamp(log, logs[0])}
                                    </span>
                                </div>
                                <div
                                    className="thought-item__bubble"
                                    style={{
                                        borderColor: isLast ? `${color}30` : undefined,
                                    }}
                                >
                                    {log.content}
                                    {log.sources && log.sources.length > 0 && (
                                        <div className="thought-item__sources">
                                            {log.sources.map((source, si) => (
                                                <span key={si} className="source-badge">{source}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="reasoning-panel__input-area">
                <form className="reasoning-panel__input-wrapper" onSubmit={handleSubmit}>
                    <input
                        className="reasoning-panel__input"
                        type="text"
                        placeholder={getPlaceholder()}
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        disabled={!isCompleted}
                    />
                    <button
                        className="reasoning-panel__send-btn"
                        type="submit"
                        disabled={!question.trim() || !isCompleted}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_upward</span>
                    </button>
                </form>
            </div>
        </aside>
    );
};

export default ReasoningPanel;
