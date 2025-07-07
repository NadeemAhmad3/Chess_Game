// client_react/src/Lobby.jsx
import React, { useState, useEffect } from 'react';
import ChessboardSelector from './ChessboardSelector';
import './Lobby.css';

/**
 * Lobby component for the chess application
 *
 * @param {Object} props - Component props
 * @param {string} props.lobbyStatus - Status message to display in the lobby
 * @param {Array} props.activeGames - List of active games
 * @param {Function} props.onJoinQueueClick - Callback when Join Game Queue button is clicked
 * @param {Function} props.onSpectateGameClick - Callback when Spectate button is clicked (gameId) => void
 * @param {Function} props.onRefreshGamesClick - Callback when Refresh Games List button is clicked
 * @param {boolean} props.isJoiningLobby - Whether the client is currently joining the lobby
 * @param {boolean} props.showSpectateOnly - Whether to show only spectate options
 * @param {Function} props.onBackClick - Callback when Back button is clicked
 */
const Lobby = ({
  lobbyStatus,
  activeGames,
  onJoinQueueClick,
  onSpectateGameClick,
  onRefreshGamesClick,
  isJoiningLobby = false,
  showSpectateOnly = false,
  onBackClick
}) => {
  // State for the username input
  const [username, setUsername] = useState('');
  // State for the selected board style
  const [selectedBoard, setSelectedBoard] = useState('classic');
  // State for the current step in the flow
  const [currentStep, setCurrentStep] = useState('username'); // 'username', 'board', 'lobby'

  // Load username and board style from localStorage on component mount
  useEffect(() => {
    const savedUsername = localStorage.getItem('chess_username');
    if (savedUsername) {
      setUsername(savedUsername);
    }

    const savedBoard = localStorage.getItem('chess_board_style');
    if (savedBoard) {
      setSelectedBoard(savedBoard);
    }
  }, []);

  // Handle username change
  const handleUsernameChange = (e) => {
    const newUsername = e.target.value;
    setUsername(newUsername);
    localStorage.setItem('chess_username', newUsername);
  };

  // Handle username submission
  const handleUsernameSubmit = () => {
    if (username.trim()) {
      localStorage.setItem('chess_username', username.trim());
      setCurrentStep('board');
    }
  };

  // Handle board selection
  const handleBoardSelect = (boardId) => {
    setSelectedBoard(boardId);
    localStorage.setItem('chess_board_style', boardId);
  };

  // Handle board selection continue
  const handleBoardContinue = () => {
    setCurrentStep('lobby');
  };

  // Handle join queue with username and board style
  const handleJoinQueue = () => {
    // Call the original join queue function
    onJoinQueueClick();
  };

  return (
    <div className="lobby-container">
      <h2>{showSpectateOnly ? 'Spectate Games' : 'Chess Game Lobby'}</h2>

      {/* Status message */}
      {lobbyStatus && (
        <div className="lobby-status">
          <p>{lobbyStatus}</p>
        </div>
      )}

      {showSpectateOnly ? (
        // Spectate-only mode
        <div className="spectate-mode">
          {/* Back button */}
          <button
            className="back-button"
            onClick={onBackClick}
          >
            Back to Main Menu
          </button>

          {/* Refresh games button */}
          <button
            className="refresh-games-btn"
            onClick={onRefreshGamesClick}
          >
            Refresh Games List
          </button>
        </div>
      ) : (
        // Regular lobby mode with steps
        <>
          {currentStep === 'username' && (
            <div className="username-step">
              {/* Username input */}
              <div className="username-container">
                <label htmlFor="username">Your Name:</label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={handleUsernameChange}
                  placeholder="Enter your name"
                  className="username-input"
                />
              </div>

              <button
                className="continue-button"
                onClick={handleUsernameSubmit}
                disabled={!username.trim()}
              >
                Continue
              </button>
            </div>
          )}

          {currentStep === 'board' && (
            <ChessboardSelector
              onSelectBoard={handleBoardSelect}
              onContinue={handleBoardContinue}
            />
          )}

          {currentStep === 'lobby' && (
            <>
              {/* User info display */}
              <div className="user-info">
                <p>Playing as: <strong>{username}</strong></p>
                <p>Board style: <strong>{selectedBoard.charAt(0).toUpperCase() + selectedBoard.slice(1)}</strong></p>
              </div>

              {/* Action buttons */}
              <div className="lobby-actions">
                <button
                  className="join-queue-btn"
                  onClick={handleJoinQueue}
                  disabled={isJoiningLobby}
                >
                  {isJoiningLobby ? 'Joining...' : 'Join Game Queue'}
                </button>

                <button
                  className="refresh-games-btn"
                  onClick={onRefreshGamesClick}
                >
                  Refresh Games List
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Active games list */}
      <div className="active-games">
        <h3>Active Games</h3>

        {activeGames && activeGames.length > 0 ? (
          <ul className="games-list">
            {activeGames.map((game) => (
              <li key={game.id} className="game-item">
                <div className="game-info">
                  <span className="game-id">Game ID: {game.id.substring(0, 8)}...</span>
                  <span className="game-status">Status: {game.status}</span>
                  <span className="game-players">
                    Players: {game.players ? game.players.length : 0}
                  </span>
                </div>

                <button
                  className="spectate-btn"
                  onClick={() => onSpectateGameClick(game.id)}
                >
                  Spectate
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="no-games">No active games available</p>
        )}
      </div>
    </div>
  );
};

export default Lobby;
