// client/vite-project/src/components/Chessboard.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
// Import CSS
import './Chessboard.css';

// Custom board styles
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
 * Chess board component using react-chessboard
 *
 * @param {Object} props - Component props
 * @param {string} props.initialFen - Initial FEN string for the board
 * @param {string} props.playerColor - Player's color ('white', 'black', or 'spectator')
 * @param {Function} props.onMove - Callback function when a move is made (uciMove) => void
 * @param {boolean} props.isMyTurn - Whether it's the player's turn
 * @param {string} props.lastMove - Last move in UCI notation (e.g., 'e2e4')
 */
const ChessboardComponent = ({ initialFen, playerColor, onMove, isMyTurn, lastMove }) => {
  console.log('ChessboardComponent rendering with props:', { initialFen, playerColor, isMyTurn, lastMove });

  // Use a ref to track the current FEN to avoid unnecessary re-renders
  const currentFenRef = useRef(initialFen);

  // Initialize chess.js instance
  const [game, setGame] = useState(() => {
    const newGame = new Chess(initialFen === 'start' ? undefined : initialFen);
    console.log('Initial game state:', {
      fen: newGame.fen(),
      turn: newGame.turn() === true ? 'white' : 'black'
    });
    return newGame;
  });

  // State for highlighted squares (for last move)
  const [highlightedSquares, setHighlightedSquares] = useState({});

  // Function to update highlighted squares based on lastMove
  const updateHighlightedSquares = useCallback((move) => {
    if (!move || move.length < 4) {
      setHighlightedSquares({});
      return;
    }

    // Extract source and target squares from UCI notation
    const sourceSquare = move.substring(0, 2);
    const targetSquare = move.substring(2, 4);

    console.log(`Highlighting squares: ${sourceSquare} -> ${targetSquare}`);

    // Check if this was a capture move
    let wasCapture = false;
    try {
      // Get the previous position before the move
      const prevGame = new Chess(currentFenRef.current);

      // Check if there was a piece on the target square
      const targetPiece = prevGame.get(targetSquare);
      wasCapture = targetPiece !== null;

      if (wasCapture) {
        console.log(`Capture detected: ${sourceSquare} captured piece on ${targetSquare}`);

        // Play capture sound
        try {
          const captureSound = new Audio('/capture.mp3');
          captureSound.volume = 0.3;
          captureSound.play().catch(e => console.log('Audio play failed:', e));
        } catch (e) {
          console.log('Audio not supported:', e);
        }
      }
    } catch (error) {
      console.log('Error checking for capture:', error);
    }

    // Create highlighted squares object with different colors for captures
    const newHighlightedSquares = {
      [sourceSquare]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
      [targetSquare]: {
        backgroundColor: wasCapture ? 'rgba(255, 100, 100, 0.5)' : 'rgba(255, 255, 0, 0.4)',
        animation: wasCapture ? 'captureGlow 1s ease-in-out' : 'none'
      }
    };

    setHighlightedSquares(newHighlightedSquares);
  }, []);

  // Update the game when initialFen changes
  useEffect(() => {
    // Only update if the FEN has actually changed
    if (initialFen !== currentFenRef.current) {
      console.log('=== FEN CHANGE DETECTED ===');
      console.log('New FEN:', initialFen);
      console.log('Previous FEN:', currentFenRef.current);
      console.log('Current turn state:', { isMyTurn, playerColor });

      try {
        // Create a new Chess instance with the server's FEN
        const newGame = new Chess(initialFen === 'start' ? undefined : initialFen);

        // Get the turn from the new game state
        const chessTurn = newGame.turn() === 'w' ? 'white' : 'black';

        console.log('New game state from FEN:', {
          fen: newGame.fen(),
          turn: chessTurn,
          isCheck: newGame.isCheck(),
          isCheckmate: newGame.isCheckmate(),
          moves: newGame.moves().length
        });

        console.log('Turn information:', {
          'Chess.js turn': chessTurn,
          'Component isMyTurn': isMyTurn,
          'Component playerColor': playerColor,
          'Should be my turn': chessTurn === playerColor
        });

        // Update the game state with the server's FEN
        setGame(newGame);

        // Update the current FEN ref
        currentFenRef.current = initialFen;

        // Update highlighted squares for the last move
        updateHighlightedSquares(lastMove);
      } catch (error) {
        console.error('Invalid FEN string:', initialFen, error);
      }
    } else if (lastMove) {
      // If only the lastMove changed, just update the highlights
      console.log('Last move changed, updating highlights:', lastMove);
      updateHighlightedSquares(lastMove);
    }
  }, [initialFen, lastMove, updateHighlightedSquares, isMyTurn, playerColor]);

  // Handle piece drop
  const onDrop = (sourceSquare, targetSquare, piece) => {
    console.log('=== PIECE DROP ATTEMPT ===');
    console.log('Move details:', { sourceSquare, targetSquare, piece });
    console.log('Current turn state:', { isMyTurn, playerColor });
    console.log('Current game state:', {
      fen: game.fen(),
      turn: game.turn() === 'w' ? 'white' : 'black',
      isCheck: game.isCheck(),
      isCheckmate: game.isCheckmate()
    });

    // Check if it's the player's turn and they're not a spectator
    if (!isMyTurn || playerColor === 'spectator') {
      console.log('Move rejected: Not player\'s turn or spectator', { isMyTurn, playerColor });
      console.log('Chess.js turn:', game.turn() === 'w' ? 'white' : 'black');
      return false;
    }

    // Check if the piece color matches the player's color
    const pieceColor = piece[0].toLowerCase();
    const isCorrectColor = (pieceColor === 'w' && playerColor === 'white') ||
                          (pieceColor === 'b' && playerColor === 'black');

    if (!isCorrectColor) {
      console.log('Move rejected: Piece color does not match player color', {
        pieceColor,
        playerColor
      });
      return false;
    }

    // Check if the chess.js turn matches the player's color
    const chessTurn = game.turn() === 'w' ? 'white' : 'black';
    if (chessTurn !== playerColor) {
      console.log('WARNING: Chess.js turn does not match player color!', {
        'Chess.js turn': chessTurn,
        'Player color': playerColor
      });
      // Continue anyway for testing purposes
    }

    try {
      // Check if this is a pawn promotion
      const isPawnPromotion =
        (piece === 'wP' && targetSquare[1] === '8') ||
        (piece === 'bP' && targetSquare[1] === '1');

      // Create the move object
      const moveObj = {
        from: sourceSquare,
        to: targetSquare,
        promotion: isPawnPromotion ? 'q' : undefined // Always promote to queen
      };

      // Create a temporary game to check if the move is legal
      // This avoids modifying the actual game state until we're sure
      const tempGame = new Chess(game.fen());
      const move = tempGame.move(moveObj);

      if (move) {
        console.log('Move is legal:', move);

        // Convert to UCI notation
        let uciMove = `${sourceSquare}${targetSquare}`;
        if (isPawnPromotion) {
          uciMove += 'q';
        }

        console.log('Sending UCI move to server:', uciMove);

        // Call the onMove callback to send the move to the server
        if (typeof onMove === 'function') {
          // Apply the move to the local game state for immediate visual feedback
          game.move(moveObj);

          // Send the move to the server
          onMove(uciMove);

          console.log('Move applied locally and sent to server');
          return true;
        } else {
          console.error('onMove callback is not defined!');
          return false;
        }
      } else {
        console.log('Move is illegal according to chess.js');
        return false;
      }
    } catch (error) {
      console.error('Error processing move:', error);
      return false;
    }
  };

  // Get the selected board style from localStorage or use classic as default
  const [selectedBoardStyle, setSelectedBoardStyle] = useState('classic');

  // Load the board style from localStorage
  useEffect(() => {
    const savedBoardStyle = localStorage.getItem('chess_board_style');
    if (savedBoardStyle && boardStyles[savedBoardStyle]) {
      setSelectedBoardStyle(savedBoardStyle);
    }
  }, []);

  // Get the board style properties
  const boardStyle = boardStyles[selectedBoardStyle] || boardStyles.classic;

  // Minimal inline styles to avoid interfering with the original piece icons
  const containerStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    margin: '-10px 0 5px 0' // Negative top margin to pull board up
  };

  return (
    <div className="chessboard-container" style={containerStyle}>
      <Chessboard
        id="chessboard"
        position={game.fen()}
        onPieceDrop={onDrop}
        boardOrientation={playerColor === 'black' ? 'black' : 'white'}
        customSquareStyles={{
          ...highlightedSquares,
          ...boardStyle
        }}
        customLightSquareStyle={boardStyle.lightSquareStyle}
        customDarkSquareStyle={boardStyle.darkSquareStyle}
        isDraggablePiece={({ piece }) => {
          // Log the draggable check for debugging
          console.log('isDraggablePiece check:', { piece, isMyTurn, playerColor });

          // If there's no piece or player is spectating, can't drag
          if (!piece || playerColor === 'spectator') return false;

          // Get the piece color (w for white, b for black)
          const pieceColor = piece[0].toLowerCase();

          // Check if it's the player's piece
          const isPlayersPiece = (pieceColor === 'w' && playerColor === 'white') ||
                                (pieceColor === 'b' && playerColor === 'black');

          // Allow dragging if it's the player's piece and it's their turn
          const canDrag = isPlayersPiece && isMyTurn;

          // Log the result for debugging
          console.log(`Can drag ${piece}? ${canDrag} (isPlayersPiece: ${isPlayersPiece}, isMyTurn: ${isMyTurn})`);

          return canDrag;
        }}
      />
    </div>
  );
};

export default ChessboardComponent;
