import React from 'react';
import type { ToolUsed } from '../../shared/types';

interface ToolsMemoryPanelProps {
    tools: ToolUsed[];
    confidence: number;
    memoryItems: string[];
    sourceCount: number;
}

const TOOL_ICONS: Record<string, { icon: string; color: string }> = {
    'Web Search': { icon: 'travel_explore', color: 'var(--color-accent)' },
    'Data Analysis': { icon: 'table_chart', color: '#4ade80' },
    'CRM Access': { icon: 'database', color: '#fb923c' },
};

const ToolsMemoryPanel: React.FC<ToolsMemoryPanelProps> = ({
    tools,
    confidence,
    memoryItems,
    sourceCount,
}) => {
    const circumference = 2 * Math.PI * 15.9155;
    const dashArray = `${(confidence / 100) * circumference}, ${circumference}`;

    return (
        <aside className="sidebar">
            {/* Confidence Gauge */}
            <div className="sidebar__section sidebar__section--bordered">
                <h3 className="sidebar__heading">System Confidence</h3>
                <div className="confidence-gauge">
                    <div className="confidence-gauge__ring">
                        <svg viewBox="0 0 36 36">
                            <path
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="var(--color-surface-light)"
                                strokeWidth="3"
                            />
                            <path
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="var(--color-success)"
                                strokeWidth="3"
                                strokeDasharray={dashArray}
                                style={{ transition: 'stroke-dasharray 0.5s ease' }}
                            />
                        </svg>
                        <div className="confidence-gauge__value">{confidence}%</div>
                    </div>
                    <div>
                        <div className="confidence-gauge__label">
                            {confidence >= 80 ? 'High' : confidence >= 50 ? 'Medium' : 'Low'} Confidence
                        </div>
                        <div className="confidence-gauge__sublabel">Based on {sourceCount} sources</div>
                    </div>
                </div>
            </div>

            {/* Tools */}
            <div className="sidebar__section sidebar__section--bordered overflow-y-auto">
                <h3 className="sidebar__heading">
                    Active Tools
                    <span className="sidebar__badge">{tools.length}</span>
                </h3>
                <div>
                    {tools.length === 0 ? (
                        <>
                            {/* Default tools when no mission is running */}
                            <div className="tool-item">
                                <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: 18 }}>
                                    travel_explore
                                </span>
                                <span>Web Search</span>
                                <span className="tool-item__dot tool-item__dot--idle" />
                            </div>
                            <div className="tool-item">
                                <span className="material-symbols-outlined" style={{ color: '#4ade80', fontSize: 18 }}>
                                    table_chart
                                </span>
                                <span>Data Analysis</span>
                                <span className="tool-item__dot tool-item__dot--idle" />
                            </div>
                            <div className="tool-item">
                                <span className="material-symbols-outlined" style={{ color: '#fb923c', fontSize: 18 }}>
                                    database
                                </span>
                                <span>CRM Access</span>
                                <span className="tool-item__dot tool-item__dot--idle" />
                            </div>
                        </>
                    ) : (
                        tools.map((tool) => {
                            const config = TOOL_ICONS[tool.toolName] || { icon: 'build', color: 'var(--color-text-dim)' };
                            return (
                                <div key={tool.id} className="tool-item">
                                    <span className="material-symbols-outlined" style={{ color: config.color, fontSize: 18 }}>
                                        {config.icon}
                                    </span>
                                    <span>{tool.toolName}</span>
                                    <span className={`tool-item__dot ${tool.status === 'active' || tool.status === 'completed'
                                            ? 'tool-item__dot--active'
                                            : 'tool-item__dot--idle'
                                        }`} />
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Memory Context */}
            <div className="sidebar__section overflow-y-auto flex-1">
                <h3 className="sidebar__heading">Memory Context</h3>
                {memoryItems.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>
                        No context loaded yet. Start a mission to build context.
                    </p>
                ) : (
                    memoryItems.map((item, i) => (
                        <div key={i} className="memory-item">
                            <p>{item}</p>
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="sidebar__section--footer">
                <button className="configure-btn">
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>settings</span>
                    Configure Agents
                </button>
            </div>
        </aside>
    );
};

export default ToolsMemoryPanel;
