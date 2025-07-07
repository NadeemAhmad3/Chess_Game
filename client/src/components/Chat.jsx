// client/vite-project/src/components/Chat.jsx
import { useState, useRef, useEffect } from 'react';
import './Chat.css';

/**
 * Chat component for the chess application
 *
 * @param {Object} props - Component props
 * @param {string} props.gameId - The ID of the current game
 * @param {string} props.playerColor - The player's color ('white', 'black', or 'Spectator')
 * @param {Array} props.messages - Array of message objects with sender and text properties
 * @param {Function} props.onSendMessage - Callback function when a message is sent (text) => void
 */
const Chat = ({ gameId, playerColor, messages, onSendMessage }) => {
  // State for the new message input
  const [newMessage, setNewMessage] = useState('');

  // Ref for the messages container to auto-scroll
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    console.log('Chat component received messages update:', messages);
    scrollToBottom();
  }, [messages]);

  // Function to scroll to the bottom of the chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();

    // Don't send empty messages
    if (newMessage.trim() === '') return;

    // Call the onSendMessage callback with the message text
    onSendMessage(newMessage);

    // Clear the input field
    setNewMessage('');
  };

  // Determine if a message is from the current player - simplified
  const isMyMessage = (msg) => {
    // Check for explicit self flag (from optimistic updates)
    if (msg.is_self === true) {
      return true;
    }

    // Check for "You" sender
    if (msg.sender === 'You') {
      return true;
    }

    // All other messages are from others
    return false;
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h3>Game Chat</h3>
        {gameId && <span className="game-id">Game: {gameId.substring(0, 8)}...</span>}
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="no-messages">No messages yet</div>
        ) : (
          <>
            {console.log('Rendering messages:', messages)}
            {messages.map((msg, index) => {
              const isMyMsg = isMyMessage(msg);
              return (
                <div
                  key={index}
                  className={`message ${isMyMsg ? 'my-message' : 'other-message'} ${msg.awaiting_response ? 'awaiting-response' : ''}`}
                >
                  <div className="message-sender">{isMyMsg ? 'You' : (msg.username || msg.sender)}</div>
                  <div className="message-text">{msg.text}</div>
                  {msg.awaiting_response && (
                    <div className="awaiting-response-indicator">Awaiting response...</div>
                  )}
                </div>
              );
            })}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="chat-input"
        />
        <button type="submit" className="send-button">Send</button>
      </form>
    </div>
  );
};

export default Chat;