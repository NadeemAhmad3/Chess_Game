// client/vite-project/src/App.jsx
import { useState, useEffect, useCallback } from 'react';
import * as socketService from './services/socketService';
import { playMoveSound, playCaptureSound, initSounds, stopAllSounds } from './utils/soundEffects';

// Import components
import Lobby from './components/Lobby';
import MainMenu from './components/MainMenu';
import WaitingScreen from './components/WaitingScreen';
import ChessboardComponent from './components/Chessboard';
import Chat from './components/Chat';
import Timer from './components/Timer';
import GameResult from './components/GameResult';
import GameResultPage from './components/GameResultPage';
import CapturedPieces from './components/CapturedPieces';
import './App.css';

// Helper functions to reduce code repetition

/**
 * Clear all turn unblock timeouts
 * This function is used in multiple places to ensure timeouts are properly cleared
 */
const clearTurnTimeouts = () => {
  // Clear primary timeout
  if (window.turnUnblockTimeout) {
    console.log('Clearing primary turn unblock timeout');
    clearTimeout(window.turnUnblockTimeout);
    window.turnUnblockTimeout = null;
  }

  // Clear failsafe timeout
  if (window.failsafeTurnUnblockTimeout) {
    console.log('Clearing failsafe turn unblock timeout');
    clearTimeout(window.failsafeTurnUnblockTimeout);
    window.failsafeTurnUnblockTimeout = null;
  }
};

/**
 * Request a game state update from the server
 * @param {string} gameId - The ID of the game to request an update for
 */
const requestGameStateUpdate = (gameId) => {
  if (!gameId) return;

  console.log(`Requesting game state update for game ${gameId}`);
  socketService.sendMessage({
    type: 'request_game_state',
    game_id: gameId
  });
};

/**
 * Play a notification sound
 */
const playNotificationSound = () => {
  try {
    const audio = new Audio('/notification.mp3');
    audio.play().catch(e => console.log('Audio play failed:', e));
  } catch (e) {
    console.log('Audio not supported:', e);
  }
};

// Game view component that integrates the chess components
const GameViewComponent = ({
  gameId,
  fen,
  playerColor,
  isMyTurn,
  onMakeMove,
  gameResult,
  statusMessage,
  lastMove,
  isSpectating,
  chatMessages,
  onSendChat,
  timeWhite,
  timeBlack,
  currentTurnForTimer,
  onBackToLobby,
  onPlayAgain
}) => {
  console.log('GameViewComponent rendering with chatMessages:', chatMessages);

  // State to track if chat is visible
  const [isChatVisible, setIsChatVisible] = useState(false);

  // Toggle chat visibility
  const toggleChat = () => {
    setIsChatVisible(!isChatVisible);
  };

  return (
  <div className="game-view">
    <div className="game-header">
      <h2>{isSpectating ? 'Spectating Game' : 'Chess Game'}</h2>
    </div>

    {/* Exit button with SVG icon */}
    <button
      className="back-to-lobby-btn"
      onClick={onBackToLobby}
      title={isSpectating ? 'Stop Spectating' : 'Exit to Lobby'}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
      </svg>
    </button>

    {gameResult && (
      <GameResult
        gameResult={gameResult}
        playerColor={playerColor}
        isSpectating={isSpectating}
        onBackToLobby={onBackToLobby}
        onPlayAgain={onPlayAgain}
        timeWhite={timeWhite}
        timeBlack={timeBlack}
      />
    )}

    <div className="game-content">
      <div className="game-left-panel">
        {/* Chessboard Component with Captured Pieces and Timer */}
        <ChessboardComponent
          initialFen={fen}
          playerColor={isSpectating ? 'white' : playerColor}
          onMove={onMakeMove}
          isMyTurn={isMyTurn}
          lastMove={lastMove}
        />

        {/* Timer Component - positioned absolutely via CSS */}
        <Timer
          timeWhite={timeWhite}
          timeBlack={timeBlack}
          currentTurnColor={currentTurnForTimer}
          playerColor={playerColor}
          isSpectating={isSpectating}
        />

        {/* Captured Pieces Component - positioned absolutely via CSS */}
        <CapturedPieces
          fen={fen}
          playerColor={isSpectating ? 'white' : playerColor}
        />
      </div>

      {/* Chat toggle button */}
      <button
        className={`chat-toggle-btn ${isChatVisible ? 'active' : ''}`}
        onClick={toggleChat}
        aria-label="Toggle chat"
        title="Toggle chat"
      >
        {isChatVisible ? '×' : '💬'}
      </button>

      {/* Chat panel - shown/hidden based on state */}
      <div className={`game-right-panel ${isChatVisible ? 'active' : ''}`}>
        <Chat
          gameId={gameId}
          playerColor={isSpectating ? 'Spectator' : playerColor}
          messages={chatMessages}
          onSendMessage={onSendChat}
        />
      </div>
    </div>
  </div>
  );
};

// Helper function to convert piece type to readable name
const getPieceTypeName = (pieceType) => {
  if (!pieceType) return 'piece';

  // Chess.js piece types: 1=pawn, 2=knight, 3=bishop, 4=rook, 5=queen, 6=king
  const pieceNames = {
    1: 'pawn',
    2: 'knight',
    3: 'bishop',
    4: 'rook',
    5: 'queen',
    6: 'king'
  };

  return pieceNames[pieceType] || 'piece';
};

