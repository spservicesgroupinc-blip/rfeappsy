import React from 'react';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { useCalculator } from '../context/CalculatorContext';
import { ChatInterface } from './ChatInterface';

export const ChatPage: React.FC = () => {
    const { state, dispatch } = useCalculator();
    const { ui, session } = state;
    const estimateId = ui.editingEstimateId;

    if (!estimateId) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-50 p-6">
                <div className="text-center">
                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">No Job Selected</h2>
                    <p className="text-slate-500 mb-6">Please select a job to view its chat.</p>
                    <button
                        onClick={() => dispatch({ type: 'SET_VIEW', payload: session?.role === 'crew' ? 'dashboard' : 'dashboard' })}
                        className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest"
                    >
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const job = state.appData.savedEstimates.find(e => e.id === estimateId);
    if (!job) return <div>Job not found</div>;

    const handleBack = () => {
        if (session?.role === 'crew') {
            // For crew, we likely want to go back to the dashboard (or maybe re-open the job modal if possible, 
            // but going to dashboard is safer/simpler for now).
            // Actually, if we set view to dashboard, CrewDashboard renders. 
            // We might want to clear 'editingEstimateId' if we want to reset selection, or keep it.
            // Keeping it might interfere if CrewDashboard tries to auto-open. 
            // Let's just go to dashboard.
            dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
        } else {
            // For admin, go back to estimate detail
            dispatch({ type: 'SET_VIEW', payload: 'estimate_detail' });
        }
    };

    return (
        <div className="flex flex-col h-[100dvh] bg-slate-100">
            {/* Header */}
            <div className="bg-white px-6 py-4 flex items-center justify-between shadow-sm border-b border-slate-200 z-10">
                <button
                    onClick={handleBack}
                    className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors uppercase text-[10px] font-black tracking-widest"
                >
                    <ArrowLeft className="w-5 h-5" /> Back
                </button>
                <div className="text-center">
                    <h1 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2 justify-center">
                        <MessageCircle className="w-4 h-4 text-brand" />
                        {job.customer.name}
                    </h1>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Job Chat</p>
                </div>
                <div className="w-16"></div> {/* Spacer for center alignment */}
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-hidden">
                <ChatInterface
                    estimateId={estimateId}
                    sender={session?.role === 'crew' ? 'Crew' : 'Admin'}
                    height="h-full"
                />
            </div>
        </div>
    );
};
