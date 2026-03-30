'use client';

import { useState, useRef, useEffect } from 'react';
import { SendHorizontal, Share2, Menu, X, Wifi, WifiOff } from 'lucide-react';

// Lightweight markdown renderer for chat messages
function renderMarkdown(text) {
  if (!text) return null;

  // Split into paragraphs by double newlines
  const paragraphs = text.split(/\n\n+/);

  return paragraphs.map((para, pIdx) => {
    // Split paragraph into lines
    const lines = para.split('\n');

    // Check if this paragraph is a list (lines starting with - or *)
    const isList = lines.every(l => /^\s*[-*]\s/.test(l) || l.trim() === '');
    if (isList) {
      const items = lines.filter(l => /^\s*[-*]\s/.test(l));
      return (
        <ul key={pIdx} className="list-disc list-inside my-1 space-y-0.5">
          {items.map((item, i) => (
            <li key={i}>{renderInline(item.replace(/^\s*[-*]\s+/, ''))}</li>
          ))}
        </ul>
      );
    }

    return (
      <p key={pIdx} className={pIdx > 0 ? 'mt-2' : ''}>
        {lines.map((line, lIdx) => (
          <span key={lIdx}>
            {lIdx > 0 && <br />}
            {renderInline(line)}
          </span>
        ))}
      </p>
    );
  });
}

// Render inline markdown: **bold**, *italic*, and phone/address formatting
function renderInline(text) {
  if (!text) return null;

  // Split by **bold** patterns
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const userMessageCountRef = useRef(0);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.log('Service Worker registration failed:', err);
      });
    }
  }, []);

  // Handle beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Show install prompt after 2 user messages
  useEffect(() => {
    if (
      deferredPrompt &&
      !installDismissed &&
      userMessageCountRef.current === 2 &&
      !showInstallPrompt
    ) {
      setShowInstallPrompt(true);
    }
  }, [deferredPrompt, installDismissed, showInstallPrompt]);

  // Online/offline detection
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle suggested query click
  const handleSuggestedQuery = (query) => {
    setInput(query);
    // Focus input so keyboard pops up
    inputRef.current?.focus();
  };

  // Handle message send
  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    // Add user message to chat
    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setShowWelcome(false);
    setIsLoading(true);
    userMessageCountRef.current += 1;

    try {
      // Build conversation history (last 10 messages for context)
      const recentMessages = messages.slice(-10);
      const history = [...recentMessages, userMessage];

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          history,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);

      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          'Sorry, I had trouble getting a response. Please check your connection and try again.',
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle install button click
  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      setShowInstallPrompt(false);
      setInstallDismissed(true);
    }
  };

  // Handle share
  const handleShare = async (content) => {
    const shareText = `From I Live Here Westchester: ${content} — Try it at ilhw.app`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'I Live Here Westchester',
          text: shareText,
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        // Show brief feedback
        const originalButton = event.currentTarget;
        const originalText = originalButton.innerHTML;
        originalButton.innerHTML = 'Copied!';
        setTimeout(() => {
          originalButton.innerHTML = originalText;
        }, 2000);
      } catch (err) {
        console.error('Copy failed:', err);
      }
    }
  };

  // Suggested queries for welcome state
  const suggestedQueries = [
    "What's happening this weekend in Rye?",
    'Best Italian restaurants in Larchmont',
    'Kids activities near Harrison',
    'Live music tonight in Westchester',
  ];

  return (
    <div className="flex flex-col h-screen bg-brand-dark text-white">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-brand-navy/95 backdrop-blur border-b border-white/10 pt-safe">
        <div className="flex items-center justify-between px-4 py-3 h-16">
          <div className="flex flex-col flex-1">
            <div className="text-base font-bold tracking-wider">I LIVE HERE</div>
            <div className="text-xs text-gray-300">WESTCHESTER</div>
          </div>
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="w-4 h-4 text-brand-green" />
            ) : (
              <WifiOff className="w-4 h-4 text-gray-400" />
            )}
            <Menu className="w-5 h-5 text-gray-300" />
          </div>
        </div>

        {/* Install Prompt Banner */}
        {showInstallPrompt && !installDismissed && (
          <div className="bg-brand-gold/20 border-t border-brand-gold/30 px-4 py-2 flex items-center justify-between">
            <span className="text-sm text-brand-gold">
              Add I Live Here to your home screen for quick access
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="text-xs bg-brand-gold text-brand-dark px-3 py-1 rounded-full font-semibold hover:bg-brand-gold/90 transition"
              >
                Install
              </button>
              <button
                onClick={() => {
                  setShowInstallPrompt(false);
                  setInstallDismissed(true);
                }}
                className="text-xs text-gray-300 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Chat Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto chat-scroll pt-20 pb-24 px-4"
      >
        {showWelcome && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-full py-8 text-center">
            <div className="mb-6">
              <div className="text-4xl font-bold mb-2 text-brand-gold">I LIVE HERE</div>
              <div className="text-xl font-semibold mb-6">WESTCHESTER</div>
              <div className="text-sm text-gray-300">Your AI guide to local everything</div>
            </div>

            <div className="w-full max-w-sm mb-8">
              <div className="text-xs text-gray-400 mb-4">Try these:</div>
              <div className="space-y-2">
                {suggestedQueries.map((query, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestedQuery(query)}
                    className="w-full text-left bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-gray-200 hover:bg-white/10 hover:border-white/20 transition no-select"
                  >
                    {query}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-gray-500">Ask me anything about Westchester County</div>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="bg-brand-blue text-white rounded-2xl rounded-br-md px-4 py-2 max-w-[85%] break-words">
                      <p className="text-sm">{msg.content}</p>
                      <div className="text-xs text-white/60 mt-1">
                        {new Date(parseInt(msg.id)).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand-navy flex items-center justify-center flex-shrink-0 text-xs font-bold text-white">
                      ILH
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-2 max-w-[85%] break-words">
                      <div className="text-sm leading-relaxed text-gray-100 markdown-content">{renderMarkdown(msg.content)}</div>
                      <div className="text-xs text-white/60 mt-1 flex justify-between items-center">
                        <span>
                          {new Date(parseInt(msg.id)).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <button
                          onClick={(e) => handleShare(msg.content)}
                          className="ml-2 p-1 hover:bg-white/10 rounded transition"
                          title="Share"
                          aria-label="Share message"
                        >
                          <Share2 className="w-3 h-3 text-gray-400 hover:text-gray-200" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-brand-navy flex items-center justify-center flex-shrink-0 text-xs font-bold text-white">
                  ILH
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-brand-dark/95 backdrop-blur border-t border-white/10 pb-safe pt-3">
        <form onSubmit={handleSendMessage} className="flex gap-2 px-4 mb-3 max-w-full">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
            placeholder="Ask about Westchester..."
            disabled={isLoading}
            className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-brand-blue focus:bg-white/15 transition disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-brand-blue text-white rounded-full p-2 hover:bg-brand-blue/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title="Send"
          >
            <SendHorizontal className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
