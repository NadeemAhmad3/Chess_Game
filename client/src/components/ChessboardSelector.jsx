// client/vite-project/src/components/ChessboardSelector.jsx
import React, { useState, useEffect } from 'react';
import './ChessboardSelector.css';

// Chessboard styles with SVG previews
const boardStyles = [
  {
    id: 'classic',
    name: 'Classic',
    previewUrl: '/chessboards/classic.svg',
    description: 'Traditional wooden chess board with brown and cream squares'
  },
  {
    id: 'modern',
    name: 'Modern',
    previewUrl: '/chessboards/modern.svg',
    description: 'Clean, modern design with blue and white squares'
  },
  {
    id: 'tournament',
    name: 'Tournament',
    previewUrl: '/chessboards/tournament.svg',
    description: 'Green and white tournament style board'
  }
];

/**
 * ChessboardSelector component for selecting a chessboard style
 *
 * @param {Object} props - Component props
 * @param {Function} props.onSelectBoard - Callback when a board is selected (boardId) => void
 * @param {Function} props.onContinue - Callback when the user clicks continue
 */
const ChessboardSelector = ({ onSelectBoard, onContinue }) => {
  // State for the selected board
  const [selectedBoard, setSelectedBoard] = useState('classic');

  // Load selected board from localStorage on component mount
  useEffect(() => {
    const savedBoard = localStorage.getItem('chess_board_style');
    if (savedBoard) {
      setSelectedBoard(savedBoard);
    }
  }, []);

  // Handle board selection
  const handleBoardSelect = (boardId) => {
    setSelectedBoard(boardId);
    localStorage.setItem('chess_board_style', boardId);

    // Call the onSelectBoard callback
    if (onSelectBoard) {
      onSelectBoard(boardId);
    }
  };

  // Handle continue button click
  const handleContinue = () => {
    // Save the selected board to localStorage
    localStorage.setItem('chess_board_style', selectedBoard);

    // Call the onContinue callback
    if (onContinue) {
      onContinue(selectedBoard);
    }
  };

  return (
    <div className="chessboard-selector">
      <div className="board-options">
        {boardStyles.map((board) => (
          <div
            key={board.id}
            className={`board-option ${selectedBoard === board.id ? 'selected' : ''}`}
            onClick={() => handleBoardSelect(board.id)}
          >
            <div className="board-preview">
              <img
                src={board.previewUrl}
                alt={`${board.name} chessboard`}
                onError={(e) => {
                  // Fallback if image doesn't load
                  e.target.src = '/chessboards/fallback.png';
                }}
              />
            </div>
            <div className="board-info">
              <h4>{board.name}</h4>
              <p>{board.description}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        className="continue-button"
        onClick={handleContinue}
      >
        Continue with {boardStyles.find(b => b.id === selectedBoard)?.name} Board
      </button>
    </div>
  );
};

export default ChessboardSelector;
