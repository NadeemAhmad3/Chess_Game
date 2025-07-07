import React, { useState, useEffect, useRef } from 'react';
import './CapturedPieces.css';
import { playCaptureSound } from '../utils/soundEffects';

/**
 * Component to display captured pieces with enhanced visualization
 *
 * @param {Object} props - Component props
 * @param {string} props.fen - Current FEN string
 * @param {string} props.playerColor - Player's color ('white', 'black', or 'spectator')
 */
const CapturedPieces = ({ fen, playerColor }) => {
  const [capturedWhitePieces, setCapturedWhitePieces] = useState([]);
  const [capturedBlackPieces, setCapturedBlackPieces] = useState([]);
  const [newlyCaptures, setNewlyCaptures] = useState([]); // Track newly captured pieces
  const [previousFen, setPreviousFen] = useState('');
  const prevWhitePiecesRef = useRef([]);
  const prevBlackPiecesRef = useRef([]);

  // Calculate captured pieces based on FEN
  useEffect(() => {
    // Skip initial render or when FEN is 'start'
    if (!fen || fen === 'start' || fen === previousFen) {
      return;
    }

    // Standard starting piece counts
    const standardPieces = {
      'p': 8, 'n': 2, 'b': 2, 'r': 2, 'q': 1, 'k': 1,
      'P': 8, 'N': 2, 'B': 2, 'R': 2, 'Q': 1, 'K': 1
    };

    // Count pieces in current position
    const currentPieces = {
      'p': 0, 'n': 0, 'b': 0, 'r': 0, 'q': 0, 'k': 0,
      'P': 0, 'N': 0, 'B': 0, 'R': 0, 'Q': 0, 'K': 0
    };

    // Extract the piece placement part of the FEN
    const piecePlacement = fen.split(' ')[0];

    // Count pieces in the current position
    for (const char of piecePlacement) {
      if (currentPieces.hasOwnProperty(char)) {
        currentPieces[char]++;
      }
    }

    // Calculate captured pieces
    const capturedWhite = [];
    const capturedBlack = [];
    const newCaptures = []; // To track newly captured pieces

    // White pieces captured by black
    for (const piece of ['P', 'N', 'B', 'R', 'Q']) {
      const count = standardPieces[piece] - currentPieces[piece];
      for (let i = 0; i < count; i++) {
        capturedWhite.push(piece);

        // Check if this is a newly captured piece
        if (capturedWhite.length > prevWhitePiecesRef.current.length) {
          // Only mark as new if this is a new capture
          if (i >= prevWhitePiecesRef.current.length) {
            newCaptures.push(`white-${piece}-${i}`);
          }
        }
      }
    }

    // Black pieces captured by white
    for (const piece of ['p', 'n', 'b', 'r', 'q']) {
      const count = standardPieces[piece] - currentPieces[piece];
      for (let i = 0; i < count; i++) {
        capturedBlack.push(piece);

        // Check if this is a newly captured piece
        if (capturedBlack.length > prevBlackPiecesRef.current.length) {
          // Only mark as new if this is a new capture
          if (i >= prevBlackPiecesRef.current.length) {
            newCaptures.push(`black-${piece}-${i}`);
          }
        }
      }
    }

    // Sort pieces by value (pawn, knight/bishop, rook, queen)
    const pieceValue = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9 };

    capturedWhite.sort((a, b) => pieceValue[a] - pieceValue[b]);
    capturedBlack.sort((a, b) => pieceValue[a] - pieceValue[b]);

    // Update state
    setCapturedWhitePieces(capturedWhite);
    setCapturedBlackPieces(capturedBlack);
    setNewlyCaptures(newCaptures);
    setPreviousFen(fen);

    // Update refs for next comparison
    prevWhitePiecesRef.current = capturedWhite;
    prevBlackPiecesRef.current = capturedBlack;

    // Clear the newly captured pieces after animation time
    if (newCaptures.length > 0) {
      setTimeout(() => {
        setNewlyCaptures([]);
      }, 1500); // Animation duration + a little extra
    }

    // Play capture sound if a piece was captured
    if (newCaptures.length > 0) {
      try {
        // Get the piece type from the newly captured piece
        const capturedPieceInfo = newCaptures[0].split('-');
        const pieceType = capturedPieceInfo[1];

        // Map piece letter to piece type number
        // Chess.js piece types: 1=pawn, 2=knight, 3=bishop, 4=rook, 5=queen, 6=king
        const pieceTypeMap = {
          'p': 1, 'P': 1, // pawn
          'n': 2, 'N': 2, // knight
          'b': 3, 'B': 3, // bishop
          'r': 4, 'R': 4, // rook
          'q': 5, 'Q': 5, // queen
          'k': 6, 'K': 6  // king
        };

        // Use the sound effect utility with the piece type
        if (typeof window.playCaptureSound === 'function') {
          window.playCaptureSound(pieceTypeMap[pieceType]);

          // Force a user interaction to help with autoplay policies
          document.body.click();
        }

        // Log the capture for debugging
        console.log('Piece captured:', newCaptures, 'Piece type:', pieceType, 'Type number:', pieceTypeMap[pieceType]);
      } catch (e) {
        console.log('Sound effect error:', e);

        // Fallback to basic capture sound
        try {
          playCaptureSound();
        } catch (err) {
          console.log('Fallback sound failed:', err);
        }
      }
    }

  }, [fen, previousFen]);

  // Map piece letter to Unicode chess piece
  const getPieceSymbol = (piece) => {
    const pieceMap = {
      'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚',
      'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔'
    };
    return pieceMap[piece] || piece;
  };

  // Get piece name for aria-label and title
  const getPieceName = (piece) => {
    const pieceNames = {
      'p': 'Black Pawn', 'n': 'Black Knight', 'b': 'Black Bishop', 'r': 'Black Rook', 'q': 'Black Queen', 'k': 'Black King',
      'P': 'White Pawn', 'N': 'White Knight', 'B': 'White Bishop', 'R': 'White Rook', 'Q': 'White Queen', 'K': 'White King'
    };
    return pieceNames[piece] || 'Chess Piece';
  };

  // Determine which pieces to show at the top and bottom based on player color
  // If player is white: top shows black pieces (captured by player), bottom shows white pieces (captured by opponent)
  // If player is black: top shows white pieces (captured by player), bottom shows black pieces (captured by opponent)
  const topPieces = playerColor === 'white' ? capturedBlackPieces : capturedWhitePieces;
  const bottomPieces = playerColor === 'white' ? capturedWhitePieces : capturedBlackPieces;

  // Determine the labels for the captured pieces sections
  const topLabel = 'Captured';
  const bottomLabel = 'Lost';

  return (
    <div className="captured-pieces-container">
      <div className="captured-pieces-section">
        <div className="captured-pieces-label">{topLabel}</div>
        <div className="captured-pieces top">
          {topPieces.map((piece, index) => {
            const pieceId = `${piece.toLowerCase() === piece ? 'black' : 'white'}-${piece}-${index}`;
            const isNew = newlyCaptures.includes(pieceId);

            return (
              <div
                key={`top-${index}`}
                className={`captured-piece ${piece.toLowerCase() === piece ? 'black' : 'white'} ${isNew ? 'new' : ''}`}
                title={getPieceName(piece)}
                aria-label={getPieceName(piece)}
              >
                {getPieceSymbol(piece)}
              </div>
            );
          })}
          {topPieces.length === 0 && (
            <div className="no-captures">No pieces captured yet</div>
          )}
        </div>
      </div>

      <div className="captured-pieces-section">
        <div className="captured-pieces-label">{bottomLabel}</div>
        <div className="captured-pieces bottom">
          {bottomPieces.map((piece, index) => {
            const pieceId = `${piece.toLowerCase() === piece ? 'black' : 'white'}-${piece}-${index}`;
            const isNew = newlyCaptures.includes(pieceId);

            return (
              <div
                key={`bottom-${index}`}
                className={`captured-piece ${piece.toLowerCase() === piece ? 'black' : 'white'} ${isNew ? 'new' : ''}`}
                title={getPieceName(piece)}
                aria-label={getPieceName(piece)}
              >
                {getPieceSymbol(piece)}
              </div>
            );
          })}
          {bottomPieces.length === 0 && (
            <div className="no-captures">No pieces captured yet</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CapturedPieces;
