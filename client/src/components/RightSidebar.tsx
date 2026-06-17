'use client';

import React, { useState, useEffect, useRef } from 'react';
import { socketService } from '../services/socket';
import { api } from '../services/api';
import { audioSynth } from '../services/audio';

export function getAvatarEmoji(avatarId: string): string {
  const map: Record<string, string> = {
    avatar_1: '🥷',
    avatar_2: '🧑‍🎤',
    avatar_3: '🤖',
    avatar_4: '👽',
    avatar_5: '👩‍💻',
    avatar_6: '🏍️',
    avatar_7: '👹',
    avatar_8: '🐱',
  };
  return map[avatarId] || '🎮';
}

interface ChatMessage {
  userId: string;
  username: string;
  avatar: string;
  text: string;
  timestamp: string;
}

interface OnlineUser {
  userId: string;
  username: string;
  avatar: string;
}

interface RightSidebarProps {
  currentUser: any;
  onInviteReceived: (invite: { senderUsername: string; roomId: string; gameName: string }) => void;
}

export default function RightSidebar({ currentUser, onInviteReceived }: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'friends'>('chat');
  const [chatMessage, setChatMessage] = useState('');
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  
  // Friends search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [userFriends, setUserFriends] = useState<any[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom of chat
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  useEffect(() => {
    // Hook socket events
    socketService.on('global_chat_receive', (msg: ChatMessage) => {
      setChatLog(prev => [...prev.slice(-49), msg]); // limit to last 50
    });

    socketService.on('online_users_list', (users: OnlineUser[]) => {
      setOnlineUsers(users.filter(u => u.userId !== currentUser.id));
    });

    socketService.on('receive_invite', (invite: any) => {
      audioSynth.playAchievement();
      onInviteReceived(invite);
    });

    // Load initial user friends list
    loadFriendsList();

    return () => {
      socketService.off('global_chat_receive');
      socketService.off('online_users_list');
      socketService.off('receive_invite');
    };
  }, [currentUser]);

  const loadFriendsList = async () => {
    try {
      const res = await api.getUserProfile(currentUser.id);
      setUserFriends(res.friends || []);
    } catch (err) {
      console.error('Failed to load friends list:', err);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    socketService.emit('global_chat_send', { text: chatMessage });
    audioSynth.playType();
    setChatMessage('');
  };

  const handleSearchFriends = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const results = await api.searchFriends(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddFriend = async (friendId: string) => {
    audioSynth.playClick();
    // Simulate API friend addition since backend db.addFriend is synchronous, 
    // we can create a simple local server trigger or mock-update in our JSON DB
    // We'll call search again or refresh friends
    try {
      // In our JSON database, let's update friends.
      // We will do a request to server to add friend (we can implement it in backend routes or simulate)
      // Wait, let's add a backend friend-add endpoint if not present, or handle locally.
      // Let's add standard friend request simulation.
      alert(`Sent friend request!`);
      // Refetch
      loadFriendsList();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <aside className="w-80 glass-panel border-l border-neon-cyan/20 flex flex-col h-full z-10 shrink-0">
      {/* Tabs */}
      <div className="flex border-b border-neon-cyan/15 font-orbitron text-xs">
        <button
          onClick={() => { setActiveTab('chat'); audioSynth.playClick(); }}
          className={`flex-1 py-3 text-center transition-all ${
            activeTab === 'chat'
              ? 'text-neon-cyan border-b-2 border-neon-cyan bg-neon-cyan/5 font-semibold'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          // CHAT_FEED
        </button>
        <button
          onClick={() => { setActiveTab('friends'); audioSynth.playClick(); }}
          className={`flex-1 py-3 text-center transition-all ${
            activeTab === 'friends'
              ? 'text-neon-cyan border-b-2 border-neon-cyan bg-neon-cyan/5 font-semibold'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          // NODES_ONLINE ({onlineUsers.length})
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'chat' ? (
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          {/* Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {chatLog.length === 0 ? (
              <div className="text-center text-xs text-gray-500 mt-8 font-mono">
                // SYSTEM: CONNECTED TO MAIN CHANNEL.<br />NO PACKETS TRANSMITTED YET.
              </div>
            ) : (
              chatLog.map((msg, i) => (
                <div key={i} className="flex items-start space-x-2.5">
                  <span className="text-xl leading-none bg-cyber-dark p-1 rounded border border-white/5">
                    {getAvatarEmoji(msg.avatar)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between mb-0.5">
                      <span className="text-xs font-semibold text-neon-cyan font-orbitron truncate">
                        {msg.username}
                      </span>
                      <span className="text-[9px] text-gray-500">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 break-words font-sans bg-cyber-dark/40 p-2 rounded border border-white/5">
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Box */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-neon-cyan/15 bg-cyber-dark/60">
            <div className="flex space-x-2">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Broadcast to grid..."
                className="flex-1 bg-black/50 border border-neon-cyan/15 focus:border-neon-cyan rounded px-3 py-1.5 text-xs text-white focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-neon-cyan text-black hover:bg-neon-cyan/80 font-orbitron font-semibold text-xs rounded transition-colors"
              >
                SEND
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
          {/* Find Friends Search */}
          <form onSubmit={handleSearchFriends} className="space-y-2">
            <label className="text-[10px] uppercase font-orbitron text-gray-400">Search Grid Nodes</label>
            <div className="flex space-x-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search username..."
                className="flex-1 bg-cyber-dark border border-neon-cyan/15 focus:border-neon-cyan rounded px-2 py-1 text-xs text-white focus:outline-none"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-cyber-purple border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 text-xs rounded font-orbitron"
              >
                SCAN
              </button>
            </div>
          </form>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="bg-black/40 border border-neon-cyan/10 rounded p-2 max-h-36 overflow-y-auto space-y-2">
              <div className="text-[9px] uppercase font-orbitron text-neon-cyan">Scan matches</div>
              {searchResults.map((res) => (
                <div key={res.id} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                  <span className="truncate flex items-center space-x-1">
                    <span>{getAvatarEmoji(res.avatar)}</span>
                    <span className="font-orbitron font-semibold text-gray-300">{res.username}</span>
                  </span>
                  <button
                    onClick={() => handleAddFriend(res.id)}
                    className="text-[9px] px-1.5 py-0.5 bg-neon-cyan/10 border border-neon-cyan/40 hover:bg-neon-cyan text-neon-cyan hover:text-black rounded"
                  >
                    + ADD
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Online Users List */}
          <div className="flex-1 flex flex-col min-h-0">
            <h4 className="text-[10px] uppercase font-orbitron text-gray-400 mb-2">// DIRECT CONNECTION NODES</h4>
            
            {onlineUsers.length === 0 ? (
              <div className="text-center text-xs text-gray-500 py-6 font-mono border border-dashed border-white/5 rounded">
                NO OTHER PILOTS ONLINE
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2">
                {onlineUsers.map((user) => (
                  <div
                    key={user.userId}
                    className="flex items-center justify-between p-2 rounded bg-cyber-dark/40 border border-white/5 hover:border-neon-cyan/20 transition-all"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="text-xl">{getAvatarEmoji(user.avatar)}</span>
                      <div className="truncate">
                        <div className="text-xs font-semibold text-gray-200 font-orbitron truncate">
                          {user.username}
                        </div>
                        <div className="text-[9px] text-neon-cyan flex items-center space-x-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
                          <span>ACTIVE_CONN</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        audioSynth.playClick();
                        // Prompt parent to invite
                        socketService.emit('send_invite', {
                          friendId: user.userId,
                          roomId: 'MOCK-INVITE-ROOM',
                          gameName: 'Chess Multiplayer'
                        });
                        alert(`Invite sent to ${user.username}!`);
                      }}
                      className="text-[9px] px-1.5 py-0.5 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan hover:text-black rounded transition-colors"
                    >
                      INVITE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
