# server/chess_game.py
import chess
import asyncio

class ChessGame:
    def __init__(self, time_control_seconds=300):
        self.board = chess.Board()
        self.players = {'white': None, 'black': None}  # To store player identifiers
        self.player_colors = {}  # To map player_id to chess.WHITE or chess.BLACK
        self.time_control_seconds = time_control_seconds

        # Initialize all time variables to the exact same value
        # This ensures all time values are consistent at the start of the game
        self.time_white = time_control_seconds
        self.time_black = time_control_seconds
        self.time_at_last_move_white = time_control_seconds
        self.time_at_last_move_black = time_control_seconds

        # IMPORTANT FIX: Add new variables for exact time tracking
        # These will be used to ensure precise time calculations
        self.exact_time_white_at_move = time_control_seconds
        self.exact_time_black_at_move = time_control_seconds
        self.exact_move_timestamp = None

        # CRITICAL FIX: Add new variables to store the exact time values for each player
        # These will be used to ensure the timer continues from where it left off
        self.stored_white_time = time_control_seconds
        self.stored_black_time = time_control_seconds
        self.last_white_move_time = None
        self.last_black_move_time = None

        self.last_move_timestamp = None
        self._timed_out_player = None

        # Track if the last move was a capture and what piece was captured
        self.last_move_was_capture = False
        self.captured_piece = None

        print(f"Game initialized with time control: {time_control_seconds}s")
        print(f"Initial time values - White: {self.time_white:.1f}s, Black: {self.time_black:.1f}s")
        print(f"Initial time_at_last_move values - White: {self.time_at_last_move_white:.1f}s, Black: {self.time_at_last_move_black:.1f}s")
        print(f"Initial stored time values - White: {self.stored_white_time:.1f}s, Black: {self.stored_black_time:.1f}s")

    def assign_player(self, player_id, color_preference=None):
        """
        Assigns player_id to an available color ('white' or 'black').
        If color_preference is given and available, use it.
        Returns the assigned chess.COLOR or None if no spot available.
        """
        if self.players['white'] is None and (color_preference == 'white' or color_preference is None):
            self.players['white'] = player_id
            self.player_colors[player_id] = chess.WHITE
            return chess.WHITE
        elif self.players['black'] is None and (color_preference == 'black' or color_preference is None):
            self.players['black'] = player_id
            self.player_colors[player_id] = chess.BLACK
            return chess.BLACK
        return None  # Both spots taken or preference not met

    def get_player_color(self, player_id):
        """Return chess.WHITE or chess.BLACK for the player_id."""
        return self.player_colors.get(player_id)

    def make_move(self, uci_move_string, player_id):
        """
        Makes a move if it's legal and the player's turn.
        Returns True if move is made, False otherwise.
        """
        if self.is_game_over():
            print(f"Move rejected: Game is already over")
            return False

        expected_color = self.get_player_color(player_id)

        # Debug information to help diagnose turn issues
        print(f"MOVE ATTEMPT - Player ID: {player_id}, Expected color: {expected_color}, Current turn: {self.board.turn}")
        print(f"Player colors map: {self.player_colors}")
        print(f"Players dict: {self.players}")

        # Check if player is in the game
        if expected_color is None:
            print(f"Move rejected: Player {player_id} is not in this game")
            return False

        # Check if it's the player's turn
        if self.board.turn != expected_color:
            print(f"Move rejected: Not {player_id}'s turn")
            print(f"Current turn: {'WHITE' if self.board.turn else 'BLACK'}, Player color: {'WHITE' if expected_color else 'BLACK'}")
            return False

        # Store the current turn before making the move
        current_turn = self.board.turn

        # Get the current time
        current_time = asyncio.get_event_loop().time()

        try:
            # Parse and validate the move
            move = chess.Move.from_uci(uci_move_string)
            if move not in self.board.legal_moves:
                print(f"Illegal move: {uci_move_string}")
                return False

            # Calculate and store the current player's time
            if self.last_move_timestamp is not None:
                # Calculate time taken for this move
                time_taken = current_time - self.last_move_timestamp
                print(f"Time taken for this move: {time_taken:.2f}s")

                # Store the current time values before making the move
                if current_turn == chess.WHITE:
                    # Store white's current time
                    self.time_at_last_move_white = self.time_white
                    print(f"Stored white's time: {self.time_at_last_move_white:.2f}s")
                else:
                    # Store black's current time
                    self.time_at_last_move_black = self.time_black
                    print(f"Stored black's time: {self.time_at_last_move_black:.2f}s")
            else:
                print("First move of the game, no time taken")

            # Check if this move is a capture
            is_capture = self.board.is_capture(move)
            captured_piece_type = None

            if is_capture:
                # Get the destination square
                to_square = move.to_square

                # Check if it's an en passant capture
                if self.board.is_en_passant(move):
                    # For en passant, the captured pawn is on a different square
                    # It's on the same file as the destination but on the same rank as the origin
                    from_square = move.from_square
                    from_rank = chess.square_rank(from_square)
                    to_file = chess.square_file(to_square)
                    captured_square = chess.square(to_file, from_rank)
                    captured_piece = self.board.piece_at(captured_square)
                    captured_piece_type = captured_piece.piece_type if captured_piece else None
                else:
                    # For normal captures, the captured piece is on the destination square
                    captured_piece = self.board.piece_at(to_square)
                    captured_piece_type = captured_piece.piece_type if captured_piece else None

                print(f"Capture detected! Piece captured: {captured_piece_type}")

            # Make the move
            self.board.push(move)

            # Store capture information
            self.last_move_was_capture = is_capture
            self.captured_piece = captured_piece_type

            # Update the timestamp for the next move
            self.last_move_timestamp = current_time

            print(f"Move made: {uci_move_string}")
            print(f"Turn changed to: {self.get_turn_color_string()}")
            print(f"Current times - White: {self.time_white:.2f}s, Black: {self.time_black:.2f}s")
            if is_capture:
                print(f"This move was a capture. Captured piece: {captured_piece_type}")

            return True
        except ValueError:
            print(f"Invalid UCI move string: {uci_move_string}")
            return False

    def get_board_fen(self):
        """Return the FEN string representing the board state."""
        return self.board.fen()

    def get_turn_color_string(self):
        """Return 'white' or 'black' based on self.board.turn."""
        # CRITICAL FIX: Ensure we're using the correct constants for comparison
        # chess.WHITE is True, chess.BLACK is False
        if self.board.turn == chess.WHITE:
            turn_string = "white"
        else:
            turn_string = "black"

        print(f"get_turn_color_string called - Raw board.turn: {self.board.turn}, Returning: {turn_string}")
        print(f"  chess.WHITE = {chess.WHITE}, chess.BLACK = {chess.BLACK}")
        print(f"  board.turn type: {type(self.board.turn)}")
        return turn_string

    # Game Status Methods
    def is_checkmate(self):
        return self.board.is_checkmate()

    def is_stalemate(self):
        return self.board.is_stalemate()

    def is_insufficient_material(self):
        return self.board.is_insufficient_material()

    def is_seventyfive_moves(self):
        return self.board.is_seventyfive_moves()

    def is_fivefold_repetition(self):
        return self.board.is_fivefold_repetition()

    # Time tracking is now handled in the timer loop in game_session.py

    def check_timeout(self):
        """
        Check if the current player has timed out.
        Returns the color of the timed out player or None.

        Includes a small buffer (0.1s) to account for network latency and processing time.
        """
        if self.board.is_game_over() or self.last_move_timestamp is None:
            return None

        # Use a small buffer to avoid false timeouts due to network latency
        buffer_time = 0.1  # 100ms buffer

        # Check if the current player's time has run out
        if self.board.turn == chess.WHITE:
            # Check white's time with buffer
            if self.time_white <= -buffer_time:  # Allow a small negative buffer
                self._timed_out_player = chess.WHITE
                print(f"WHITE player has timed out! Final time: {self.time_white:.2f}s")
                # Set time to exactly 0 for display purposes
                self.time_white = 0
                return self._timed_out_player
            elif self.time_white <= 5:
                # Log when time is getting low
                print(f"WHITE player time is low: {self.time_white:.2f}s")
        else:
            # Check black's time with buffer
            if self.time_black <= -buffer_time:  # Allow a small negative buffer
                self._timed_out_player = chess.BLACK
                print(f"BLACK player has timed out! Final time: {self.time_black:.2f}s")
                # Set time to exactly 0 for display purposes
                self.time_black = 0
                return self._timed_out_player
            elif self.time_black <= 5:
                # Log when time is getting low
                print(f"BLACK player time is low: {self.time_black:.2f}s")

        return None

    def get_game_result(self):
        """
        Return the game result as a dictionary.
        Returns None if the game is not over.
        """
        # Check for timeout first
        if self._timed_out_player is not None:
            # CRITICAL FIX: Check for insufficient material when timeout occurs
            # If the opponent doesn't have enough material to checkmate, it's a draw
            opponent_color = chess.BLACK if self._timed_out_player == chess.WHITE else chess.WHITE

            # Check if the opponent has insufficient material to checkmate
            if self._has_insufficient_mating_material(opponent_color):
                print(f"Timeout occurred but opponent has insufficient mating material - declaring draw")
                return {"outcome": "draw_insufficient_material_timeout",
                        "timed_out_player": "white" if self._timed_out_player == chess.WHITE else "black"}

            # Otherwise, the opponent wins by timeout
            winner = "black" if self._timed_out_player == chess.WHITE else "white"
            return {"outcome": "timeout", "winner": winner}

        # Check for checkmate
        if self.board.is_checkmate():
            winner = "black" if self.board.turn == chess.WHITE else "white"
            return {"outcome": "checkmate", "winner": winner}

        # Check for draws
        if self.board.is_stalemate():
            return {"outcome": "stalemate"}
        if self.board.is_insufficient_material():
            return {"outcome": "draw_insufficient_material"}
        if self.board.is_seventyfive_moves():
            return {"outcome": "draw_seventyfive_moves"}
        if self.board.is_fivefold_repetition():
            return {"outcome": "draw_fivefold_repetition"}

        return None  # Game not over

    def _has_insufficient_mating_material(self, color):
        """
        Check if a player has insufficient material to deliver checkmate.

        Args:
            color: The color to check (chess.WHITE or chess.BLACK)

        Returns:
            bool: True if the player has insufficient material to checkmate
        """
        # Get all pieces of the given color
        pieces = self.board.pieces(chess.PAWN, color) | \
                 self.board.pieces(chess.KNIGHT, color) | \
                 self.board.pieces(chess.BISHOP, color) | \
                 self.board.pieces(chess.ROOK, color) | \
                 self.board.pieces(chess.QUEEN, color)

        # Count pieces by type
        num_pieces = len(pieces)
        num_pawns = len(self.board.pieces(chess.PAWN, color))
        num_knights = len(self.board.pieces(chess.KNIGHT, color))
        num_bishops = len(self.board.pieces(chess.BISHOP, color))
        num_rooks = len(self.board.pieces(chess.ROOK, color))
        num_queens = len(self.board.pieces(chess.QUEEN, color))

        # If there are no pieces other than the king, it's insufficient material
        if num_pieces == 0:
            return True

        # If there are pawns, rooks, or queens, it's sufficient material
        if num_pawns > 0 or num_rooks > 0 or num_queens > 0:
            return False

        # If there's only one knight or one bishop, it's insufficient material
        if num_pieces == 1 and (num_knights == 1 or num_bishops == 1):
            return True

        # Otherwise, it's sufficient material
        return False

    def is_game_over(self):
        """Return True if the game is over for any reason."""
        return self.board.is_game_over() or self._timed_out_player is not None

    def reset_game(self):
        """Reset the game to its initial state."""
        self.board.reset()
        self.players = {'white': None, 'black': None}
        self.player_colors = {}

        # Reset all time variables to the initial time control value
        # This ensures all time values are consistent at the start of the game
        initial_time = self.time_control_seconds
        self.time_white = initial_time
        self.time_black = initial_time
        self.time_at_last_move_white = initial_time
        self.time_at_last_move_black = initial_time

        # IMPORTANT FIX: Reset the exact time tracking variables
        self.exact_time_white_at_move = initial_time
        self.exact_time_black_at_move = initial_time
        self.exact_move_timestamp = None

        # CRITICAL FIX: Reset the stored time values
        self.stored_white_time = initial_time
        self.stored_black_time = initial_time
        self.last_white_move_time = None
        self.last_black_move_time = None

        self.last_move_timestamp = None
        self._timed_out_player = None

        # Reset capture tracking
        self.last_move_was_capture = False
        self.captured_piece = None

        print(f"Game reset with time control: {initial_time}s")
        print(f"Initial time values - White: {self.time_white:.1f}s, Black: {self.time_black:.1f}s")
        print(f"Initial time_at_last_move values - White: {self.time_at_last_move_white:.1f}s, Black: {self.time_at_last_move_black:.1f}s")
        print(f"Initial stored time values - White: {self.stored_white_time:.1f}s, Black: {self.stored_black_time:.1f}s")