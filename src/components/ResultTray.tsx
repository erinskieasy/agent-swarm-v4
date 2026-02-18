import React, { useState } from 'react';
import type { MissionResult } from '../../shared/types';

interface ResultTrayProps {
    result: MissionResult | null;
    isRunning: boolean;
    agentNames: string[];
}

type TabId = 'answer' | 'sources' | 'trace';

const ResultTray: React.FC<ResultTrayProps> = ({ result, isRunning, agentNames }) => {
    const [activeTab, setActiveTab] = useState<TabId>('answer');
    const [minimized, setMinimized] = useState(false);

    const tabs: Array<{ id: TabId; label: string; icon: string; count?: number }> = [
        { id: 'answer', label: 'Final Answer', icon: 'auto_awesome' },
        { id: 'sources', label: 'Sources', icon: 'link', count: result?.sources?.length },
        { id: 'trace', label: 'Logic Trace', icon: 'account_tree' },
    ];

    return (
        <footer className={`result-tray ${minimized ? 'result-tray--minimized' : ''}`}>
            {/* Tabs */}
            <div className="result-tray__tabs">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={`result-tray__tab ${activeTab === tab.id ? 'result-tray__tab--active' : ''}`}
                        onClick={() => {
                            setActiveTab(tab.id);
                            if (minimized) setMinimized(false);
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{tab.icon}</span>
                        {tab.label}
                        {tab.count !== undefined && tab.count > 0 && (
                            <span className="result-tray__tab-count">{tab.count}</span>
                        )}
                    </button>
                ))}

                {/* Minimize / Expand button */}
                <button
                    className="result-tray__minimize-btn"
                    onClick={() => setMinimized(!minimized)}
                    title={minimized ? 'Expand panel' : 'Minimize panel'}
                >
                    <span className="material-symbols-outlined">
                        {minimized ? 'expand_less' : 'expand_more'}
                    </span>
                </button>
            </div>

            {/* Content — hidden when minimized */}
            {!minimized && (
                <div className="result-tray__content">
                    {activeTab === 'answer' && (
                        <div className="result-tray__answer fade-in-up">
                            <div className="result-tray__answer-icon">
                                <span className="material-symbols-outlined">lightbulb</span>
                            </div>
                            <div className="result-tray__answer-body" style={{ flex: 1 }}>
                                {!result && !isRunning && (
                                    <div className="empty-state" style={{ alignItems: 'flex-start', height: 'auto' }}>
                                        <p style={{ color: 'var(--color-text-dim)' }}>
                                            Start a mission to see results here.
                                        </p>
                                    </div>
                                )}

                                {isRunning && !result && (
                                    <>
                                        <h2 style={{ color: 'var(--color-text-muted)' }}>Processing Mission...</h2>
                                        <p>Agents are working on your request. Results will appear here when complete.</p>
                                        <div className="in-progress-indicator">
                                            <span className="material-symbols-outlined">edit</span>
                                            Agents are collaborating on the response...
                                        </div>
                                    </>
                                )}

                                {result && (
                                    <>
                                        <h2>Mission Complete</h2>
                                        <div style={{ whiteSpace: 'pre-wrap' }}>
                                            <p>{result.content}</p>
                                        </div>
                                        <div className="result-cards">
                                            <div className="result-card">
                                                <h4>Agents Involved</h4>
                                                <p>{result.agentsInvolved?.join(', ') || agentNames.join(', ')}</p>
                                            </div>
                                            <div className="result-card">
                                                <h4>Reasoning Summary</h4>
                                                <p>{result.reasoningSummary}</p>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'sources' && (
                        <div className="fade-in-up" style={{ maxWidth: 860, margin: '0 auto' }}>
                            {result?.sources && result.sources.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {result.sources.map((source, i) => (
                                        <div key={i} className="tool-item" style={{ margin: 0 }}>
                                            <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: 18 }}>link</span>
                                            <span>{source}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-state" style={{ height: 'auto' }}>
                                    <p style={{ color: 'var(--color-text-dim)' }}>No sources collected yet.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'trace' && (
                        <div className="fade-in-up" style={{ maxWidth: 860, margin: '0 auto' }}>
                            {result?.reasoningSummary ? (
                                <div className="thought-item__bubble" style={{ border: '1px solid var(--color-surface-light)' }}>
                                    {result.reasoningSummary}
                                </div>
                            ) : (
                                <div className="empty-state" style={{ height: 'auto' }}>
                                    <p style={{ color: 'var(--color-text-dim)' }}>Logic trace will appear after mission completion.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </footer>
    );
};

export default ResultTray;
