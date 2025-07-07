// client/vite-project/src/components/WaitingScreen.jsx
import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import './WaitingScreen.css';

// Custom board styles (same as in ChessboardComponent)
const boardStyles = {
  classic: {
    lightSquareStyle: { backgroundColor: '#ffce9e' },
    darkSquareStyle: { backgroundColor: '#d18b47' }
  },
  modern: {
    lightSquareStyle: { backgroundColor: '#d1d8e0' },
    darkSquareStyle: { backgroundColor: '#4b6584' }
  },
  tournament: {
    lightSquareStyle: { backgroundColor: '#efefef' },
    darkSquareStyle: { backgroundColor: '#58a846' }
  }
};

/**
 * WaitingScreen component that shows a chessboard while waiting for an opponent
 *
 * @param {Object} props - Component props
 * @param {string} props.username - The player's username
 * @param {string} props.boardStyle - The selected board style
 * @param {Function} props.onCancel - Callback when the user cancels waiting
 */
const WaitingScreen = ({ username, boardStyle = 'classic', onCancel }) => {
  // State for the waiting dots animation
  const [dots, setDots] = useState('');

  // State for the waiting time
  const [waitingTime, setWaitingTime] = useState(0);

  // State for board width based on window size
  const [boardWidth, setBoardWidth] = useState(300);

  // Get the board style properties
  const boardStyleProps = boardStyles[boardStyle] || boardStyles.classic;

  // Effect for the waiting dots animation
  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots(prev => {
        if (prev.length >= 3) return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(dotsInterval);
  }, []);

  // Effect for the waiting time counter
  useEffect(() => {
    const timeInterval = setInterval(() => {
      setWaitingTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timeInterval);
  }, []);

  // Effect for responsive board sizing
  useEffect(() => {
    // Function to update board width based on window size
    const updateBoardWidth = () => {
      if (window.innerWidth <= 360) {
        setBoardWidth(180);
      } else if (window.innerWidth <= 480) {
        setBoardWidth(220);
      } else if (window.innerWidth <= 576) {
        setBoardWidth(250);
      } else if (window.innerWidth <= 768) {
        setBoardWidth(280);
      } else {
        setBoardWidth(300);
      }
    };

    // Set initial width
    updateBoardWidth();

    // Add event listener for window resize
    window.addEventListener('resize', updateBoardWidth);

    // Clean up event listener
    return () => window.removeEventListener('resize', updateBoardWidth);
  }, []);

  // Format the waiting time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="waiting-screen">
      <div className="waiting-header">
        <h2>Waiting for an opponent{dots}</h2>
        <p className="waiting-info">
          <span className="username">Playing as: <strong>{username}</strong></span>
          <span className="board-style">Board: <strong>{boardStyle}</strong></span>
          <span className="waiting-time">Waiting time: <strong>{formatTime(waitingTime)}</strong></span>
        </p>
      </div>

      <div className="waiting-board-container">
        <Chessboard
          id="waiting-board"
          position="start"
          boardOrientation="white"
          customLightSquareStyle={boardStyleProps.lightSquareStyle}
          customDarkSquareStyle={boardStyleProps.darkSquareStyle}
          arePiecesDraggable={false}
          boardWidth={boardWidth}
        />
      </div>

      <div className="waiting-message">
        <p>Game starts when opponent is found</p>
        <button className="cancel-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default WaitingScreen;
