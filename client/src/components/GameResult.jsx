// client/vite-project/src/components/GameResult.jsx
import { useEffect } from 'react';
import './GameResult.css';

// Helper function to format time
const formatTime = (seconds) => {
  if (seconds === undefined || seconds === null) return '00:00';

  // Ensure seconds is not negative
  seconds = Math.max(0, seconds);

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const GameResult = ({
  gameResult,
  playerColor,
  isSpectating,
  onBackToLobby,
  timeWhite,
  timeBlack
}) => {
  // Play sound effect when component mounts
  useEffect(() => {
    try {
      // Different sounds for different outcomes
      let soundUrl = '/notification.mp3'; // Default sound

      if (gameResult.outcome === 'checkmate') {
        if (gameResult.winner === playerColor) {
          soundUrl = '/win.mp3';
        } else {
          soundUrl = '/lose.mp3';
        }
      } else if (gameResult.outcome === 'timeout') {
        soundUrl = '/timeout.mp3';
      } else if (gameResult.outcome === 'opponent_disconnected' || gameResult.outcome === 'disconnection') {
        // Always play win sound for disconnection
        soundUrl = '/win.mp3';
      } else if (gameResult.outcome === 'stalemate' ||
                gameResult.outcome === 'draw_insufficient_material' ||
                gameResult.outcome === 'draw_seventyfive_moves' ||
                gameResult.outcome === 'draw_fivefold_repetition') {
        soundUrl = '/draw.mp3';
      }

      // Try to play the sound
      const audio = new Audio(soundUrl);
      audio.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) {
      console.log('Audio not supported:', e);
    }
  }, [gameResult, playerColor]);

  // Determine the result class based on the outcome
  const getResultClass = () => {
    const { outcome } = gameResult;

    if (outcome === 'checkmate') return 'checkmate';
    if (outcome === 'timeout') return 'timeout';
    if (outcome === 'disconnection' || outcome === 'opponent_disconnected') return 'disconnection';
    if (outcome === 'stalemate' ||
        outcome === 'draw_insufficient_material' ||
        outcome === 'draw_insufficient_material_timeout' ||
        outcome === 'draw_seventyfive_moves' ||
        outcome === 'draw_fivefold_repetition') {
      return 'draw';
    }

    return '';
  };

  // Get personalized message based on player perspective
  const getPlayerPerspective = () => {
    if (isSpectating) return null;

    const { outcome, winner } = gameResult;

    // For checkmate and timeout
    if ((outcome === 'checkmate' || outcome === 'timeout') && winner) {
      if (winner === playerColor) {
        return <div className="player-perspective win">You Won!</div>;
      } else {
        return <div className="player-perspective loss">You Lost</div>;
      }
    }

    // For draws
    if (outcome === 'stalemate' ||
        outcome === 'draw_insufficient_material' ||
        outcome === 'draw_insufficient_material_timeout' ||
        outcome === 'draw_seventyfive_moves' ||
        outcome === 'draw_fivefold_repetition') {
      return <div className="player-perspective draw">Game Drawn</div>;
    }

    // For disconnection
    if (outcome === 'disconnection' || outcome === 'opponent_disconnected') {
      // Always show "You Won" for the remaining player
      return <div className="player-perspective win">You Won by Forfeit</div>;
    }

    return null;
  };

  // Get detailed result message
  const getResultDetails = () => {
    const { outcome, winner, timedOutPlayer, message } = gameResult;

    switch (outcome) {
      case 'checkmate':
        return (
          <div className="result-details">
            <p>Result: <strong>Checkmate</strong></p>
            {winner && (
              <p>
                Winner: <span className="winner">{winner}</span>
              </p>
            )}
            <p className="game-end-message">
              {isSpectating
                ? `Game ended by checkmate.`
                : winner === playerColor
                  ? `You won by checkmate! Congratulations!`
                  : `Your opponent checkmated you. Better luck next time!`}
            </p>
          </div>
        );

      case 'timeout':
        return (
          <div className="result-details">
            <p>Result: <span className="timeout-result">Time Out</span></p>
            {timedOutPlayer && (
              <p>
                <span className="timed-out-player">{timedOutPlayer}</span> ran out of time
              </p>
            )}
            {winner && (
              <p>
                Winner: <span className="winner">{winner}</span>
              </p>
            )}
            <div className="timer-display">
              <div className="timer-item">
                <div className="timer-label">White</div>
                <div className={`timer-value ${timeWhite <= 0 ? 'zero' : ''}`}>
                  {formatTime(timeWhite)}
                </div>
              </div>
              <div className="timer-item">
                <div className="timer-label">Black</div>
                <div className={`timer-value ${timeBlack <= 0 ? 'zero' : ''}`}>
                  {formatTime(timeBlack)}
                </div>
              </div>
            </div>
            <p className="game-end-message">
              {isSpectating
                ? `Game ended due to timeout.`
                : timedOutPlayer === playerColor
                  ? `You ran out of time. Better luck next time!`
                  : `Your opponent ran out of time. You win!`}
            </p>
          </div>
        );

      case 'draw_insufficient_material_timeout':
        return (
          <div className="result-details">
            <p>Result: <span className="draw-reason">Draw by Insufficient Material</span></p>
            {timedOutPlayer && (
              <p>
                <span className="timed-out-player">{timedOutPlayer}</span> ran out of time, but the opponent has insufficient material to checkmate
              </p>
            )}
            <div className="timer-display">
              <div className="timer-item">
                <div className="timer-label">White</div>
                <div className={`timer-value ${timeWhite <= 0 ? 'zero' : ''}`}>
                  {formatTime(timeWhite)}
                </div>
              </div>
              <div className="timer-item">
                <div className="timer-label">Black</div>
                <div className={`timer-value ${timeBlack <= 0 ? 'zero' : ''}`}>
                  {formatTime(timeBlack)}
                </div>
              </div>
            </div>
            <p className="game-end-message">
              {isSpectating
                ? `Game drawn due to insufficient material despite timeout.`
                : timedOutPlayer === playerColor
                  ? `You ran out of time, but it's a draw because your opponent has insufficient material to checkmate.`
                  : `Your opponent ran out of time, but it's a draw because you have insufficient material to checkmate.`}
            </p>
          </div>
        );

      case 'stalemate':
        return (
          <div className="result-details">
            <p>Result: <span className="draw-reason">Draw by Stalemate</span></p>
            <p>Neither player can make a legal move, but the king is not in check.</p>
            <p className="game-end-message">
              Game ended in a draw. Neither player wins.
            </p>
          </div>
        );

      case 'draw_insufficient_material':
        return (
          <div className="result-details">
            <p>Result: <span className="draw-reason">Draw by Insufficient Material</span></p>
            <p>Neither player has enough pieces to deliver checkmate.</p>
            <p className="game-end-message">
              Game ended in a draw. Neither player has enough pieces to checkmate.
            </p>
          </div>
        );

      case 'draw_seventyfive_moves':
        return (
          <div className="result-details">
            <p>Result: <span className="draw-reason">Draw by 75-Move Rule</span></p>
            <p>75 moves have been made without a pawn move or capture.</p>
            <p className="game-end-message">
              Game ended in a draw due to the 75-move rule.
            </p>
          </div>
        );

      case 'draw_fivefold_repetition':
        return (
          <div className="result-details">
            <p>Result: <span className="draw-reason">Draw by Fivefold Repetition</span></p>
            <p>The same position has occurred five times.</p>
            <p className="game-end-message">
              Game ended in a draw due to the same position occurring five times.
            </p>
          </div>
        );

      case 'disconnection':
      case 'opponent_disconnected':
        return (
          <div className="result-details">
            <p className="disconnection">
              Result: Opponent Disconnected
            </p>
            {winner && (
              <p>
                Winner: <span className="winner">{winner}</span> (by default)
              </p>
            )}
            <p>{message || "Your opponent has left the game."}</p>
            <p className="game-end-message">
              {isSpectating
                ? "Game ended because a player disconnected."
                : winner === playerColor
                  ? "Your opponent disconnected. You win by default!"
                  : "Your opponent has left the game. They forfeit and you win!"}
            </p>
          </div>
        );

      default:
        return (
          <div className="result-details">
            <p>Result: {outcome}</p>
            {winner && (
              <p>
                Winner: <span className="winner">{winner}</span>
              </p>
            )}
            <p className="game-end-message">
              Game has ended. {winner ? `${winner} wins!` : "No winner declared."}
            </p>
          </div>
        );
    }
  };

  return (
    <div className={`game-result ${getResultClass()}`}>
      <h3>Game Over</h3>

      {getPlayerPerspective()}

      {getResultDetails()}

      <div className="game-result-actions">
        <button
          className="back-to-lobby-btn"
          onClick={onBackToLobby}
          title="Back to Lobby"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default GameResult;
