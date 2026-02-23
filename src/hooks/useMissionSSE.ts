import { useEffect, useRef, useCallback } from 'react';
import type { Agent, Step, ReasoningLog, ToolUsed, MissionResult, MissionStatus, InterpretationProposal } from '../../shared/types';

interface SSECallbacks {
    onMissionUpdate: (data: { id: string; status: MissionStatus }) => void;
    onAgentUpdate: (data: Partial<Agent>) => void;
    onStepUpdate: (data: Partial<Step>) => void;
    onReasoning: (data: ReasoningLog) => void;
    onToolUpdate: (data: Partial<ToolUsed>) => void;
    onResult: (data: MissionResult) => void;
    onError: (data: { message: string }) => void;
    onInterpretationProposal?: (data: InterpretationProposal) => void;
    onInterpretationStatus?: (data: { status: string; message: string }) => void;
    onDocumentUploaded?: (data: any) => void;
    onWebSearchResult?: (data: any) => void;
}

export function useMissionSSE(
    missionId: string | null,
    callbacks: SSECallbacks
) {
    const eventSourceRef = useRef<EventSource | null>(null);
    const callbacksRef = useRef(callbacks);
    callbacksRef.current = callbacks;

    const connect = useCallback((id: string) => {
        // Close existing connection
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const eventSource = new EventSource(`/events/${id}`);
        eventSourceRef.current = eventSource;

        eventSource.addEventListener('mission-update', (e) => {
            callbacksRef.current.onMissionUpdate(JSON.parse(e.data));
        });

        eventSource.addEventListener('agent-update', (e) => {
            callbacksRef.current.onAgentUpdate(JSON.parse(e.data));
        });

        eventSource.addEventListener('step-update', (e) => {
            callbacksRef.current.onStepUpdate(JSON.parse(e.data));
        });

        eventSource.addEventListener('reasoning', (e) => {
            callbacksRef.current.onReasoning(JSON.parse(e.data));
        });

        eventSource.addEventListener('tool-update', (e) => {
            callbacksRef.current.onToolUpdate(JSON.parse(e.data));
        });

        eventSource.addEventListener('result', (e) => {
            callbacksRef.current.onResult(JSON.parse(e.data));
        });

        eventSource.addEventListener('error', (e) => {
            if (e instanceof MessageEvent) {
                callbacksRef.current.onError(JSON.parse(e.data));
            }
        });

        eventSource.addEventListener('interpretation-proposal', (e) => {
            callbacksRef.current.onInterpretationProposal?.(JSON.parse(e.data));
        });

        eventSource.addEventListener('interpretation-status', (e) => {
            callbacksRef.current.onInterpretationStatus?.(JSON.parse(e.data));
        });

        eventSource.addEventListener('document-uploaded', (e) => {
            callbacksRef.current.onDocumentUploaded?.(JSON.parse(e.data));
        });

        eventSource.addEventListener('web-search-result', (e) => {
            callbacksRef.current.onWebSearchResult?.(JSON.parse(e.data));
        });

        eventSource.onerror = () => {
            // EventSource will auto-reconnect
            console.warn('SSE connection error, reconnecting...');
        };
    }, []);

    useEffect(() => {
        if (missionId) {
            connect(missionId);
        }

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
    }, [missionId, connect]);

    return {
        disconnect: () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        },
    };
}
