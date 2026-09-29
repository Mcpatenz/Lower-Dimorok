import React, { useState } from 'react';
import { Bot, Send, ShieldAlert, Sparkles, X } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sourceCategory?: string;
  guardrailTriggered?: boolean;
}

interface CivicAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  authHeaders: Record<string, string>;
}

const SUGGESTED_CIVIC_QUESTIONS = [
  'What are the requirements and fee for a Barangay Clearance?',
  'How do I avail of the FREE First-Time Job Seeker Certificate (RA 11261)?',
  'Who approves the Barangay Indigency Certificate and how much does it cost?',
  'What are the latest official announcements in Barangay Lower Dimorok?',
  'Write a Python script to scrape data (Test Out-of-Scope Guardrail)',
];

export const CivicAssistantDrawer: React.FC<CivicAssistantDrawerProps> = ({
  isOpen,
  onClose,
  authHeaders,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Maayong adlaw! I am AskLowerDimorok, the official Civic Assistant for Barangay Lower Dimorok, Molave, Zamboanga del Sur. Ask me about barangay services, requirements, statutory fees, official announcements, or application tracking.',
      sourceCategory: 'Barangay Lower Dimorok Citizen Charter',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const sendMessage = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text:
            data.reply ||
            data.error ||
            'I can help with Barangay Lower Dimorok services, procedures, requirements, official notices, and application information.',
          sourceCategory: data.sourceCategory || 'AskLowerDimorok Knowledge Base',
          guardrailTriggered: Boolean(data.guardrailTriggered),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: 'Unable to connect to AskLowerDimorok right now. Please check your internet connection and try again.',
          sourceCategory: 'Offline Fallback Notice',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full flex flex-col border-l border-slate-200 dark:border-slate-800 shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">AskLowerDimorok</h3>
              <p className="text-xs text-slate-300">
                Barangay Lower Dimorok · Guardrailed Civic Assistant
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 hover:text-white rounded-lg"
            aria-label="Close AI Assistant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Civic Scope Notice */}
        <div className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
          Strictly scoped to Barangay Lower Dimorok procedures, fees, requirements, and notices. Cannot modify records or approve requests.
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-800 text-white'
                    : msg.guardrailTriggered
                    ? 'bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                }`}
              >
                {msg.guardrailTriggered && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Civic Scope Redirection Active</span>
                  </div>
                )}
                <p className="whitespace-pre-line">{msg.text}</p>
              </div>
              {msg.sourceCategory && (
                <span className="text-[11px] text-slate-500 mt-1 px-1">
                  Source: {msg.sourceCategory}
                </span>
              )}
            </div>
          ))}

          {loading && (
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <Sparkles className="w-4 h-4 animate-spin text-emerald-700" />
              <span>Consulting Barangay Lower Dimorok Citizen Charter...</span>
            </div>
          )}

          {/* Quick Suggested Prompts */}
          <div className="pt-2">
            <p className="text-xs font-medium text-slate-500 mb-2">
              Suggested Civic Questions & Guardrail Test:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_CIVIC_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={loading}
                  className="text-left text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-700 dark:hover:border-emerald-500 text-slate-700 dark:text-slate-200 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Input Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-white dark:bg-slate-900"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about services, fees, or requirements..."
            className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center justify-center transition-colors"
            aria-label="Send question"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
