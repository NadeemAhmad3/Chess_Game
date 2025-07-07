// client_react/src/socketService.js

/**
 * Socket service for WebSocket communication with the chess server
 */

// WebSocket instance
let socket = null;

// Store the current socket URL
let currentSocketUrl = null;

// Callback functions
let onMessageCallback = null;
let onOpenCallback = null;
let onCloseCallback = null;

// Client ID for identifying this client
// Use a stored client ID if available, otherwise generate a new one
let clientId = localStorage.getItem('chess_client_id') || Date.now().toString();
// Store the client ID in localStorage for persistence
localStorage.setItem('chess_client_id', clientId);

/**
 * Reset the client ID to a new value
 * This is useful when starting a new game to ensure a clean state
 */
const resetClientId = () => {
  // Generate a new client ID
  clientId = Date.now().toString();
  // Store the new client ID in localStorage
  localStorage.setItem('chess_client_id', clientId);
  console.log('Client ID reset to:', clientId);
  return clientId;
};

/**
 * Connect to the WebSocket server
 * @param {string} url - The WebSocket server URL
 * @returns {WebSocket} - The WebSocket instance
 */

const connect = (url) => {
  // Store the base URL for future reconnections
  currentSocketUrl = url;

  // Check if we have a saved game ID for reconnection
  const savedGameId = localStorage.getItem('currentGameId');
  if (savedGameId) {
    console.log(`Found saved game ID: ${savedGameId}, will attempt to reconnect to this game`);
  } else {
    console.log('No saved game ID found, starting fresh connection');
  }

  console.log(`Attempting to connect to WebSocket server at ${url}`);

  try {
    // Check if there's an existing socket and it's still open
    if (socket && socket.readyState === WebSocket.OPEN) {
      console.log('Socket is already open, reusing existing connection');
      return socket;
    }

    // Close any existing connection that's not already closed
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      try {
        socket.close();
        console.log('Closed existing socket connection');
      } catch (e) {
        console.error('Error closing existing socket:', e);
      }
    }

    // Create a new WebSocket connection with a unique timestamp and client ID
    // This prevents caching issues and helps with server-side identification
    // Use the persistent client ID from the module scope
    const timestampedUrl = `${url}?t=${Date.now()}&clientId=${clientId}`;
    socket = new WebSocket(timestampedUrl);
    console.log('WebSocket object created with client ID:', clientId);

    // Set up event handlers
    socket.onopen = (event) => {
      console.log('WebSocket connection established!');

      if (onOpenCallback) {
        onOpenCallback(event);
      }
    };

    socket.onclose = (event) => {
      console.log(`WebSocket connection closed: code=${event.code}, reason=${event.reason}`);

      // Check if this is a normal closure (code 1000) or an abnormal one
      const isNormalClosure = event.code === 1000;

      // For normal closures, we can safely preserve the game ID
      // For abnormal closures, we should check if we're in a game
      if (localStorage.getItem('currentGameId')) {
        if (isNormalClosure) {
          console.log('Normal connection closure, preserving game ID for reconnection');
        } else {
          console.log('Abnormal connection closure, but preserving game ID for potential reconnection');
        }
      }

      // Call the onClose callback if provided
      if (onCloseCallback) {
        onCloseCallback(event);
      }

      // Do NOT attempt to reconnect automatically
      console.log('WebSocket connection closed. Manual refresh required to reconnect.');

      // Remove any reconnection flags to prevent automatic reconnection
      localStorage.removeItem('needsReconnect');
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Don't do anything here, let onclose handle reconnection
    };

    socket.onmessage = (event) => {
      try {
        // Parse the message as JSON
        const message = JSON.parse(event.data);
        console.log('Received message:', message);

        // Handle ping messages
        if (message.type === 'ping') {
          // Respond with a pong message
          sendMessage({ type: 'pong' });
          console.log('Received ping, sent pong');
          return; // Don't process ping messages further
        }

        // Track game state in localStorage with special handling for game_start
        if (message.type === 'game_start' && message.game_id) {
          // Store the game ID in localStorage
          localStorage.setItem('currentGameId', message.game_id);
          console.log(`Game started with ID: ${message.game_id}`);

          // Log detailed information about the game start
          console.log('Game start details:');
          console.log(`- Game ID: ${message.game_id}`);
          console.log(`- Player color: ${message.color || 'unknown'}`);
          console.log(`- Current turn: ${message.turn || 'white'}`);

          // IMPORTANT: Don't do anything else here that might interfere with the connection
          // Let the message callback handle the rest of the game start logic
        } else if (message.type === 'game_over' || message.type === 'opponent_disconnected') {
          // Clear the game ID when the game ends
          localStorage.removeItem('currentGameId');
          console.log('Game ended, cleared game ID');
        } else if (message.type === 'error') {
          // Check if this is an invalid game ID error
          if (message.message && (
              message.message.includes('Game not found') ||
              message.message.includes('Invalid game_id') ||
              message.message.includes('not found')
            )) {
            console.log('Received invalid game ID error, clearing stored game ID');
            localStorage.removeItem('currentGameId');
          }
        }

        // Call the message callback
        if (onMessageCallback) {
          onMessageCallback(message);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
        console.error('Raw message data:', event.data);
      }
    };

    return socket;
  } catch (error) {
    console.error('Error in connect function:', error);
    return null;
  }
};