function App() {
  // State variables
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Connecting to server...');
  const [gameId, setGameId] = useState(null);
  const [fen, setFen] = useState('start');
  const [playerColor, setPlayerColor] = useState(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [gameResult, setGameResult] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [inLobby, setInLobby] = useState(true);
  const [lobbyStatus, setLobbyStatus] = useState('');
  const [isSpectating, setIsSpectating] = useState(false);
  const [activeGamesList, setActiveGamesList] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(false);
  const [timeWhite, setTimeWhite] = useState(300);
  const [timeBlack, setTimeBlack] = useState(300);
  const [currentTurnForTimer, setCurrentTurnForTimer] = useState('white');
  const [isJoiningLobby, setIsJoiningLobby] = useState(false);

  /**
   * Clear all turn unblock timeouts
   * This function is used in multiple places to ensure timeouts are properly cleared
   */
  const clearAllTurnTimeouts = useCallback(() => {
    // Use the global helper function
    clearTurnTimeouts();
  }, []);

  /**
   * Reset game state to default values
   * @param {boolean} goToLobby - Whether to return to the lobby
   */
  const resetGameState = useCallback((goToLobby = true) => {
    console.log('Resetting game state with params:', { goToLobby });

    // Clear the game ID from localStorage
    localStorage.removeItem('currentGameId');

    // Clear any pending timeouts
    clearAllTurnTimeouts();

    // Stop any playing sounds
    try {
      stopAllSounds();
    } catch (e) {
      console.log('Error stopping sounds:', e);
    }

    // Reset all game-related state
    setGameId(null);
    setFen('start');
    setPlayerColor(null);
    setIsMyTurn(false);
    setGameResult(null);
    setLastMove(null);

    // Set lobby state based on parameter
    if (goToLobby) {
      console.log('Going to lobby');
      setIsWaitingForOpponent(false);
      setInLobby(true);
      setIsJoiningLobby(false);
    } else {
      console.log('Not going to lobby');
      setIsWaitingForOpponent(false);
      setInLobby(false);
    }

    setIsSpectating(false);
    setChatMessages([]);

    // Reset timers
    setTimeWhite(300);
    setTimeBlack(300);
    setCurrentTurnForTimer('white');

    console.log('Game state reset complete');
  }, [clearAllTurnTimeouts]);

  /**
   * Request a game state update from the server
   */
  const requestGameUpdate = useCallback((delay = 0) => {
    if (!gameId) return;

    if (delay > 0) {
      setTimeout(() => {
        requestGameStateUpdate(gameId);
      }, delay);
    } else {
      requestGameStateUpdate(gameId);
    }
  }, [gameId]);

  /**
   * Play a game sound based on the move type
   * @param {boolean} isCapture - Whether the move is a capture
   */
  const playGameSound = useCallback((isCapture) => {
    // Check if we've recently played this sound type to prevent duplicates
    const now = Date.now();
    const lastPlayTime = isCapture ? window.lastCaptureSoundTime : window.lastMoveSoundTime;

    // Don't play the same sound type more than once every 500ms
    if (lastPlayTime && now - lastPlayTime < 500) {
      console.log(`Skipping ${isCapture ? 'capture' : 'move'} sound - played too recently`);
      return;
    }

    // Update the last play time for this sound type
    if (isCapture) {
      window.lastCaptureSoundTime = now;
    } else {
      window.lastMoveSoundTime = now;
    }

    // Use setTimeout for ALL sounds to prevent blocking the game
    setTimeout(() => {
      try {
        if (isCapture) {
          console.log('Playing capture sound...');
          playCaptureSound();
        } else {
          console.log('Playing move sound...');
          playMoveSound();
        }
      } catch (e) {
        console.log('Error playing sound:', e);
      }
    }, 0);
  }, []);

  // CRITICAL FIX: Store the last known game ID in a variable
  // This will be used to determine which client should win when a player leaves
  const [lastKnownGameId, setLastKnownGameId] = useState(null);

  // Handle server messages
  const handleServerMessage = useCallback((message) => {
    switch (message.type) {
      // Handle ping/pong messages
      case 'ping':
        console.log('Received ping from server, sending pong');
        socketService.sendMessage({ type: 'pong' });
        return;

      case 'pong':
        console.log('Received pong from server');
        return;

      // CRITICAL FIX: Handle alert messages
      case 'alert':
        console.log('CRITICAL: Received alert message:', message);
        // Display an alert to the user
        setTimeout(() => {
          alert(message.message);
        }, 500);
        return;

      // CRITICAL FIX: Handle the special win_notification message type
      case 'win_notification':
      case 'forced_win': // Also handle the forced_win message type
        console.log(`CRITICAL: Received ${message.type} message:`, message);
        console.log('CRITICAL: Current player color:', playerColor);
        console.log('CRITICAL: Is spectating:', isSpectating);
        console.log('CRITICAL: Game ID:', gameId);

        // Set a flag in localStorage to indicate that we've received a win notification
        localStorage.setItem('received_win_notification', 'true');
        localStorage.setItem('win_notification_timestamp', Date.now().toString());
        localStorage.setItem('win_notification_game_id', message.game_id);

        // Create a detailed game result object
        const winResult = {
          outcome: 'opponent_disconnected',
          winner: message.winner,
          disconnectedPlayer: message.disconnected_player,
          details: message.details || "Your opponent has left the game. You win by default.",
          playerWon: playerColor === message.winner
        };

        console.log('CRITICAL: Created win result object:', winResult);

        // Update game state
        setGameResult(winResult);
        setStatusMessage(`Game over: You won! Your opponent disconnected.`);
        setIsMyTurn(false);

        // Play win sound
        if (winResult.playerWon) {
          console.log('CRITICAL: Playing win sound');
          setTimeout(() => {
            try {
              const audio = new Audio('/win.mp3');
              audio.volume = 1.0; // Set volume to maximum
              audio.play().catch(e => console.log('Audio play failed:', e));
              console.log('CRITICAL: Win sound played');
            } catch (e) {
              console.log('Audio not supported:', e);
            }
          }, 500); // Delay to avoid sound overlap
        }

        // CRITICAL FIX: If this is a forced_win message, display an alert to ensure the user sees it
        if (message.type === 'forced_win') {
          console.log('CRITICAL: Displaying forced win alert');
          // Use setTimeout to ensure the alert doesn't block the UI update
          setTimeout(() => {
            alert("You won! Your opponent has left the game.");
          }, 1000);
        }

        break;

      case 'status':
        if (inLobby) {
          setLobbyStatus(message.message);
        }
        setStatusMessage(message.message);
        break;

      case 'game_start':
        console.log('Received game_start message:', message);

        try {
          // Make sure we have all required fields
          if (!message.game_id || !message.color || !message.fen) {
            console.error('Missing required fields in game_start message:', message);
            setStatusMessage('Error: Invalid game start message received');
            break;
          }

          // CRITICAL: Check if we're already in this game to prevent reloading
          if (gameId === message.game_id) {
            console.log('Already in this game, updating state without UI changes');

            // Just update the game state without changing the UI
            setFen(message.fen);
            setIsMyTurn(message.turn === message.color);
            setTimeWhite(message.time_white || 300); // Default to 5 minutes if not provided
            setTimeBlack(message.time_black || 300);
            setCurrentTurnForTimer(message.turn || 'white');
            break;
          }

          // Log detailed information about the game state
          console.log('Game state details:');
          console.log(`- Game ID: ${message.game_id}`);
          console.log(`- Player color: ${message.color}`);
          console.log(`- FEN: ${message.fen}`);
          console.log(`- Current turn: ${message.turn || 'white'}`);
          console.log(`- Time white: ${message.time_white || 300}`);
          console.log(`- Time black: ${message.time_black || 300}`);

          // IMPORTANT: Update game state in a specific order to prevent UI issues
          // First, set the game ID and player color
          setGameId(message.game_id);
          setPlayerColor(message.color);

          // Then update the game state
          setFen(message.fen || 'start');
          setIsMyTurn(message.turn === message.color);
          setTimeWhite(message.time_white || 300);
          setTimeBlack(message.time_black || 300);
          setCurrentTurnForTimer(message.turn || 'white');

          // Update UI state
          setStatusMessage(`Game started. You are playing as ${message.color}.`);
          setInLobby(false);
          setIsSpectating(false);
          setIsWaitingForOpponent(false); // Clear waiting state

          // Reset chat and game result
          setChatMessages([]);
          setGameResult(null);

          console.log(`Game started successfully. You are playing as ${message.color}.`);
        } catch (error) {
          console.error('Error handling game_start message:', error);
          setStatusMessage('Error starting game. Please refresh and try again.');
        }
        break;

      case 'spectate_info':
        console.log('Received spectate_info message:', message);

        // Make sure we have all required fields
        if (!message.game_id || !message.fen) {
          console.error('Missing required fields in spectate_info message:', message);
          setStatusMessage('Error: Invalid spectate info message received');
          break;
        }

        // Store the game ID in localStorage for reconnection
        localStorage.setItem('currentGameId', message.game_id);
        console.log(`Stored spectated game ID in localStorage: ${message.game_id}`);

        // Log detailed information about the spectated game
        console.log('Spectating game details:');
        console.log(`- Game ID: ${message.game_id}`);
        console.log(`- FEN: ${message.fen}`);
        console.log(`- Current turn: ${message.turn || 'white'}`);
        console.log(`- Time white: ${message.time_white || 300}`);
        console.log(`- Time black: ${message.time_black || 300}`);

        // Update game state with spectator information
        setGameId(message.game_id);
        setFen(message.fen || 'start');
        setPlayerColor('spectator');
        setIsMyTurn(false); // Spectators can never make moves
        setStatusMessage(`Spectating game ${message.game_id}.`);
        setTimeWhite(message.time_white || 300);
        setTimeBlack(message.time_black || 300);
        setCurrentTurnForTimer(message.turn || 'white');

        // Make sure we're not in the lobby and are spectating
        setInLobby(false);
        setIsSpectating(true);

        // Reset chat and game result
        setChatMessages([]);
        setGameResult(null);

        console.log(`Now spectating game ${message.game_id}`);
        break;

      case 'game_update':
        // CRITICAL FIX: Check if we've explicitly left the game
        // If we have, ignore all updates for this game
        if (localStorage.getItem('game_left') === 'true') {
          console.log(`CRITICAL: Ignoring game update for game ${message.game_id} because we've left the game`);
          break;
        }

        // CRITICAL FIX: Always update the last known game ID
        // This will be used to determine which client should win when a player leaves
        if (message.game_id) {
          console.log(`CRITICAL: Updating last known game ID: ${message.game_id}`);
          setLastKnownGameId(message.game_id);
        }

        // CRITICAL FIX: Check if this update is for our current game
        const savedGameId = localStorage.getItem('currentGameId');

        // Check if this update is for our current game, saved game, or last known game
        if (message.game_id === gameId ||
            message.game_id === savedGameId ||
            message.game_id === lastKnownGameId) {

          console.log('CRITICAL: Game update received for relevant game:', message);
          console.log('Current client state before update:');
          console.log(`- Game ID: ${gameId}`);
          console.log(`- Saved Game ID: ${savedGameId}`);
          console.log(`- Last Known Game ID: ${lastKnownGameId}`);
          console.log(`- Player color: ${playerColor}`);
          console.log(`- Is my turn: ${isMyTurn}`);
          console.log(`- Is spectating: ${isSpectating}`);
          console.log(`- Current FEN: ${fen}`);

          // CRITICAL FIX: If we don't have a game ID but have a relevant game ID, update the game ID
          if (!gameId) {
            if (savedGameId && message.game_id === savedGameId) {
              console.log(`CRITICAL: Updating game ID from saved game ID: ${savedGameId}`);
              setGameId(savedGameId);
            } else if (message.game_id === lastKnownGameId) {
              console.log(`CRITICAL: Updating game ID from last known game ID: ${lastKnownGameId}`);
              setGameId(lastKnownGameId);
            }
          }

          // CRITICAL FIX: Check if this update contains a game_over message
          if (message.result === 'opponent_disconnected') {
            console.log('CRITICAL: Received game_over in game_update');

            // Check if we're the winner
            if (message.winner === playerColor) {
              console.log('CRITICAL: We are the winner!');

              // Create a win notification
              const forcedWinMessage = {
                type: 'forced_win',
                game_id: message.game_id,
                winner: message.winner,
                disconnected_player: message.disconnected_player || (message.winner === 'white' ? 'black' : 'white'),
                details: "Your opponent has left the game. You win by default.",
                timestamp: Date.now()
              };

              // Process the win notification
              console.log('CRITICAL: Processing forced win message:', forcedWinMessage);
              handleServerMessage(forcedWinMessage);
            }
          }

          // Clear all turn unblock timeouts
          // This ensures we don't accidentally unblock turns when we've received a valid response
          clearAllTurnTimeouts();

          // Make sure we have the minimum required fields
          if (!message.fen) {
            console.error('Missing required FEN field in game_update message:', message);
            break;
          }

          // Log the FEN string for debugging
          console.log(`Received FEN from server: ${message.fen}`);
          console.log(`Current FEN: ${fen}`);

          // Only update the FEN if it's different from the current FEN
          if (message.fen !== fen) {
            console.log('Updating FEN state with server value');
            setFen(message.fen);
          } else {
            console.log('FEN unchanged, not updating state');
          }

          // Get the current turn from the message, default to white if not provided
          const newTurn = message.turn || 'white';
          console.log(`TURN UPDATE - Server says it's ${newTurn}'s turn`);
          console.log(`TURN UPDATE - FEN from server: ${message.fen}`);

          // Handle turn updates differently based on whether we're playing or spectating
          if (!isSpectating) {
            // We're a player, so update isMyTurn based on our color
            const isNowMyTurn = newTurn === playerColor;
            console.log(`TURN UPDATE - Turn changed to ${newTurn}, my color is ${playerColor}, isMyTurn: ${isNowMyTurn}`);

            // Log the previous turn state
            console.log(`TURN UPDATE - Previous isMyTurn: ${isMyTurn}, New isMyTurn: ${isNowMyTurn}`);

            // CRITICAL FIX: Check if this is a move confirmation
            // If the last move was made by this player and the turn has changed to the opponent,
            // this is likely a move confirmation
            if (message.last_move && !isNowMyTurn && isMyTurn) {
              console.log('MOVE CONFIRMATION DETECTED - Turn has changed from player to opponent');

              // Clear all turn unblock timeouts since the move was confirmed
              clearAllTurnTimeouts();
            }

            // CRITICAL FIX: If the turn has changed from opponent to player, ensure we unblock the turn
            if (isNowMyTurn && !isMyTurn) {
              console.log('TURN CHANGE DETECTED - Turn has changed from opponent to player');
              console.log('CRITICAL: Ensuring turn is unblocked');

              // Clear all turn unblock timeouts
              clearAllTurnTimeouts();
            }

            // Update isMyTurn state
            setIsMyTurn(isNowMyTurn);

            // Only show captured piece information, not turn indicators
            if (isNowMyTurn) {
              console.log('*** IT IS NOW YOUR TURN ***');
              // Clear status message - no need to show turn indicators
              setStatusMessage(``);

              // Play a notification sound
              playNotificationSound();
            } else {
              console.log('*** IT IS NOW OPPONENT\'S TURN ***');

              // Check if this update includes capture information
              if (message.is_capture) {
                const capturedPieceName = getPieceTypeName(message.captured_piece);
                setStatusMessage(`${capturedPieceName} captured!`);

                // Play capture sound
                playGameSound(true);
              } else {
                // Clear status message - no need to show turn indicators
                setStatusMessage(``);
              }
            }
          } else {
            // We're a spectator, but don't show turn indicators
            setStatusMessage(``);
          }

          // Update game result if provided
          if (message.result) {
            console.log('CRITICAL: Game result received in game_update:', message.result);

            // Create a more detailed game result object
            const gameResultObj = {
              outcome: message.result,
              winner: message.winner
            };

            // Check if this is an opponent_disconnected result
            if (message.result === 'opponent_disconnected') {
              console.log('CRITICAL: Opponent disconnected result received in game_update');

              // Add disconnected player information if available
              if (message.disconnected_player) {
                gameResultObj.disconnectedPlayer = message.disconnected_player;
              }

              // Check if the player won
              if (playerColor && message.winner === playerColor) {
                gameResultObj.playerWon = true;
                console.log('CRITICAL: Player won due to opponent disconnection');

                // Set a flag in localStorage to indicate that we've received a win notification
                localStorage.setItem('received_win_notification', 'true');
                localStorage.setItem('win_notification_timestamp', Date.now().toString());
                localStorage.setItem('win_notification_game_id', message.game_id);

                // Play win sound
                setTimeout(() => {
                  try {
                    const audio = new Audio('/win.mp3');
                    audio.volume = 1.0; // Set volume to maximum
                    audio.play().catch(e => console.log('Audio play failed:', e));
                    console.log('CRITICAL: Win sound played');
                  } catch (e) {
                    console.log('Audio not supported:', e);
                  }
                }, 500);
              }
            }

            console.log('CRITICAL: Created game result object from game_update:', gameResultObj);
            setGameResult(gameResultObj);

            // Create a more detailed status message
            let statusMsg = `Game over: ${message.result}`;
            if (message.result === 'opponent_disconnected' && playerColor && message.winner === playerColor) {
              statusMsg = `Game over: You won! Your opponent disconnected.`;
            }

            setStatusMessage(statusMsg);
            setIsMyTurn(false);
          }

          // Update last move if provided
          if (message.last_move) {
            console.log(`Last move updated to: ${message.last_move}`);
            setLastMove(message.last_move);
          }

          // Handle timer updates with default values if not provided
          const whiteTime = typeof message.time_white === 'number' ? message.time_white : timeWhite;
          const blackTime = typeof message.time_black === 'number' ? message.time_black : timeBlack;

          console.log(`Updating timers - White: ${whiteTime.toFixed(1)}s, Black: ${blackTime.toFixed(1)}s`);

          // Store the previous times for comparison
          const prevWhite = timeWhite;
          const prevBlack = timeBlack;

          // Update the timer values
          setTimeWhite(whiteTime);
          setTimeBlack(blackTime);

          // Log any significant changes in timer values
          if (Math.abs(prevWhite - whiteTime) > 1 || Math.abs(prevBlack - blackTime) > 1) {
            console.log(`SIGNIFICANT TIMER CHANGE - White: ${prevWhite.toFixed(1)}s -> ${whiteTime.toFixed(1)}s, Black: ${prevBlack.toFixed(1)}s -> ${blackTime.toFixed(1)}s`);
          }

          // Update whose turn it is for the timer
          console.log(`Setting current turn for timer to: ${newTurn}`);
          setCurrentTurnForTimer(newTurn);
        } else {
          console.log(`Ignoring game update for different game: ${message.game_id} vs ${gameId}`);
        }
        break;

      case 'game_over':
        console.log('CRITICAL: Received game_over message:', message);
        console.log('CRITICAL: Current player color:', playerColor);
        console.log('CRITICAL: Is spectating:', isSpectating);
        console.log('CRITICAL: Game ID:', gameId);

        // CRITICAL FIX: Don't clear the game ID until we've processed the message
        // This ensures we can still receive game updates for the current game

        // CRITICAL FIX: If the message is for a different game ID, check if it matches the saved game ID
        const savedGameIdForGameOver = localStorage.getItem('currentGameId');
        if (message.game_id && message.game_id !== gameId && message.game_id === savedGameIdForGameOver) {
          console.log(`CRITICAL: Game over message is for saved game ID ${savedGameIdForGameOver}, updating current game ID`);
          setGameId(savedGameIdForGameOver);
        }

        // Import sound effects if available
        try {
          const { playTimeoutSound } = require('./utils/soundEffects');

          // Play timeout sound if the game ended due to timeout
          if (message.result === 'timeout' && typeof playTimeoutSound === 'function') {
            playTimeoutSound();
          }
        } catch (error) {
          console.log('Sound effects not available:', error);
        }

        // Update game state with more detailed information
        const gameResultObj = {
          outcome: message.result,
          winner: message.winner
        };

        // Add timed out player information for timeout results
        if (message.result === 'timeout' && message.timed_out_player) {
          gameResultObj.timedOutPlayer = message.timed_out_player;
        }

        // Add disconnected player information for opponent_disconnected results
        if (message.result === 'opponent_disconnected' && message.disconnected_player) {
          gameResultObj.disconnectedPlayer = message.disconnected_player;
          console.log('Disconnected player:', message.disconnected_player);
        }

        // Add final time information if available
        if (typeof message.final_time_white === 'number') {
          gameResultObj.finalTimeWhite = message.final_time_white;
          setTimeWhite(message.final_time_white);
        }

        if (typeof message.final_time_black === 'number') {
          gameResultObj.finalTimeBlack = message.final_time_black;
          setTimeBlack(message.final_time_black);
        }

        // Add additional information for personalized messages
        if (playerColor && !isSpectating) {
          // Determine if the player won or lost
          if (message.winner === playerColor) {
            gameResultObj.playerWon = true;
          } else if (message.winner && message.winner !== playerColor) {
            gameResultObj.playerWon = false;
          }
        }

        // Add detailed reason for the game ending
        if (message.details) {
          gameResultObj.details = message.details;
        }

        // CRITICAL FIX: Log detailed information about the game result
        console.log('Created game result object:', gameResultObj);
        console.log('Player color:', playerColor);
        console.log('Winner from message:', message.winner);
        console.log('Player won:', gameResultObj.playerWon);

        setGameResult(gameResultObj);

        // Create a more detailed status message
        let statusMsg = `Game over: ${message.result}`;
        if (message.result === 'timeout' && message.timed_out_player) {
          statusMsg += `. ${message.timed_out_player} ran out of time`;
        }
        if (message.winner) {
          statusMsg += `. Winner: ${message.winner}`;
        }

        // Add personalized message for the player
        if (playerColor && !isSpectating) {
          if (message.winner === playerColor) {
            statusMsg = `Game over: You won by ${message.result}!`;
          } else if (message.winner && message.winner !== playerColor) {
            statusMsg = `Game over: You lost by ${message.result}.`;
          } else if (message.result.includes('draw') || message.result === 'stalemate') {
            statusMsg = `Game over: Draw by ${message.result}.`;
          } else if (message.result === 'opponent_disconnected') {
            if (message.winner === playerColor) {
              statusMsg = `Game over: You won! Your opponent disconnected.`;
            } else {
              statusMsg = `Game over: You lost. You disconnected from the game.`;
            }
          }
        }

        setStatusMessage(statusMsg);
        setIsMyTurn(false);

        // CRITICAL FIX: Play appropriate sound based on the game result
        if (gameResultObj.playerWon) {
          // Play win sound
          console.log('CRITICAL: Playing win sound');
          setTimeout(() => {
            try {
              const audio = new Audio('/win.mp3');
              audio.volume = 1.0; // Set volume to maximum
              audio.play().catch(e => console.log('Audio play failed:', e));
              console.log('CRITICAL: Win sound played');
            } catch (e) {
              console.log('Audio not supported:', e);
            }
          }, 500); // Delay to avoid sound overlap
        } else if (gameResultObj.playerWon === false) {
          // Play lose sound
          console.log('CRITICAL: Playing lose sound');
          setTimeout(() => {
            try {
              const audio = new Audio('/lose.mp3');
              audio.volume = 1.0; // Set volume to maximum
              audio.play().catch(e => console.log('Audio play failed:', e));
              console.log('CRITICAL: Lose sound played');
            } catch (e) {
              console.log('Audio not supported:', e);
            }
          }, 500); // Delay to avoid sound overlap
        } else {
          // Play draw sound for draws
          if (message.result.includes('draw') || message.result === 'stalemate') {
            console.log('CRITICAL: Playing draw sound');
            setTimeout(() => {
              try {
                const audio = new Audio('/draw.mp3');
                audio.volume = 1.0; // Set volume to maximum
                audio.play().catch(e => console.log('Audio play failed:', e));
                console.log('CRITICAL: Draw sound played');
              } catch (e) {
                console.log('Audio not supported:', e);
              }
            }, 500); // Delay to avoid sound overlap
          }
        }

        // CRITICAL FIX: Clear the game ID after processing the message
        // This ensures we can still receive game updates for the current game
        setTimeout(() => {
          console.log('CRITICAL: Clearing game ID from localStorage');
          localStorage.removeItem('currentGameId');
        }, 2000); // 2 second delay to ensure the message is processed
        break;

      case 'games_list':
        console.log('Received games_list message:', message);
        // Make sure message.games is an array
        if (Array.isArray(message.games)) {
          setActiveGamesList(message.games);
          setLobbyStatus(`Found ${message.games.length} active games`);
          console.log(`Found ${message.games.length} active games:`, message.games);
        } else {
          console.error('Received invalid games list:', message.games);
          setActiveGamesList([]);
          setLobbyStatus('Error: Received invalid games list');
        }
        break;

      case 'chat_message':
      case 'chat_update':  // Handle both message types (to match the working implementation)
        console.log(`Received chat message: ${message.text} from ${message.sender} for game ${message.game_id || 'unknown'}`);

        // Store the client ID in localStorage for debugging
        localStorage.setItem('last_message_client_id', message.sender_id);
        localStorage.setItem('my_client_id', socketService.getClientId());

        // Get the current username and client ID
        const myUsername = localStorage.getItem('chess_username');
        const myClientId = socketService.getClientId();

        // CRITICAL: Check if this is our own message
        // We need to be extremely strict about this to avoid duplicates

        // Log detailed information for debugging
        console.log('CHAT MESSAGE DETAILS:');
        console.log('- Message sender_id:', message.sender_id);
        console.log('- My client ID:', myClientId);
        console.log('- My username:', myUsername);
        console.log('- Message sender:', message.sender);
        console.log('- Message original_sender:', message.original_sender);
        console.log('- Message sender_role:', message.sender_role);
        console.log('- My player color:', playerColor);

        // Check if this message is from the current client
        // We need to check all possible ways this could be our own message

        // 1. Check by client ID
        if (message.sender_id && myClientId) {
          // Convert both to strings for comparison
          const msgClientId = message.sender_id.toString();
          const myClientIdStr = myClientId.toString();

          if (msgClientId === myClientIdStr) {
            console.log('SKIPPING - Client ID match');
            return; // Skip this message entirely
          }
        }

        // 2. Check by player color
        if (playerColor === 'white' && message.sender_role === 'white') {
          console.log('SKIPPING - White player match');
          return; // Skip this message entirely
        }

        if (playerColor === 'black' && message.sender_role === 'black') {
          console.log('SKIPPING - Black player match');
          return; // Skip this message entirely
        }

        // 3. Check by spectator status
        if (isSpectating && message.sender_role && message.sender_role.startsWith('Spectator')) {
          console.log('SKIPPING - Spectator match');
          return; // Skip this message entirely
        }

        // 4. Check by username
        if (myUsername) {
          if (message.sender === myUsername ||
              message.original_sender === myUsername ||
              message.username === myUsername) {
            console.log('SKIPPING - Username match');
            return; // Skip this message entirely
          }
        }

        // 5. Check for duplicate message ID
        if (message.message_id) {
          const hasDuplicateId = chatMessages.some(msg =>
            msg.message_id === message.message_id);

          if (hasDuplicateId) {
            console.log('SKIPPING - Duplicate message ID');
            return; // Skip this message entirely
          }
        }

        // 6. Check for duplicate text (sent within 5 seconds)
        const hasDuplicateText = chatMessages.some(msg =>
          msg.text === message.text &&
          Math.abs((msg.timestamp || 0) - (message.timestamp || 0)) < 5000);

        if (hasDuplicateText) {
          console.log('SKIPPING - Duplicate text within 5 seconds');
          return; // Skip this message entirely
        }

        // If we get here, this is a message from someone else
        // Create a new message object
        const newMessage = {
          sender: message.sender || 'Unknown',
          text: message.text,
          timestamp: message.timestamp || Date.now(),
          isSystem: message.sender === 'System',
          message_id: message.message_id,
          sender_role: message.sender_role,
          original_sender: message.original_sender,
          sender_id: message.sender_id
        };

        // Add the message to the chat
        console.log('Adding new message to chat:', newMessage);
        setChatMessages(prev => {
          // First, add the new message
          const updatedMessages = [...prev, newMessage];

          // Then, clear the awaiting_response flag for any messages that have received a response
          // A message has received a response if there's a newer message from a different sender
          return updatedMessages.map(msg => {
            // Skip the message we just added
            if (msg.message_id === newMessage.message_id) {
              return msg;
            }

            // Skip messages that aren't awaiting a response
            if (!msg.awaiting_response) {
              return msg;
            }

            // Skip messages from the same sender as the new message
            if (msg.sender_id === newMessage.sender_id) {
              return msg;
            }

            // If the message is older than the new message, clear the awaiting_response flag
            if (msg.timestamp < newMessage.timestamp) {
              return { ...msg, awaiting_response: false };
            }

            return msg;
          });
        });
        break;

      case 'chat_messages_deleted':
        console.log('Received chat_messages_deleted message:', message);

        // Check if we have the message IDs to delete
        if (message.message_ids && Array.isArray(message.message_ids)) {
          console.log(`Deleting ${message.message_ids.length} messages due to timeout`);

          // Filter out the deleted messages from the chat messages array
          setChatMessages(prev => prev.filter(msg =>
            !message.message_ids.includes(msg.message_id)
          ));

          // Add a system message about the deletion
          const senderInfo = message.sender_id ?
            `from ${chatMessages.find(msg => msg.sender_id === message.sender_id)?.sender || 'a player'}` :
            '';

          const systemMessage = {
            sender: 'System',
            text: `Messages ${senderInfo} were deleted due to no response within 1 minute.`,
            timestamp: message.timestamp || Date.now(),
            isSystem: true
          };

          // Add the system message
          setChatMessages(prev => [...prev, systemMessage]);
        }
        break;

      case 'error':
        console.log('Received error message:', message.message);

        // CRITICAL FIX: Clear any pending turn unblock timeout
        // This ensures we don't accidentally unblock turns when we've received a valid response
        clearAllTurnTimeouts();

        // Check if this is an invalid game ID error
        if (message.message && (
            message.message.includes('Game not found') ||
            message.message.includes('Invalid game_id') ||
            message.message.includes('not found')
          )) {
          console.log('Received invalid game ID error, clearing game state');

          // Show a more user-friendly message
          setStatusMessage(`Game no longer exists. Returning to lobby...`);

          // Reset game state and return to lobby
          resetGameState(true);

          // Refresh the games list after a short delay
          setTimeout(() => {
            console.log('Refreshing games list after error');
            socketService.sendMessage({ type: 'join_lobby' });
            socketService.sendMessage({ type: 'list_games' });
          }, 500);
        } else if (message.message && message.message.includes('Not your turn')) {
          // CRITICAL FIX: Unblock turns when the server rejects a move due to turn issues
          console.log('Turn error detected, resetting turn state');

          // Update the status message to inform the user
          setStatusMessage(`Error: ${message.message}`);

          // Reset the turn state based on the current player color and game state
          // This ensures the turn is properly unblocked
          if (playerColor) {
            const currentTurn = currentTurnForTimer || 'white';
            const shouldBeMyTurn = currentTurn === playerColor;

            console.log(`Resetting turn state - Current turn: ${currentTurn}, Player color: ${playerColor}`);
            console.log(`Setting isMyTurn to: ${shouldBeMyTurn}`);

            // Update the turn state
            setIsMyTurn(shouldBeMyTurn);

            // IMPROVED: If it should be my turn but isMyTurn is false, force it to true
            // This ensures the turn is unblocked even if there's a state inconsistency
            if (shouldBeMyTurn && !isMyTurn) {
              console.log('CRITICAL: Force unblocking turn due to turn error');
              setIsMyTurn(true);
            }
          } else {
            // If we don't have a player color, we're probably a spectator
            // Just set isMyTurn to false to be safe
            setIsMyTurn(false);
          }

          // Clear all turn unblock timeouts
          clearAllTurnTimeouts();

          // Request a game state update to ensure we're in sync with the server
          if (gameId) {
            console.log('Requesting game state update after turn error');
            requestGameUpdate();

            // Request another update after a short delay to ensure we get the latest state
            requestGameUpdate(500);
          }
        } else {
          // For other errors, just show the message
          setStatusMessage(`Error: ${message.message}`);

          // If the error is related to an illegal move, make sure to unblock the turn
          if (message.message && message.message.includes('Illegal move')) {
            console.log('Illegal move error detected, resetting turn state');

            // Only reset if we're a player and not a spectator
            if (playerColor && !isSpectating) {
              console.log(`Resetting isMyTurn to true after illegal move error`);
              setIsMyTurn(true);
            }
          }
        }
        break;

      case 'opponent_disconnected':
        console.log('CRITICAL: Received opponent_disconnected message:', message);
        console.log('CRITICAL: Current player color:', playerColor);
        console.log('CRITICAL: Is spectating:', isSpectating);
        console.log('CRITICAL: Game ID:', gameId);

        // CRITICAL FIX: Don't clear the game ID until we've processed the message
        // This ensures we can still receive game updates for the current game

        // Create a detailed game result object
        const disconnectionResult = {
          outcome: 'opponent_disconnected',
          winner: message.winner || playerColor, // Use the winner from the message if available
          message: message.message || "Your opponent has left the game.",
          playerWon: playerColor && message.winner === playerColor, // Check if the player won
          details: message.details || "Your opponent disconnected from the game."
        };

        console.log('CRITICAL: Created disconnection result:', disconnectionResult);
        console.log('CRITICAL: Player color:', playerColor);
        console.log('CRITICAL: Winner from message:', message.winner);
        console.log('CRITICAL: Player won:', disconnectionResult.playerWon);

        // CRITICAL FIX: Set the appropriate flags in localStorage
        if (disconnectionResult.playerWon) {
          // If we're the winner, set the win notification flags
          console.log('CRITICAL: Setting win notification flags');
          localStorage.setItem('received_win_notification', 'true');
          localStorage.setItem('win_notification_timestamp', Date.now().toString());
          localStorage.setItem('win_notification_game_id', message.game_id || gameId);
        } else {
          // If we're the leaving player, set the leaving player flags
          console.log('CRITICAL: Setting leaving player flags');
          localStorage.setItem('leaving_player', 'true');
          localStorage.setItem('leaving_timestamp', Date.now().toString());
          localStorage.setItem('leaving_game_id', message.game_id || gameId);
        }

        // Update game state
        setStatusMessage(`Game ended: ${disconnectionResult.message}`);
        setGameResult(disconnectionResult);

        // CRITICAL FIX: Play win sound if the player won
        if (disconnectionResult.playerWon) {
          console.log('CRITICAL: Playing win sound');
          setTimeout(() => {
            try {
              const audio = new Audio('/win.mp3');
              audio.volume = 1.0; // Set volume to maximum
              audio.play().catch(e => console.log('Audio play failed:', e));
              console.log('CRITICAL: Win sound played');
            } catch (e) {
              console.log('Audio not supported:', e);
            }
          }, 500); // Delay to avoid sound overlap
        } else {
          // Play notification sound if the player didn't win
          console.log('CRITICAL: Playing notification sound');
          playNotificationSound();
        }

        // CRITICAL FIX: Clear the game ID after processing the message
        // This ensures we can still receive game updates for the current game
        setTimeout(() => {
          console.log('CRITICAL: Clearing game ID and flags from localStorage');
          localStorage.removeItem('currentGameId');

          // Clear the appropriate flags based on whether we're the winner or the leaving player
          if (disconnectionResult.playerWon) {
            localStorage.removeItem('received_win_notification');
            localStorage.removeItem('win_notification_timestamp');
            localStorage.removeItem('win_notification_game_id');
          } else {
            localStorage.removeItem('leaving_player');
            localStorage.removeItem('leaving_timestamp');
            localStorage.removeItem('leaving_game_id');
          }
        }, 3000); // 3 second delay to ensure the message is processed
        break;

      case 'move_confirmed':
        console.log('Received move confirmation:', message);

        // Clear all turn unblock timeouts
        clearAllTurnTimeouts();

        // Play the appropriate sound based on move type - in a non-blocking way
        setTimeout(() => {
          playGameSound(message.is_capture);
        }, 0);

        // If we're a player and not a spectator, update the turn state
        if (playerColor && !isSpectating) {
          // The move was confirmed, so it's now the opponent's turn
          const isNowMyTurn = message.turn === playerColor;

          console.log(`Move confirmed - Setting isMyTurn to: ${isNowMyTurn}`);
          setIsMyTurn(isNowMyTurn);

          // Update the status message - only show capture information, not turn indicators
          if (isNowMyTurn) {
            // Clear status message - no need to show turn indicators
            setStatusMessage(``);

            // IMPROVED: Request a game state update to ensure we're in sync with the server
            // This is especially important when it becomes our turn
            socketService.sendMessage({
              type: 'request_game_state',
              game_id: gameId
            });
          } else {
            // Add capture information to the status message if applicable
            if (message.is_capture) {
              const capturedPieceName = getPieceTypeName(message.captured_piece);
              setStatusMessage(`${capturedPieceName} captured!`);
            } else {
              // Clear status message - no need to show turn indicators
              setStatusMessage(``);
            }
          }
        }
        break;

      default:
        console.log('Unhandled message type:', message.type);
    }
  }, [gameId, inLobby, isSpectating, playerColor, clearAllTurnTimeouts, playGameSound, playNotificationSound, requestGameUpdate, resetGameState]);



  // Initialize sound effects
  useEffect(() => {
    console.log('Initializing sound effects...');

    // Initialize sounds
    initSounds();

    // Initialize sound timing variables to prevent duplicate sounds
    window.lastCaptureSoundTime = 0;
    window.lastMoveSoundTime = 0;

    // Make sound functions available globally for easier access
    window.playMoveSound = playMoveSound;
    window.playCaptureSound = playCaptureSound;

    // Test the sound initialization
    try {
      console.log('Testing sound initialization...');
      const testSound = () => {
        try {
          // Play a very quiet move sound to test audio
          playMoveSound();
          console.log('Sound test completed successfully');
        } catch (e) {
          console.log('Sound test failed:', e);
        }
      };

      // Add a click handler to help with browser autoplay policies
      const handleClick = () => {
        console.log('User interaction detected, unlocking audio...');
        testSound();
      };

      // Add the click handler
      document.addEventListener('click', handleClick, { once: true });

      // Clean up
      return () => {
        document.removeEventListener('click', handleClick);

        // Stop all sounds when component unmounts
        stopAllSounds();
      };
    } catch (e) {
      console.log('Error setting up sound initialization:', e);
    }
  }, []);

  // Connect to WebSocket on component mount
  useEffect(() => {
    // Check if there's a saved game ID, but validate it first
    const savedGameId = localStorage.getItem('currentGameId');
    if (savedGameId) {
      console.log(`Found saved game ID: ${savedGameId}, will attempt to reconnect to this game`);
      // Set the game ID in state so we can use it to request game state updates
      setGameId(savedGameId);
    } else {
      console.log('No saved game ID found, starting fresh connection');
    }

    // Function to connect to the WebSocket server
    const connectToServer = () => {
      console.log('Connecting to WebSocket server...');

      // Use the current hostname or default to localhost
      const host = window.location.hostname || 'localhost';

      // Use port 8765 which is the WebSocket server port
      const wsUrl = `ws://${host}:8765`;
      console.log(`Using WebSocket URL: ${wsUrl}`);

      // Add a small delay before connecting
      // This gives the browser time to initialize properly
      setTimeout(() => {
        try {
          // Connect to the server
          console.log('Attempting connection to WebSocket server...');
          const socket = socketService.connect(wsUrl);
          console.log('Connection attempt initiated');

          // Check if the connection was successful
          if (!socket) {
            console.error('Failed to create WebSocket connection');
            setStatusMessage('Error connecting to server. Please try again later.');
          }
        } catch (e) {
          console.error('Error during connection attempt:', e);
          setStatusMessage('Error connecting to server. Please try again later.');
        }
      }, 500); // 500ms delay
    };

    // Set up callbacks
    socketService.setOnMessageCallback(handleServerMessage);

    socketService.setOnOpenCallback(() => {
      console.log('WebSocket connection established');
      setIsConnected(true);
      setStatusMessage('Connected to server. Welcome to Chess Game!');

      // If we have a game ID, request the game state after a delay
      if (gameId) {
        console.log(`Have game ID ${gameId}, will request game state after delay`);

        // Add a longer delay before requesting game state to ensure the server has processed our join_lobby
        setTimeout(() => {
          // Check if we still have the same game ID (it might have been cleared by an error)
          const currentGameId = localStorage.getItem('currentGameId');
          if (currentGameId === gameId) {
            console.log(`Requesting game state for game ${gameId}`);
            socketService.sendMessage({
              type: 'request_game_state',
              game_id: gameId
            });
          } else {
            console.log('Game ID changed or cleared, not requesting game state');
            // If we don't have a game ID anymore, refresh the games list
            socketService.sendMessage({ type: 'list_games' });
          }
        }, 1000); // Longer delay (1 second) to ensure server is ready
      } else {
        // If we're not in a game, refresh the games list after a delay
        setTimeout(() => {
          console.log('Not in a game, refreshing games list');
          socketService.sendMessage({ type: 'list_games' });
        }, 500);
      }
    });

    socketService.setOnCloseCallback((event) => {
      console.log('WebSocket connection closed:', event);
      setIsConnected(false);

      // Show appropriate message based on closure type
      if (event.wasClean) {
        setStatusMessage('Disconnected from server. Please refresh to reconnect.');
      } else {
        setStatusMessage('Connection lost. Please refresh the page to reconnect.');
      }

      // IMPORTANT: Do NOT automatically reconnect to prevent infinite loops
      console.log('Connection closed. Manual refresh required to reconnect.');
    });

    // Initial connection
    connectToServer();

    // Clean up on unmount
    return () => {
      // No need to explicitly close the socket as the browser will do it
    };
  }, [handleServerMessage, gameId]);

  // Set up periodic timer updates to keep timers synchronized
  useEffect(() => {
    // Only set up timer updates if we're in a game and connected
    if (!gameId || !isConnected) return;

    console.log('Setting up periodic timer updates');

    // Add event listener for page unload/refresh
    // This ensures that if the player refreshes the page, we can clean up properly
    const handleBeforeUnload = () => {
      console.log('Page is being unloaded/refreshed');

      // Clear all turn unblock timeouts
      if (window.turnUnblockTimeout) {
        console.log('Clearing primary turn unblock timeout due to page unload');
        clearTimeout(window.turnUnblockTimeout);
        window.turnUnblockTimeout = null;
      }

      // Also clear the failsafe timeout
      if (window.failsafeTurnUnblockTimeout) {
        console.log('Clearing failsafe turn unblock timeout due to page unload');
        clearTimeout(window.failsafeTurnUnblockTimeout);
        window.failsafeTurnUnblockTimeout = null;
      }
    };

    // CRITICAL FIX: Add event listener for client-side timeout detection
    const handleTimeout = (event) => {
      console.log('Received client-side timeout event:', event.detail);

      // Only handle the event if we're in a game and don't already have a game result
      if (!gameId || gameResult) {
        console.log('Ignoring timeout event - not in a game or game already has a result');
        return;
      }

      // Create a timeout result object
      const timeoutResult = {
        outcome: 'timeout',
        timedOutPlayer: event.detail.color,
        winner: event.detail.winner
      };

      console.log('Creating client-side timeout result:', timeoutResult);

      // Update the game result state
      setGameResult(timeoutResult);

      // Update the status message
      const statusMsg = `Game over: ${event.detail.color} ran out of time. Winner: ${event.detail.winner}`;
      setStatusMessage(statusMsg);

      // Set the appropriate timer to exactly 0
      if (event.detail.color === 'white') {
        setTimeWhite(0);
      } else {
        setTimeBlack(0);
      }

      // Disable turns
      setIsMyTurn(false);

      // Request a game state update to ensure we're in sync with the server
      requestGameUpdate();
    };

    // Add the event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('chess-timeout', handleTimeout);

    // Add a global function to request game state updates
    // This is used by the Timer component when the tab becomes visible again
    window.requestGameStateUpdate = () => {
      if (isConnected && gameId) {
        console.log('Requesting game state update from global function');
        socketService.sendMessage({
          type: 'request_game_state',
          game_id: gameId
        });
        return true;
      }
      return false;
    };

    // Use a much less frequent update interval to reduce server load
    // 5000ms (5 seconds) is sufficient for basic synchronization and significantly reduces server load
    const timerUpdateInterval = setInterval(() => {
      // Check if we're still connected and the game ID is still valid
      if (isConnected && gameId && localStorage.getItem('currentGameId') === gameId) {
        // Only send update requests if the socket is actually open
        if (socketService.getSocketState() === WebSocket.OPEN) {
          console.log('Sending periodic game state update request');
          socketService.sendMessage({
            type: 'request_game_state',
            game_id: gameId
          });
        } else {
          console.log('Socket not open, skipping periodic update');
        }
      } else {
        console.log('Skipping periodic update - connection changed or game ID cleared');
      }
    }, 5000); // Update every 5 seconds to minimize server load

    // Clean up on unmount or when gameId changes
    return () => {
      clearInterval(timerUpdateInterval);
      console.log('Cleared periodic timer updates');

      // Remove the global function
      delete window.requestGameStateUpdate;

      // Remove the event listeners
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('chess-timeout', handleTimeout);

      // Reset the timeout detection flag
      window.timeoutDetected = false;

      // Clear all turn unblock timeouts
      clearAllTurnTimeouts();
    };
  }, [gameId, isConnected]);

  // Action handlers
  const handleJoinLobby = () => {
    // Get the username from localStorage
    const username = localStorage.getItem('chess_username') || 'Player';

    // First, update the UI to show we're joining the lobby
    setLobbyStatus(`Joining as ${username}, please wait...`);

    // Clear any existing game state to ensure we start fresh
    resetGameState(true);

    // Set waiting for opponent state
    setIsWaitingForOpponent(true);

    // Send the join_lobby message with username
    const success = socketService.sendMessage({
      type: 'join_lobby',
      username: username // Include the username
    });

    console.log(`Sent join_lobby with username: ${username}`);

    if (!success) {
      // If the message couldn't be sent, update the UI
      setLobbyStatus('Failed to join lobby. Please check your connection and try again.');
      setIsWaitingForOpponent(false);
      return;
    }

    // After joining the lobby, send a join_queue message with the username and board style
    setTimeout(() => {
      // Get the board style from localStorage
      const boardStyle = localStorage.getItem('chess_board_style') || 'classic';

      console.log(`Joining queue as ${username} with board style: ${boardStyle}`);
      socketService.sendMessage({
        type: 'join_queue',
        username: username, // Include the username
        board_style: boardStyle // Include the board style
      });
    }, 500);

    // Disable the button for a short time to prevent multiple clicks
    setIsJoiningLobby(true);
    setTimeout(() => {
      setIsJoiningLobby(false);
    }, 3000);

    // Also refresh the games list after a short delay
    setTimeout(() => {
      console.log('Refreshing games list after joining lobby');
      socketService.sendMessage({ type: 'list_games' });
    }, 1000);
  };

  const handleListGames = () => {
    socketService.sendMessage({ type: 'list_games' });
  };

  const handleSpectateGame = (gameIdToSpectate) => {
    socketService.sendMessage({
      type: 'spectate_game',
      game_id: gameIdToSpectate
    });
  };

  const handleMakeMove = (uciMove) => {
    console.log('=== MOVE ATTEMPT ===');
    console.log('handleMakeMove called with move:', uciMove);
    console.log('Current game state:', { isMyTurn, isSpectating, gameId, playerColor });
    console.log('Current FEN:', fen);

    // Check if it's actually the player's turn
    if (!isMyTurn) {
      console.log('WARNING: Attempting to make a move when it is not the player\'s turn!');
      console.log('Current turn state:', { isMyTurn, playerColor });

      // Don't allow moves when it's not the player's turn
      // Don't show any message - the timers already indicate whose turn it is
      setStatusMessage(``);
      return;
    }

    // Log the move being sent
    console.log('Sending move to server:', uciMove);

    // Immediately update the turn state to prevent multiple moves
    console.log('Immediately setting isMyTurn to false to prevent multiple moves');
    setIsMyTurn(false);

    // Update the status message to indicate waiting for the server
    setStatusMessage(`Move sent: ${uciMove}. Waiting for opponent...`);

    // Send the move to the server immediately
    const success = socketService.sendMessage({
      type: 'make_move',
      move: uciMove,
      game_id: gameId
    });

    if (success) {
      console.log('Move sent successfully to server');

      // Force update the turn immediately for better UX
      // This will be overridden by the server's response, but provides immediate feedback
      const newTurn = playerColor === 'white' ? 'black' : 'white';
      console.log(`Setting current turn for timer to: ${newTurn}`);
      console.log(`Previous turn: ${currentTurnForTimer}, New turn: ${newTurn}`);
      setCurrentTurnForTimer(newTurn);

      // IMPROVED FIX: Use a more reliable turn unblocking mechanism
      // This ensures that if the server rejects the move but the client doesn't receive the response,
      // the turn will still be unblocked after a reasonable timeout

      // Store the current timestamp when the move was sent
      window.lastMoveSentTime = Date.now();

      // Set a primary timeout to restore turn state if no response is received
      window.turnUnblockTimeout = setTimeout(() => {
        console.log('Primary turn unblock timeout triggered');

        // Check if it's been at least 1.5 seconds since the move was sent
        const timeSinceMoveSent = Date.now() - (window.lastMoveSentTime || 0);
        console.log(`Time since move was sent: ${timeSinceMoveSent}ms`);

        if (timeSinceMoveSent >= 1500) {
          // Always restore the turn state after timeout
          console.log('Restoring turn state after timeout');
          setIsMyTurn(true);
          // Clear status message - no need to show turn indicators
          setStatusMessage(``);

          // Request a game state update to ensure we're in sync with the server
          socketService.sendMessage({
            type: 'request_game_state',
            game_id: gameId
          });
        } else {
          console.log('Move was sent too recently, not unblocking turn yet');
        }
      }, 1500); // 1.5 seconds is a reasonable timeout

      // Set a failsafe timeout that will ALWAYS unblock the turn after 5 seconds
      // This ensures that turns are never permanently blocked
      window.failsafeTurnUnblockTimeout = setTimeout(() => {
        console.log('FAILSAFE turn unblock timeout triggered');

        // Force unblock the turn regardless of any other conditions
        setIsMyTurn(true);
        // Clear status message - no need to show turn indicators
        setStatusMessage(``);

        // Request a game state update to ensure we're in sync with the server
        requestGameUpdate();
      }, 5000); // 5 seconds failsafe timeout

      // Request a single game state update after a short delay
      requestGameUpdate(500);
    } else {
      console.error('Failed to send move - WebSocket not connected');
      setStatusMessage('Failed to send move. Please check your connection.');

      // If the move failed to send, restore the turn state
      setIsMyTurn(true);
    }
  };

  const handleSendChat = (text) => {
    if (!text.trim()) return; // Don't send empty messages

    // Get the username from localStorage or use the player color as fallback
    const username = localStorage.getItem('chess_username');

    // Make sure we have a username
    if (!username) {
      console.error('No username found in localStorage');
      // Add a system message to the chat
      setChatMessages(prev => [...prev, {
        sender: 'System',
        text: 'Error: No username found. Please set your username and try again.',
        timestamp: Date.now(),
        isSystem: true
      }]);
      return;
    }

    // Send the message to the server first
    console.log(`Sending chat message: ${text} for game ${gameId}`);

    let success = false;

    // Make sure we're sending the correct game ID
    if (gameId) {
      console.log(`Using game ID: ${gameId} for chat message`);

      // IMPORTANT: Use the correct message format
      // The server expects a chat_message type with a game_id
      // This matches the format used in the working implementation
      success = socketService.sendMessage({
        type: 'chat_message',
        text: text,
        game_id: gameId,
        username: username // Send the username with the message
      });
    } else {
      console.log('No game ID available, sending as lobby message');
      success = socketService.sendMessage({
        type: 'chat_message',
        text: text,
        game_id: 'lobby',
        username: username // Send the username with the message
      });
    }

    if (!success) {
      console.error('Failed to send chat message - WebSocket not connected');
      // Add a system message to the chat
      setChatMessages(prev => [...prev, {
        sender: 'System',
        text: 'Failed to send message. Please check your connection.',
        timestamp: Date.now(),
        isSystem: true
      }]);
      return;
    }

    // Get the client ID
    const myClientId = socketService.getClientId();

    // Create a unique message ID to help with duplicate detection
    const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    // Store the message ID in localStorage for debugging
    localStorage.setItem('last_sent_message_id', messageId);
    localStorage.setItem('last_sent_client_id', myClientId);

    // Add an optimistic update with detailed identification
    setChatMessages(prev => [...prev, {
      sender: 'You',
      text: text,
      timestamp: Date.now(),
      client_id: myClientId, // Add client ID for identification
      sender_id: myClientId, // Add sender_id to match server format
      is_self: true, // Mark this message as from self
      username: username, // Include username
      message_id: messageId, // Add unique message ID
      player_color: playerColor, // Include player color if available
      sender_role: playerColor || 'spectator', // Include sender role
      original_sender: username, // Include original sender
      optimistic: true, // Mark as optimistic update
      awaiting_response: true // Mark that this message is awaiting a response
    }]);
  };

  // Handler for returning to the lobby
  const handleBackToLobby = () => {
    console.log('CRITICAL: Returning to lobby');

    // CRITICAL FIX: Store the current game ID for the opponent to receive the win
    // We'll use the gameId state variable or the lastKnownGameId variable
    const currentGameId = gameId || lastKnownGameId;
    console.log(`CRITICAL: Current game ID: ${currentGameId}`);

    // CRITICAL FIX: Force a complete reset of the game state
    // This will prevent us from coming back to the game

    // 1. First, send a leave_game message with the current game ID and force_end flag
    if (currentGameId) {
      console.log(`CRITICAL: Sending leave_game message with game ID: ${currentGameId} and force_end flag`);
      socketService.sendMessage({
        type: 'leave_game',
        game_id: currentGameId,
        force_end: true // Add a flag to force the game to end
      });
    }

    // 2. Immediately clear ALL game-related state
    console.log('CRITICAL: Clearing all game state');
    setGameId(null);
    setGameResult(null);
    setPlayerColor(null);
    setIsMyTurn(false);
    setFen('start');
    setLastMove(null);
    setChatMessages([]);
    setTimeWhite(300);
    setTimeBlack(300);
    setCurrentTurnForTimer('white');
    setLastKnownGameId(null); // Clear the last known game ID

    // 3. Immediately set the lobby state
    console.log('CRITICAL: Setting lobby state');
    setInLobby(true);
    setIsWaitingForOpponent(false);
    setIsJoiningLobby(false);
    setIsSpectating(false);

    // 4. Clear ALL game-related localStorage items
    console.log('CRITICAL: Clearing all localStorage items');

    // Create a list of all game-related localStorage keys
    const gameKeys = [
      'currentGameId',
      'last_message_client_id',
      'last_sent_message_id',
      'last_sent_client_id',
      'my_client_id',
      'received_win_notification',
      'win_notification_timestamp',
      'win_notification_game_id',
      'leaving_player',
      'leaving_timestamp',
      'leaving_game_id',
      'last_known_game_id',
      'game_left',
      'game_left_timestamp'
    ];

    // Clear each key
    gameKeys.forEach(key => {
      localStorage.removeItem(key);
      console.log(`CRITICAL: Removed ${key} from localStorage`);
    });

    // 5. Reset the client ID to ensure a clean state
    const newClientId = socketService.resetClientId();
    console.log(`CRITICAL: Reset client ID to: ${newClientId}`);

    // 6. Force a complete socket reconnection
    const currentUrl = socketService.getSocketUrl();
    if (currentUrl) {
      console.log(`CRITICAL: Forcing socket reconnection to ${currentUrl}`);

      // First close the existing socket if it exists
      try {
        socketService.closeSocket();
        console.log('CRITICAL: Closed existing socket');
      } catch (e) {
        console.log('CRITICAL: Error closing socket:', e);
      }

      // Then reconnect with a new client ID after a delay
      setTimeout(() => {
        try {
          socketService.connect(currentUrl);
          console.log('CRITICAL: Reconnected to server with new client ID');

          // Send a join_lobby message with the new client ID after another delay
          setTimeout(() => {
            console.log('CRITICAL: Sending join_lobby message with new client ID');
            socketService.sendMessage({
              type: 'join_lobby',
              username: localStorage.getItem('chess_username') || 'Player',
              client_id: newClientId
            });
          }, 500); // 500ms delay to ensure the socket is connected
        } catch (e) {
          console.log('CRITICAL: Error reconnecting to server:', e);
        }
      }, 500); // 500ms delay to ensure the socket is closed
    }

    console.log('CRITICAL: Successfully returned to lobby');
  };

  // Play Again functionality has been removed





  // Render
  return (
    <div className="App">
      <header className="App-header">
        <h1>Chess Game</h1>
      </header>

      <main>
        {!isConnected ? (
          // Show connection status when not connected
          <div className="connection-status">
            <p>{statusMessage}</p>
          </div>
        ) : gameId ? (
          // If we have a gameId and game result, show the game result page
          gameResult ? (
            <GameResultPage
              gameResult={gameResult}
              playerColor={playerColor}
              isSpectating={isSpectating}
              onBackToLobby={handleBackToLobby}
              timeWhite={timeWhite}
              timeBlack={timeBlack}
            />
          ) : (
            // Otherwise show the game view
            <GameViewComponent
              gameId={gameId}
              fen={fen}
              playerColor={playerColor}
              isMyTurn={isMyTurn}
              onMakeMove={handleMakeMove}
              gameResult={null} /* Always pass null here since we're showing the result on a separate page */
              statusMessage={statusMessage}
              lastMove={lastMove}
              isSpectating={isSpectating}
              chatMessages={chatMessages}
              onSendChat={handleSendChat}
              timeWhite={timeWhite}
              timeBlack={timeBlack}
              currentTurnForTimer={currentTurnForTimer}
              onBackToLobby={handleBackToLobby}
            />
          )
        ) : (
          // Otherwise show the main menu, waiting screen, or spectate lobby
          isWaitingForOpponent ? (
            // Show waiting screen with chessboard
            <WaitingScreen
              username={localStorage.getItem('chess_username') || 'Player'}
              boardStyle={localStorage.getItem('chess_board_style') || 'classic'}
              onCancel={() => {
                // Cancel waiting and return to main menu
                setIsWaitingForOpponent(false);
                setInLobby(true);
                // Send leave_queue message to server
                socketService.sendMessage({ type: 'leave_queue' });
              }}
            />
          ) : inLobby ? (
            <MainMenu
              onStartGame={(username, boardStyle) => {
                // Store the selected board style and username
                localStorage.setItem('chess_board_style', boardStyle);
                localStorage.setItem('chess_username', username);
                // Join the queue
                handleJoinLobby();
              }}
              onSpectate={() => {
                // Show the lobby with active games for spectating
                setLobbyStatus('Select a game to spectate');
                handleListGames();
                // Set inLobby to false to show the spectate lobby
                setInLobby(false);
              }}
              isJoiningGame={isJoiningLobby}
            />
          ) : (
            // Show the lobby with active games for spectating
            <Lobby
              lobbyStatus={lobbyStatus || statusMessage}
              activeGames={activeGamesList}
              onJoinQueueClick={handleJoinLobby}
              onRefreshGamesClick={handleListGames}
              onSpectateGameClick={handleSpectateGame}
              isJoiningLobby={isJoiningLobby}
              showSpectateOnly={true}
              onBackClick={() => {
                setInLobby(true);
              }}
            />
          )
        )}
      </main>
    </div>
  );
}

export default App;
