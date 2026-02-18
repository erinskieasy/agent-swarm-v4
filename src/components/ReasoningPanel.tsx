import React, { useEffect, useRef } from 'react';
import type { ReasoningLog, AgentRole } from '../../shared/types';

interface ReasoningPanelProps {
    logs: ReasoningLog[];
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

const ReasoningPanel: React.FC<ReasoningPanelProps> = ({ logs }) => {
    const bodyRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new logs
    useEffect(() => {
        if (bodyRef.current) {
            bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <aside className="reasoning-panel">
            <div className="reasoning-panel__header">
                <h3>Reasoning Engine</h3>
                <button className="icon-btn" style={{ width: 24, height: 24 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>history</span>
                </button>
            </div>

            <div className="reasoning-panel__body" ref={bodyRef}>
                {logs.length === 0 ? (
                    <div className="empty-state">
                        <span className="material-symbols-outlined">psychology</span>
                        <p>The reasoning engine will show the AI's thought process here.</p>
                    </div>
                ) : (
                    logs.map((log, i) => {
                        const isLast = i === logs.length - 1;
                        const color = ROLE_COLORS[log.agentRole || 'orchestrator'] || 'var(--color-text-dim)';

                        return (
                            <div key={log.id} className="thought-item fade-in-up">
                                <div className="thought-item__timeline">
                                    <div
                                        className="thought-item__dot"
                                        style={{
                                            backgroundColor: color,
                                            boxShadow: isLast ? `0 0 8px ${color}` : undefined,
                                            animation: isLast ? 'pulse-opacity 1.5s ease infinite' : undefined,
                                        }}
                                    />
                                    {!isLast && <div className="thought-item__line" />}
                                </div>
                                <div className="thought-item__content">
                                    <div className="thought-item__meta">
                                        <span className="thought-item__agent" style={{ color }}>
                                            {log.agentName || 'System'}
                                        </span>
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
                    })
                )}
            </div>

            <div className="reasoning-panel__input-area">
                <div className="reasoning-panel__input-wrapper">
                    <input
                        className="reasoning-panel__input"
                        type="text"
                        placeholder="Intervene or ask question..."
                    />
                    <button className="reasoning-panel__send-btn">
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_upward</span>
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default ReasoningPanel;
