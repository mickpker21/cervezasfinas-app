import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, X, Minimize2, User, HelpCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export default function ChatWidget({ isOpen: controlledIsOpen, onClose, showButton = true }) {
    const { user } = useAuth();
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const messagesEndRef = useRef(null);
    const [lastId, setLastId] = useState(0);

    const isControlled = controlledIsOpen !== undefined;
    const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

    const handleToggle = () => {
        if (isControlled) {
            onClose && onClose(!isOpen);
        } else {
            setInternalIsOpen(!internalIsOpen);
        }
    };

    const handleClose = () => {
        if (isControlled) {
            onClose && onClose(false);
        } else {
            setInternalIsOpen(false);
        }
    };

    // Poll for messages
    useEffect(() => {
        if (!user) return;

        const fetchMessages = async () => {
            try {
                // If open, we want to fetch and mark as read (backend logic handles read status on poll mostly if we sent a flag, 
                // but our simple poll.php marks 'agent' messages read if we call it)
                // Actually poll.php marks read if we fetch. 
                // We might want to only mark read if isOpen?? 
                // For simplicity, let's assume if the widget is polling, it's "active" enough, 
                // but ideally we only want to clear unread count if open.
                // The current poll.php logic marks read on fetch. Let's stick to that for MVP or 
                // we can refine. For now it's fine.

                const res = await api.get(`/chat/poll.php?last_id=${lastId}`);
                if (res.success && res.messages.length > 0) {
                    setMessages(prev => {
                        // Merge and deduplicate using a Map
                        const combined = [...prev, ...res.messages];
                        const uniqueMap = new Map();
                        combined.forEach(msg => {
                            // If we have an existing message with this ID, keep the one with more info (usually the server one)
                            // or just overwrite. Last one wins in a loop usually works for updates.
                            uniqueMap.set(msg.id, msg);
                        });
                        return Array.from(uniqueMap.values()).sort((a, b) => a.id - b.id);
                    });

                    const newest = res.messages[res.messages.length - 1];
                    setLastId(newest.id);

                    if (!isOpen) {
                        const incoming = res.messages.filter(m => m.sender_type === 'agent').length;
                        if (incoming > 0) setUnreadCount(prev => prev + incoming);
                    }
                }
            } catch (error) {
                // silent fail
            }
        };

        fetchMessages(); // initial load
        const interval = setInterval(fetchMessages, 3000); // 3s polling
        return () => clearInterval(interval);
    }, [user, lastId, isOpen]);

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
            setUnreadCount(0);
        }
    }, [messages, isOpen]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const tempMsg = {
            id: Date.now(), // temp id
            sender_type: 'client',
            message: newMessage,
            created_at: new Date().toISOString()
        };

        // Optimistic update
        setMessages(prev => [...prev, tempMsg]);
        setNewMessage('');
        scrollToBottom();

        try {
            const res = await api.post('/chat/send.php', { message: tempMsg.message });
            if (res.success && res.id) {
                setMessages(prev => {
                    // Check if we already received this message via poll (race condition)
                    const alreadyExists = prev.some(m => m.id === res.id);
                    if (alreadyExists) {
                        // If it's already there (from poll), just remove the temp one
                        return prev.filter(m => m.id !== tempMsg.id);
                    } else {
                        // Otherwise, match the ID so future polls dedupe it
                        return prev.map(m => m.id === tempMsg.id ? { ...m, id: res.id } : m);
                    }
                });
            }
        } catch (error) {
            console.error('Send failed', error);
        }
    };

    if (!user) return null;

    return (
        <div className="relative">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, x: 20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9, x: 20 }}
                        className="fixed bottom-24 right-6 w-[350px] h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[100] border border-gray-100"
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-green-700 to-green-900 p-4 flex items-center justify-between text-white shadow-md">
                            <div className="flex items-center gap-3">
                                <div className="bg-white/20 p-2 rounded-full">
                                    <HelpCircle className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm">Soporte en Línea</h3>
                                    <p className="text-xs text-green-100/80">Tiempo de respuesta: ~5 min</p>
                                </div>
                            </div>
                            <button onClick={handleClose} className="hover:bg-white/20 p-1 rounded transition-colors">
                                <Minimize2 className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                            {messages.length === 0 && (
                                <div className="text-center text-gray-400 mt-10">
                                    <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                    <p className="text-sm">¡Hola! ¿En qué podemos ayudarte hoy?</p>
                                </div>
                            )}

                            {messages.map((msg, idx) => {
                                const isMe = msg.sender_type === 'client';
                                return (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${isMe
                                                ? 'bg-green-600 text-white rounded-tr-none'
                                                : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                                                }`}
                                        >
                                            <p>{msg.message}</p>
                                            <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-green-200' : 'text-gray-400'}`}>
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </motion.div>
                                );
                            })}

                            {/* Filter out optimistic messages if we implement logic strictly, 
                                but for this snippet I removed logic to avoid dupes visually 
                                by treating tempMsg specially if I had implemented it fully. 
                                For now, I'll rely on fast polling and NO optimistic UI for simplicity/correctness,
                                OR I will update the logic in handleSend to NOT setMessages immediately if polling is fast enough (3s).
                                Let's remove the setMessages from handleSend to avoid dupes.
                            */}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex gap-2 items-center">
                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Escribe un mensaje..."
                                className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all placeholder-gray-400"
                            />
                            <button
                                type="submit"
                                disabled={!newMessage.trim()}
                                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2.5 rounded-full shadow-lg transition-transform active:scale-95"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Button - Only Visible if showButton is true */}
            {showButton && (
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleToggle}
                    className={`p-4 rounded-full shadow-2xl transition-all relative group ${isOpen ? 'bg-gray-800 text-white hover:bg-gray-900' : 'bg-green-600 text-white hover:shadow-green-600/30'
                        }`}
                >
                    {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}

                    {/* Badge (only if closed) */}
                    {!isOpen && unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center animate-bounce border-2 border-white">
                            {unreadCount}
                        </span>
                    )}

                    {/* Tooltip */}
                    <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs py-1 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {isOpen ? 'Cerrar Chat' : 'Soporte en línea'}
                    </span>
                </motion.button>
            )}
        </div>
    );
}
