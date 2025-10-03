'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  MessageCircle,
  Send,
  Smile,
  Crown,
  ThumbsUp,
  Heart,
  Zap,
  X,
  Minimize2,
  Maximize2
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatMessage {
  id: string
  userId: string
  userName: string
  isHost: boolean
  message: string
  timestamp: string
  reactions?: { [emoji: string]: string[] } // emoji -> list of user IDs
  isSystemMessage?: boolean
}

interface DraftChatProps {
  messages: ChatMessage[]
  currentUserId: string
  currentUserName: string
  draftId: string
  isMinimized?: boolean
  onSendMessage: (message: string) => void
  onAddReaction: (messageId: string, emoji: string) => void
  onToggleMinimize?: () => void
  className?: string
}

const EMOJI_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '⚡', '🔥', '💯']

export default function DraftChat({
  messages,
  currentUserId,
  currentUserName,
  draftId,
  isMinimized = false,
  onSendMessage,
  onAddReaction,
  onToggleMinimize,
  className
}: DraftChatProps) {
  const [newMessage, setNewMessage] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    onSendMessage(newMessage.trim())
    setNewMessage('')
  }

  const handleAddReaction = (messageId: string, emoji: string) => {
    onAddReaction(messageId, emoji)
    setShowEmojiPicker(null)
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getParticipantInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const renderMessage = (message: ChatMessage) => (
    <div
      key={message.id}
      className={cn(
        'group relative p-3 rounded-lg',
        message.isSystemMessage
          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
          : message.userId === currentUserId
          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 ml-8'
          : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700'
      )}
    >
      {!message.isSystemMessage && (
        <div className="flex items-start gap-3">
          <Avatar className="h-6 w-6 mt-0.5">
            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${message.userName}`} />
            <AvatarFallback className="text-xs">
              {getParticipantInitials(message.userName)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-sm">
                {message.userName}
                {message.userId === currentUserId && (
                  <span className="text-xs text-gray-500 ml-1">(You)</span>
                )}
              </span>
              {message.isHost && <Crown className="h-3 w-3 text-yellow-600" />}
              <span className="text-xs text-gray-500">
                {formatTimestamp(message.timestamp)}
              </span>
            </div>

            <p className="text-sm leading-relaxed break-words">
              {message.message}
            </p>
          </div>
        </div>
      )}

      {message.isSystemMessage && (
        <div className="text-center">
          <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
            {message.message}
          </p>
          <span className="text-xs text-blue-600 dark:text-blue-400">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
      )}

      {/* Reactions */}
      {message.reactions && Object.keys(message.reactions).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {Object.entries(message.reactions).map(([emoji, userIds]) => (
            <button
              key={emoji}
              onClick={() => handleAddReaction(message.id, emoji)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-colors',
                userIds.includes(currentUserId)
                  ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              <span>{emoji}</span>
              <span className="font-medium">{userIds.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Reaction picker */}
      {!message.isSystemMessage && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEmojiPicker(showEmojiPicker === message.id ? null : message.id)}
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
            >
              <Smile className="h-3 w-3" />
            </Button>

            {showEmojiPicker === message.id && (
              <div className="absolute top-7 right-0 z-10 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg p-2">
                <div className="grid grid-cols-4 gap-1">
                  {EMOJI_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleAddReaction(message.id, emoji)}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-lg"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  if (isMinimized) {
    return (
      <Card className={cn('w-80 h-12', className)}>
        <div className="flex items-center justify-between p-3 h-full">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Draft Chat</span>
            {messages.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {messages.length}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleMinimize}
            className="h-6 w-6 p-0"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className={cn('w-80 h-96 flex flex-col', className)}>
      <CardHeader className="pb-2 flex-shrink-0">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Draft Chat
            {messages.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {messages.length}
              </Badge>
            )}
          </div>
          {onToggleMinimize && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleMinimize}
              className="h-6 w-6 p-0"
            >
              <Minimize2 className="h-3 w-3" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No messages yet</p>
              <p className="text-xs">Start the conversation!</p>
            </div>
          ) : (
            messages.map(renderMessage)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        <div className="border-t border-gray-200 dark:border-slate-700 p-3 flex-shrink-0">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 text-sm"
              maxLength={500}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!newMessage.trim()}
              className="px-3"
            >
              <Send className="h-3 w-3" />
            </Button>
          </form>
          <div className="text-xs text-gray-500 mt-1">
            {newMessage.length}/500
          </div>
        </div>
      </CardContent>
    </Card>
  )
}