// No ping/pong needed as we've disabled it on the server

/**
 * Send a message to the server
 * @param {Object} jsonData - The data to send (will be converted to JSON)
 * @returns {boolean} - True if the message was sent, false otherwise
 */
const sendMessage = (jsonData) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    // Convert the message to JSON
    // This matches how the working implementation sends messages
    const message = JSON.stringify(jsonData);
    socket.send(message);
    console.log('Sent message:', jsonData);

    // CRITICAL FIX: If this is a leave_game message, mark the game as ended
    if (jsonData.type === 'leave_game') {
      console.log('CRITICAL: Sent leave_game message, marking game as ended');
      // Set a flag to indicate that we've left the game
      localStorage.setItem('game_left', 'true');
      localStorage.setItem('game_left_timestamp', Date.now().toString());

      // Store the current game ID for the opponent to receive the win
      const currentGameId = localStorage.getItem('currentGameId');
      if (currentGameId) {
        console.log(`CRITICAL: Storing game ID in localStorage for opponent win: ${currentGameId}`);
        localStorage.setItem('last_known_game_id', currentGameId);
      }
    }

    return true;
  } else {
    console.error('Cannot send message: WebSocket is not open');
    return false;
  }
};

/**
 * Set the callback function for incoming messages
 * @param {Function} callback - The callback function
 */
const setOnMessageCallback = (callback) => {
  onMessageCallback = callback;
};

/**
 * Get the current callback function for incoming messages
 * @returns {Function|null} - The current callback function or null if not set
 */
const getOnMessageCallback = () => {
  return onMessageCallback;
};

/**
 * Set the callback function for WebSocket open event
 * @param {Function} callback - The callback function
 */
const setOnOpenCallback = (callback) => {
  onOpenCallback = callback;
};

/**
 * Set the callback function for WebSocket close event
 * @param {Function} callback - The callback function
 */
const setOnCloseCallback = (callback) => {
  onCloseCallback = callback;
};

/**
 * Get the current state of the WebSocket connection
 * @returns {number|null} - The WebSocket state or null if not connected
 */
const getSocketState = () => {
  return socket ? socket.readyState : null;
};

/**
 * Get the client ID
 * @returns {string} - The client ID
 */
const getClientId = () => {
  return clientId;
};

/**
 * Get the current socket URL
 * @returns {string|null} - The current socket URL or null if not connected
 */
const getSocketUrl = () => {
  return currentSocketUrl;
};

/**
 * Close the socket connection
 * @returns {boolean} - True if the socket was closed, false otherwise
 */
const closeSocket = () => {
  if (socket) {
    try {
      // Close the socket
      socket.close();
      console.log('Socket closed');
      return true;
    } catch (e) {
      console.error('Error closing socket:', e);
      return false;
    }
  }
  return false;
};

// Export the functions
export {
  connect,
  sendMessage,
  setOnMessageCallback,
  getOnMessageCallback,
  setOnOpenCallback,
  setOnCloseCallback,
  getSocketState,
  getClientId,
  resetClientId,
  getSocketUrl,
  closeSocket
};
