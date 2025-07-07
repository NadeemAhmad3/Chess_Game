// client/vite-project/src/components/MainMenu.jsx
import React, { useState, useEffect } from 'react';
import ChessboardSelector from './ChessboardSelector';
import './MainMenu.css';

/**
 * MainMenu component for the chess application
 * Handles the initial game flow: Start/Spectate -> Username -> Board Selection -> Join Queue
 *
 * @param {Object} props - Component props
 * @param {Function} props.onStartGame - Callback when user completes the flow and joins queue
 * @param {Function} props.onSpectate - Callback when user wants to spectate games
 * @param {boolean} props.isJoiningGame - Whether the client is currently joining a game
 */
const MainMenu = ({ onStartGame, onSpectate, isJoiningGame = false }) => {
  // State for the current step in the flow
  const [currentStep, setCurrentStep] = useState('main'); // 'main', 'username', 'board', 'join'

  // State for the username input
  const [username, setUsername] = useState('');

  // State for the selected board style
  const [selectedBoard, setSelectedBoard] = useState('classic');

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

  // Handle Start Game button click
  const handleStartGame = () => {
    setCurrentStep('username');
  };

  // Handle Spectate button click
  const handleSpectate = () => {
    onSpectate();
  };

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
    // Automatically join the game queue after board selection
    // Call the onStartGame callback with username and board style
    onStartGame(username, selectedBoard);
  };

  // Handle back button
  const handleBack = () => {
    if (currentStep === 'username') {
      setCurrentStep('main');
    } else if (currentStep === 'board') {
      setCurrentStep('username');
    }
  };

  return (
    <div className="main-menu">
      <div className="menu-container">
        {currentStep === 'main' && (
          <div className="main-menu-options">
            <h1>Chess Master</h1>
            <div className="menu-buttons">
              <button
                className="start-game-btn"
                onClick={handleStartGame}
              >
                Start Game
              </button>
              <button
                className="spectate-btn"
                onClick={handleSpectate}
              >
                Spectate Games
              </button>
            </div>
          </div>
        )}

        {currentStep === 'username' && (
          <div className="username-step">
            <button
              className="back-button"
              onClick={handleBack}
            >
              Back
            </button>
            <h2>Enter Your Name</h2>
            <div className="username-container">
              <input
                type="text"
                value={username}
                onChange={handleUsernameChange}
                placeholder="Enter your name"
                className="username-input"
                autoFocus
              />
            </div>

            <div className="step-buttons">
              <button
                className="continue-button"
                onClick={handleUsernameSubmit}
                disabled={!username.trim()}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {currentStep === 'board' && (
          <div className="board-step">
            <h2>Select a Chessboard</h2>
            <ChessboardSelector
              onSelectBoard={handleBoardSelect}
              onContinue={handleBoardContinue}
            />
            <button
              className="back-button board-back-btn"
              onClick={handleBack}
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MainMenu;
