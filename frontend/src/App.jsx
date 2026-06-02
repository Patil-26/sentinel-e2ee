// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { saveMessage, loadChatHistory, getRecentContacts, clearAllData } from './lib/storage.';

function App() {
  const [clientId, setClientId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef(null);

  const [contacts, setContacts] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentText, setCurrentText] = useState('');
  const [securityTier, setSecurityTier] = useState(1);
  const [newContactId, setNewContactId] = useState('');
  
  const messagesEndRef = useRef(null);
  
  const activeChatRef = useRef(activeChat);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load contacts only AFTER a user successfully identifies themselves
  useEffect(() => {
    if (isConnected && clientId) {
      getRecentContacts(clientId).then(savedContacts => {
        setContacts(savedContacts);
      });
    }
  }, [isConnected, clientId]);

  // Load chat history securely scoped to the current user
  useEffect(() => {
    if (activeChat && clientId) {
      loadChatHistory(clientId, activeChat).then(history => {
        setMessages(history);
      });
    }
  }, [activeChat, clientId]);

  const connectWebSocket = (e) => {
    e.preventDefault();
    if (!clientId) return;

    ws.current = new WebSocket(`ws://localhost:8000/ws/${clientId}`);

    ws.current.onopen = () => {
      setIsConnected(true);
    };

    ws.current.onmessage = async (event) => {
      const payload = JSON.parse(event.data);
      
      if (payload.type === 'system') {
        const sysMsg = { type: 'system', text: payload.message };
        setMessages(prev => [...prev, sysMsg]);
      } else if (payload.type === 'message') {
        const incomingMsg = {
          type: 'received',
          text: payload.data,
          tier: payload.tier || 1
        };
        
        // Save to this specific user's local database
        const savedMsg = await saveMessage(clientId, payload.sender_id, incomingMsg);
        
        if (activeChatRef.current === payload.sender_id) {
          setMessages(prev => [...prev, savedMsg]);
        }
        
        setContacts(prevContacts => {
          if (!prevContacts.includes(payload.sender_id)) {
            return [...prevContacts, payload.sender_id];
          }
          return prevContacts;
        });
      }
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      setContacts([]);
      setActiveChat(null);
      setMessages([]);
    };
  };

  const disconnectWebSocket = () => {
    if (ws.current) ws.current.close();
  };

  const handleWipeData = async () => {
    if (window.confirm("CRITICAL WARNING: This will permanently destroy all chat history and local contacts on this node. Do you wish to proceed?")) {
      await clearAllData(clientId);
      
      setContacts([]);
      setActiveChat(null);
      setMessages([]);
      
      window.location.reload();
    }
  };

  const startNewChat = (e) => {
    e.preventDefault();
    if (newContactId) {
      setContacts(prev => {
        if (!prev.includes(newContactId)) {
          return [...prev, newContactId];
        }
        return prev;
      });
      setActiveChat(newContactId);
      setNewContactId('');
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!ws.current || !currentText || !activeChat) return;

    const outgoingMsg = {
      type: 'sent',
      text: currentText,
      tier: securityTier
    };

    // Save to this specific user's local database
    const savedMsg = await saveMessage(clientId, activeChat, outgoingMsg);
    setMessages(prev => [...prev, savedMsg]);

    const payload = {
        target_id: activeChat,
        data: currentText,
        tier: securityTier,
        timestamp: new Date().toISOString()
    };
    ws.current.send(JSON.stringify(payload));
    
    setCurrentText('');
  };

  const renderMessageContent = (msg) => {
    if (msg.type === 'system') {
      return <span className="text-xs text-red-300">{msg.text}</span>;
    }

    if (msg.tier === 3) {
      return (
        <div className="border border-red-500 bg-red-950 p-3 rounded">
          <div className="text-xs text-red-400 font-bold mb-1">[Tier 3: Sentinel Locked]</div>
          <div className="blur-sm select-none text-slate-300">Hidden Payload</div>
          <button className="mt-2 w-full bg-red-600 hover:bg-red-500 text-white text-xs py-1 rounded">
            Initiate Liveness Scan
          </button>
        </div>
      );
    }

    if (msg.tier === 2) {
      return (
        <div className="border border-orange-500 bg-orange-950 p-3 rounded">
          <div className="text-xs text-orange-400 font-bold mb-1">[Tier 2: View Once]</div>
          <button className="w-full bg-orange-600 hover:bg-orange-500 text-white text-xs py-1 rounded">
            Tap to View
          </button>
        </div>
      );
    }

    return <span>{msg.text}</span>;
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-xl shadow-2xl border border-slate-700 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-emerald-400 text-center">Sentinel Identity</h1>
          <form onSubmit={connectWebSocket} className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Enter your cryptographic ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded focus:outline-none focus:border-emerald-500"
              required
            />
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded transition-colors">
              Initialize Local Node
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 flex justify-center">
      <div className="w-full max-w-6xl bg-slate-800 rounded-xl shadow-2xl flex overflow-hidden border border-slate-700 h-[90vh]">
        
        <div className="w-1/3 border-r border-slate-700 bg-slate-900 flex flex-col">
          <div className="p-4 border-b border-slate-700 flex flex-col gap-2 bg-slate-800">
            <div className="flex justify-between items-center">
              <div className="text-sm">
                <span className="text-slate-400">Node ID: </span>
                <span className="font-bold text-emerald-400">{clientId}</span>
              </div>
              <button onClick={disconnectWebSocket} className="text-xs bg-slate-700 hover:bg-red-600 text-white px-3 py-1 rounded transition-colors">
                Disconnect
              </button>
            </div>
            
            <button onClick={handleWipeData} className="w-full text-xs bg-red-950 border border-red-800 hover:bg-red-700 text-red-200 py-1.5 rounded transition-colors mt-2">
              [!] Wipe Local Data
            </button>
          </div>
          
          <div className="p-4 border-b border-slate-800">
            <form onSubmit={startNewChat} className="flex gap-2">
              <input
                type="text"
                placeholder="New Contact ID"
                value={newContactId}
                onChange={(e) => setNewContactId(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 text-white px-3 py-2 rounded text-sm focus:outline-none focus:border-emerald-500"
              />
              <button type="submit" className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded text-sm">
                Add
              </button>
            </form>
          </div>

          <div className="overflow-y-auto flex-1">
            {contacts.map(contact => (
              <div 
                key={contact} 
                onClick={() => setActiveChat(contact)}
                className={`p-4 cursor-pointer border-b border-slate-800 hover:bg-slate-800 transition-colors ${activeChat === contact ? 'bg-slate-800 border-l-4 border-l-emerald-500' : ''}`}
              >
                <div className="font-bold text-slate-200">{contact}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="w-2/3 flex flex-col bg-slate-800">
          {activeChat ? (
            <>
              <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
                <span className="font-bold text-lg text-white">Chat with {activeChat}</span>
                <span className="text-xs text-slate-400">E2EE Tunnel Active</span>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`max-w-[70%] rounded-lg p-3 ${
                    msg.type === 'system' ? 'mx-auto bg-transparent border border-slate-700' :
                    msg.type === 'sent' ? 'ml-auto bg-emerald-800 text-emerald-50' :
                    'mr-auto bg-slate-700 text-slate-100'
                  }`}>
                    {renderMessageContent(msg)}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 bg-slate-900 border-t border-slate-700">
                <form onSubmit={sendMessage} className="flex flex-col gap-2">
                  <div className="flex gap-2 mb-2">
                    <button type="button" onClick={() => setSecurityTier(1)} className={`text-xs px-3 py-1 rounded border ${securityTier === 1 ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>Tier 1: Standard</button>
                    <button type="button" onClick={() => setSecurityTier(2)} className={`text-xs px-3 py-1 rounded border ${securityTier === 2 ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>Tier 2: View Once</button>
                    <button type="button" onClick={() => setSecurityTier(3)} className={`text-xs px-3 py-1 rounded border ${securityTier === 3 ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>Tier 3: Sentinel</button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type a secure message..."
                      value={currentText}
                      onChange={(e) => setCurrentText(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded focus:outline-none focus:border-emerald-500"
                    />
                    <button type="submit" disabled={!currentText} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-8 py-3 rounded font-bold transition-colors">
                      Send
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              Select a contact to begin secure routing
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default App;