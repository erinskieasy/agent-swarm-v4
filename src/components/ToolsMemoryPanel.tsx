import React, { useState, useRef } from 'react';
import type { ToolUsed } from '../../shared/types';

export interface DocumentInfo {
    id: string;
    filename: string;
    sizeBytes: number;
    status: string;
}

export interface WebSearchSource {
    title: string;
    url: string;
}

interface ToolsMemoryPanelProps {
    tools: ToolUsed[];
    confidence: number;
    memoryItems: string[];
    sourceCount: number;
    missionId: string | null;
    documents: DocumentInfo[];
    webSearchSources: WebSearchSource[];
    onUploadFiles: (files: File[]) => void;
}

const TOOL_CONFIGS: Array<{
    key: string;
    name: string;
    icon: string;
    color: string;
}> = [
        { key: 'file-search', name: 'File Search', icon: 'folder_open', color: '#4ade80' },
        { key: 'web-search', name: 'Web Search', icon: 'travel_explore', color: 'var(--color-accent)' },
    ];

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDomain(url: string): string {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return url;
    }
}

const ToolsMemoryPanel: React.FC<ToolsMemoryPanelProps> = ({
    tools,
    confidence,
    memoryItems,
    sourceCount,
    missionId,
    documents,
    webSearchSources,
    onUploadFiles,
}) => {
    const [expandedTool, setExpandedTool] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const circumference = 2 * Math.PI * 15.9155;
    const dashArray = `${(confidence / 100) * circumference}, ${circumference}`;

    const toggleTool = (key: string) => {
        setExpandedTool((prev) => (prev === key ? null : key));
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            onUploadFiles(Array.from(e.target.files));
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Determine tool activity status
    const getToolStatus = (key: string): 'active' | 'idle' | 'has-data' => {
        if (key === 'web-search') {
            const hasActive = tools.some(t => t.toolName === 'Web Search' && t.status === 'active');
            if (hasActive) return 'active';
            return webSearchSources.length > 0 ? 'has-data' : 'idle';
        }
        if (key === 'file-search') {
            const hasActive = tools.some(t => t.toolName === 'Data Analysis' && t.status === 'active');
            if (hasActive) return 'active';
            return documents.length > 0 ? 'has-data' : 'idle';
        }
        return 'idle';
    };

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

            {/* Tools — Interactive Accordion */}
            <div className="sidebar__section sidebar__section--bordered overflow-y-auto">
                <h3 className="sidebar__heading">
                    Active Tools
                    <span className="sidebar__badge">{TOOL_CONFIGS.length}</span>
                </h3>
                <div className="tool-accordion">
                    {TOOL_CONFIGS.map((tool) => {
                        const isExpanded = expandedTool === tool.key;
                        const status = getToolStatus(tool.key);

                        return (
                            <div key={tool.key} className={`tool-accordion__item ${isExpanded ? 'tool-accordion__item--expanded' : ''}`}>
                                <button
                                    className="tool-accordion__header"
                                    onClick={() => toggleTool(tool.key)}
                                >
                                    <span className="material-symbols-outlined" style={{ color: tool.color, fontSize: 18 }}>
                                        {tool.icon}
                                    </span>
                                    <span className="tool-accordion__name">{tool.name}</span>
                                    <span className={`tool-item__dot tool-item__dot--${status === 'active' ? 'active' : status === 'has-data' ? 'active' : 'idle'}`} />
                                    <span
                                        className="material-symbols-outlined tool-accordion__chevron"
                                        style={{ fontSize: 16, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                    >
                                        expand_more
                                    </span>
                                </button>

                                {/* Expanded content */}
                                {isExpanded && (
                                    <div className="tool-accordion__body">
                                        {tool.key === 'web-search' && (
                                            <>
                                                {webSearchSources.length === 0 ? (
                                                    <p className="tool-accordion__empty">No web searches yet.</p>
                                                ) : (
                                                    <div className="tool-accordion__list">
                                                        {webSearchSources.map((source, i) => (
                                                            <a
                                                                key={i}
                                                                className="web-source-item"
                                                                href={source.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--color-accent)' }}>
                                                                    language
                                                                </span>
                                                                <span className="web-source-item__title">{source.title || getDomain(source.url)}</span>
                                                                <span className="web-source-item__domain">{getDomain(source.url)}</span>
                                                            </a>
                                                        ))}
                                                        <div className="tool-accordion__count">
                                                            {webSearchSources.length} source{webSearchSources.length !== 1 ? 's' : ''}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {tool.key === 'file-search' && (
                                            <>
                                                {documents.length === 0 && (
                                                    <p className="tool-accordion__empty">No documents uploaded.</p>
                                                )}
                                                {documents.length > 0 && (
                                                    <div className="tool-accordion__list">
                                                        {documents.map((doc) => (
                                                            <div key={doc.id} className="doc-item">
                                                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#4ade80' }}>
                                                                    description
                                                                </span>
                                                                <span className="doc-item__name">{doc.filename}</span>
                                                                <span className="doc-item__size">{formatFileSize(doc.sizeBytes)}</span>
                                                                <span className={`doc-item__status doc-item__status--${doc.status}`}>
                                                                    {doc.status === 'processing' ? '⏳' : doc.status === 'ready' ? '✓' : '✗'}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <button
                                                    className="tool-accordion__upload-btn"
                                                    onClick={() => fileInputRef.current?.click()}
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                                                    Upload more files
                                                </button>
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept=".pdf,.txt,.csv,.md,.json"
                                                    multiple
                                                    onChange={handleFileUpload}
                                                    style={{ display: 'none' }}
                                                />
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
