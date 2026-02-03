import React, { useState, useEffect, useRef } from 'react';
import { Send, User, ShieldCheck } from 'lucide-react';
import { useCalculator } from '../context/CalculatorContext';
import { sendMessage } from '../services/api';

interface ChatInterfaceProps {
    estimateId: string;
    sender: 'Admin' | 'Crew';
    height?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ estimateId, sender, height = 'h-96' }) => {
    const { state, dispatch } = useCalculator();
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Memorize message list to prevent re-renders on parent updates (e.g. Timer ticks)
    const jobMessages = React.useMemo(() => {
        return state.appData.messages
            ? state.appData.messages.filter(m => m.estimateId === estimateId).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            : [];
    }, [state.appData.messages, estimateId]);

    const scrollToBottom = (smooth = true) => {
        messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    };

    // Only scroll on MOUNT or when message COUNT increases (new message arrived)
    useEffect(() => {
        scrollToBottom();
    }, [jobMessages.length]);

    const handleSend = async () => {
        if (!inputText.trim() || !state.session?.spreadsheetId) return;

        const content = inputText;
        setInputText(''); // Optimistic clear
        setIsSending(true);

        try {
            // Optimistic UI Update (optional, or wait for heartbeat)
            // For now, we wait for heartbeat or explicit return to keep it simple, 
            // OR we can inject it into state immediately if we trust success.

            const result = await sendMessage(estimateId, content, sender, state.session.spreadsheetId);
            if (result && result.status === 'success' && result.data) {
                // In a perfect world we dispatch here, but Heartbeat will pick it up in <10s anyway.
                // Let's inject it to be snappy!
                dispatch({
                    type: 'RFE_HEARTBEAT_UPDATE',
                    payload: {
                        jobs: [],
                        messages: [result.data.message]
                    }
                });
            }
        } catch (e) {
            console.error("Failed to send message", e);
            alert("Failed to send. Please check connection.");
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className={`flex flex-col bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-inner ${height} relative isolate`}>
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {jobMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300">
                        <Send className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-xs font-bold uppercase tracking-widest">No messages yet</p>
                    </div>
                ) : (
                    jobMessages.map((msg) => {
                        const isMe = msg.sender === sender;
                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] rounded-2xl p-3 shadow-sm ${isMe ? 'bg-brand text-white rounded-br-none' : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'}`}>
                                    <div className="flex items-center gap-2 mb-1 opacity-80">
                                        {msg.sender === 'Admin' ? <ShieldCheck className="w-3 h-3" /> : <User className="w-3 h-3" />}
                                        <span className="text-[10px] font-black uppercase tracking-widest">{msg.sender}</span>
                                        <span className="text-[9px] font-normal">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white border-t border-slate-100 flex gap-2">
                <input
                    type="text"
                    className="flex-1 bg-slate-50 border-0 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-brand/20 outline-none transition-all"
                    placeholder="Type a message..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    disabled={isSending}
                />
                <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || isSending}
                    className="bg-slate-900 text-white p-3 rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    <Send className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};
