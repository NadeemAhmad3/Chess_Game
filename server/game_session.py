# server/game_session.py
import json
import asyncio
import time
import chess
from chess_game import ChessGame

class GameSession:
    def __init__(self, game_id, player1_ws, player2_ws, time_control_seconds=300):
        """
        Initialize a new game session with two players.

        Args:
            game_id: Unique identifier for this game session
            player1_ws: WebSocket connection for player 1 (white)
            player2_ws: WebSocket connection for player 2 (black)
            time_control_seconds: Time control in seconds (default: 300 seconds = 5 minutes)
        """
        self.game_id = game_id
        self.chess_game = ChessGame(time_control_seconds=time_control_seconds)
        self.clients = set()  # To store player WebSockets
        self.spectators = set()  # To store spectator WebSockets
        self.player_map = {}  # Maps WebSocket object -> 'white'/'black' string
        self._timer_task = None
        self.game_started = False  # Flag to track if the game has properly started

        # Chat message tracking for 1-minute timer logic
        self.chat_messages = {}  # Maps message_id -> message data
        self.player_last_message_time = {}  # Maps player_id -> timestamp of last message
        self.pending_responses = {}  # Maps sender_id -> list of message_ids awaiting response
        self.chat_timer_task = None  # Task for checking message timeouts

        # Assign players to colors
        self._assign_players(player1_ws, player2_ws)

    def _assign_players(self, player1_ws, player2_ws):
        """
        Assign player1_ws to white and player2_ws to black.
        Populate self.clients and self.player_map.
        """
        # Assign player1 to white
        player1_id = id(player1_ws)
        white_color = self.chess_game.assign_player(player1_id, 'white')
        if white_color is not None:
            self.clients.add(player1_ws)
            self.player_map[player1_ws] = 'white'

        # Assign player2 to black
        player2_id = id(player2_ws)
        black_color = self.chess_game.assign_player(player2_id, 'black')
        if black_color is not None:
            self.clients.add(player2_ws)
            self.player_map[player2_ws] = 'black'

    async def start_session_logic(self, player1_ws, player2_ws):
        """
        Start the game session logic.
        Initialize the timer and start the timer loop.
        """
        # Set the initial timestamp and record the start time
        current_time = asyncio.get_event_loop().time()
        self.chess_game.last_move_timestamp = current_time
        self.start_time = current_time  # Track when the game session started

        # Start the timer loop
        self._timer_task = asyncio.create_task(self._timer_loop())

        # Start the chat timer loop for message timeout checking
        self.chat_timer_task = asyncio.create_task(self._chat_timer_loop())
        print(f"Chat timer loop started for game {self.game_id}")

        # Mark the game as started after a short delay to ensure both clients are ready
        await asyncio.sleep(0.5)  # Short delay to ensure initialization is complete
        self.game_started = True
        print(f"Game {self.game_id} is now marked as started")

    async def _timer_loop(self):
        """
        Timer loop that checks for timeouts and updates game state.
        Runs until the game is over.
        """
        last_broadcast_time = 0
        last_detailed_log_time = 0
        last_critical_time_check = 0
        broadcast_frequency = 0.1  # 100ms for normal updates
        critical_time_threshold = 10  # seconds

        # Flag to track if we're in critical time mode (less than 10 seconds)
        in_critical_time = False

        while not self.chess_game.is_game_over():
            # Sleep for a very short time to avoid consuming too much CPU
            # But update frequently enough for smooth time flow
            await asyncio.sleep(0.02)  # 20ms for more responsive updates during critical time

            # Get current time
            current_time = asyncio.get_event_loop().time()

            # Update the time for the current player in real-time
            # This ensures time flows naturally at a real-time rate
            if self.chess_game.last_move_timestamp is not None:
                # Only update the time for the current player
                if self.chess_game.board.turn == chess.WHITE:
                    # Update white's time in real-time
                    time_elapsed = current_time - self.chess_game.last_move_timestamp
                    self.chess_game.time_white = max(0, self.chess_game.time_at_last_move_white - time_elapsed)

                    # Check if we're in critical time (less than 10 seconds)
                    if self.chess_game.time_white <= critical_time_threshold:
                        in_critical_time = True
                    else:
                        in_critical_time = False
                else:
                    # Update black's time in real-time
                    time_elapsed = current_time - self.chess_game.last_move_timestamp
                    self.chess_game.time_black = max(0, self.chess_game.time_at_last_move_black - time_elapsed)

                    # Check if we're in critical time (less than 10 seconds)
                    if self.chess_game.time_black <= critical_time_threshold:
                        in_critical_time = True
                    else:
                        in_critical_time = False

            # Check for timeout
            timed_out_player = self.chess_game.check_timeout()
            if timed_out_player is not None:
                print(f"TIMEOUT DETECTED in timer loop!")
                result = self.chess_game.get_game_result()
                print(f"Game result due to timeout: {result}")
                await self.broadcast_game_state()  # Send final time state
                await self.broadcast_game_over(result)
                print(f"Game over broadcast sent due to timeout")
                break

            # Determine broadcast frequency based on time remaining
            # More frequent updates when time is critical
            if in_critical_time:
                # Use a more frequent broadcast interval for critical time
                broadcast_interval = 0.05  # 50ms for critical time
            else:
                broadcast_interval = broadcast_frequency  # 100ms for normal time

            # Broadcast game state based on the determined frequency
            if current_time - last_broadcast_time >= broadcast_interval:
                await self.broadcast_game_state()
                last_broadcast_time = current_time

                # Log more frequently during critical time
                if in_critical_time and current_time - last_critical_time_check >= 1.0:
                    print(f"CRITICAL TIME - White: {self.chess_game.time_white:.1f}s, Black: {self.chess_game.time_black:.1f}s")
                    last_critical_time_check = current_time

                # Log the current times every 5 seconds during normal play
                elif not in_critical_time and current_time - last_detailed_log_time >= 5.0:
                    print(f"Current times - White: {self.chess_game.time_white:.1f}s, Black: {self.chess_game.time_black:.1f}s")
                    print(f"Time at last move - White: {self.chess_game.time_at_last_move_white:.1f}s, Black: {self.chess_game.time_at_last_move_black:.1f}s")

                    if self.chess_game.last_move_timestamp is not None:
                        time_elapsed = current_time - self.chess_game.last_move_timestamp
                        print(f"Time elapsed since last move: {time_elapsed:.2f}s")
                        print(f"Current turn: {self.chess_game.get_turn_color_string()}")

                    last_detailed_log_time = current_time

    async def handle_message(self, websocket, message_str):
        """
        Handle incoming messages from clients.

        Args:
            websocket: The WebSocket connection that sent the message
            message_str: The message string (JSON)
        """
        try:
            message = json.loads(message_str)
            action_type = message.get('type')
            player_id = id(websocket)

            print(f"Handling message: {action_type} from player {player_id}")

            if action_type == "make_move":
                uci_move = message.get('move')
                player_color_chess_module = self.chess_game.get_player_color(player_id)

                # Get player color string for logging
                player_color_str = "white" if player_color_chess_module == chess.WHITE else "black" if player_color_chess_module == chess.BLACK else "unknown"

                print(f"Move attempt: {uci_move} by player {player_id} ({player_color_str})")
                print(f"Current game state - FEN: {self.chess_game.get_board_fen()}")
                print(f"Current turn: {self.chess_game.get_turn_color_string()}")
                print(f"Raw board.turn: {self.chess_game.board.turn}, Player color: {player_color_chess_module}")

                # Check if player is in the game
                if player_color_chess_module is None:
                    print(f"Player {player_id} is not in this game")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "You are not a player in this game"
                    }))
                    return

                # Check if it's the player's turn
                if self.chess_game.board.turn != player_color_chess_module:
                    print(f"Not player's turn. Current turn: {self.chess_game.board.turn}, Player color: {player_color_chess_module}")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Not your turn"
                    }))

                    # Send a game state update to ensure client has correct state
                    await self.broadcast_game_state()
                    return

                # Try to make the move
                if self.chess_game.make_move(uci_move, player_id):
                    print(f"Move successful: {uci_move} by {player_color_str}")
                    print(f"New game state - FEN: {self.chess_game.get_board_fen()}")
                    print(f"New turn: {self.chess_game.get_turn_color_string()}")

                    # Send immediate confirmation to the player who made the move
                    await websocket.send(json.dumps({
                        "type": "move_confirmed",
                        "move": uci_move,
                        "fen": self.chess_game.get_board_fen(),
                        "turn": self.chess_game.get_turn_color_string(),
                        "time_white": self.chess_game.time_white,
                        "time_black": self.chess_game.time_black,
                        "is_capture": self.chess_game.last_move_was_capture,
                        "captured_piece": self.chess_game.captured_piece
                    }))

                    # Broadcast updated game state to all clients
                    await self.broadcast_game_state(last_move=uci_move)

                    # Broadcast again after a short delay to ensure all clients get the update
                    await asyncio.sleep(0.1)
                    await self.broadcast_game_state(last_move=uci_move)

                    # Check if game is over
                    if self.chess_game.is_game_over():
                        result = self.chess_game.get_game_result()
                        print(f"Game over: {result}")
                        await self.broadcast_game_over(result)
                        if self._timer_task and not self._timer_task.done():
                            self._timer_task.cancel()
                else:
                    print(f"Illegal move: {uci_move}")
                    # Send error message for illegal move
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Illegal move",
                        "details": "The move you attempted is not valid"
                    }))

                    # Send a game state update to ensure client has correct state
                    await self.broadcast_game_state()

            elif action_type == "request_game_state":
                # Handle request for game state update
                print(f"Received request_game_state from player {player_id}")
                await self.broadcast_game_state()

            elif action_type == "chat_message":
                text = message.get('text')

                # Get the sender role (white, black, or Spectator)
                player_id = id(websocket)

                # Determine if this is a player or spectator
                if player_id in self.chess_game.player_colors:
                    # This is a player
                    player_color = self.chess_game.player_colors[player_id]
                    sender_role = "white" if player_color == True else "black"
                else:
                    # This is a spectator or unknown
                    sender_role = self.player_map.get(websocket, f"Spectator_{player_id%1000}")

                # Get the username if provided in the message
                username = message.get('username')

                print(f"Chat message from {sender_role} ({username or 'anonymous'}): {text}")

                # Broadcast the message to all clients including the sender
                # This matches the working implementation's approach
                await self.broadcast_chat_message(sender_role, text, None, username)

            else:
                print(f"Unknown action type: {action_type}")
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Unknown action type: {action_type}"
                }))

        except json.JSONDecodeError as e:
            print(f"JSON decode error: {str(e)}")
            try:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON message"
                }))
            except Exception:
                pass
        except Exception as e:
            print(f"Error processing message: {str(e)}")
            try:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Error processing message: {str(e)}"
                }))
            except Exception:
                pass

    async def broadcast_game_state(self, last_move=None):
        """
        Broadcast the current game state to all clients and spectators.

        Args:
            last_move: The last move made (UCI string)
        """
        try:
            # Get current time
            current_time = asyncio.get_event_loop().time()

            # CRITICAL FIX: Log the current board state and turn
            print(f"BROADCASTING GAME STATE:")
            print(f"  Current FEN: {self.chess_game.get_board_fen()}")
            print(f"  Raw board.turn value: {self.chess_game.board.turn}")
            print(f"  Turn string: {self.chess_game.get_turn_color_string()}")
            if last_move:
                print(f"  Last move: {last_move}")

            # Calculate time elapsed since last move
            time_elapsed_current_turn = 0
            if self.chess_game.last_move_timestamp is not None:
                time_elapsed_current_turn = current_time - self.chess_game.last_move_timestamp

            # IMPORTANT FIX: Use the exact time values stored when the move was made
            # These are the most accurate values for time calculation

            # CRITICAL FIX: Use the stored time values if available
            has_stored_values = hasattr(self.chess_game, 'stored_white_time') and \
                               hasattr(self.chess_game, 'stored_black_time')

            if has_stored_values:
                # Use the stored time values for calculation
                time_white_at_last_move = self.chess_game.stored_white_time
                time_black_at_last_move = self.chess_game.stored_black_time

                # Calculate time elapsed since the last move for the current player
                if self.chess_game.board.turn == chess.WHITE and self.chess_game.last_white_move_time is not None:
                    # It's white's turn, so calculate time elapsed since the last black move
                    time_elapsed_current_turn = current_time - self.chess_game.last_white_move_time
                    print(f"White's turn, time elapsed: {time_elapsed_current_turn:.2f}s")
                elif self.chess_game.board.turn == chess.BLACK and self.chess_game.last_black_move_time is not None:
                    # It's black's turn, so calculate time elapsed since the last white move
                    time_elapsed_current_turn = current_time - self.chess_game.last_black_move_time
                    print(f"Black's turn, time elapsed: {time_elapsed_current_turn:.2f}s")
                else:
                    # Fall back to the exact move timestamp if available
                    if self.chess_game.exact_move_timestamp is not None:
                        time_elapsed_current_turn = current_time - self.chess_game.exact_move_timestamp
                        print(f"Using exact move timestamp for time elapsed: {time_elapsed_current_turn:.2f}s")

                print(f"Using STORED time values for calculation:")
                print(f"  stored_white_time: {time_white_at_last_move:.2f}s")
                print(f"  stored_black_time: {time_black_at_last_move:.2f}s")
                print(f"  time_elapsed_current_turn: {time_elapsed_current_turn:.2f}s")
            elif hasattr(self.chess_game, 'exact_time_white_at_move') and \
                 hasattr(self.chess_game, 'exact_time_black_at_move') and \
                 hasattr(self.chess_game, 'exact_move_timestamp') and \
                 self.chess_game.exact_move_timestamp is not None:
                # Fall back to the exact time values if stored values aren't available
                time_white_at_last_move = self.chess_game.exact_time_white_at_move
                time_black_at_last_move = self.chess_game.exact_time_black_at_move

                # Calculate time elapsed since the exact move timestamp
                if self.chess_game.exact_move_timestamp is not None:
                    time_elapsed_current_turn = current_time - self.chess_game.exact_move_timestamp

                print(f"Using EXACT time values for calculation:")
                print(f"  exact_time_white_at_move: {time_white_at_last_move:.2f}s")
                print(f"  exact_time_black_at_move: {time_black_at_last_move:.2f}s")
                print(f"  exact_move_timestamp: {self.chess_game.exact_move_timestamp}")
                print(f"  current_time: {current_time}")
                print(f"  time_elapsed_current_turn: {time_elapsed_current_turn:.2f}s")
            else:
                # Fall back to the time_at_last_move values if exact values aren't available
                time_white_at_last_move = getattr(self.chess_game, 'time_at_last_move_white', self.chess_game.time_white)
                time_black_at_last_move = getattr(self.chess_game, 'time_at_last_move_black', self.chess_game.time_black)

                print(f"Using FALLBACK time values for calculation:")
                print(f"  time_white_at_last_move: {time_white_at_last_move:.2f}s")
                print(f"  time_black_at_last_move: {time_black_at_last_move:.2f}s")
                print(f"  time_elapsed_current_turn: {time_elapsed_current_turn:.2f}s")

            # Log the time elapsed for debugging
            print(f"Time elapsed since last move: {time_elapsed_current_turn:.2f}s")

            # We no longer limit the time elapsed to allow for accurate time tracking
            # This ensures the timer counts down correctly regardless of how much time passes

            # Get the current turn
            current_turn = self.chess_game.board.turn

            # Log the current turn for debugging
            print(f"Current turn for time calculation: {'WHITE' if current_turn else 'BLACK'}")

            # Simply use the current time values from the chess game
            # These are already updated in real-time by the timer loop
            time_white = self.chess_game.time_white
            time_black = self.chess_game.time_black

            print(f"Broadcasting current times - White: {time_white:.2f}s, Black: {time_black:.2f}s")

            # Log detailed time calculations
            print(f"TIME CALCULATION:")
            print(f"  Current time: {current_time:.3f}")
            print(f"  Last move timestamp: {self.chess_game.last_move_timestamp:.3f}")
            print(f"  Time elapsed: {time_elapsed_current_turn:.3f}s")
            print(f"  White time at last move: {time_white_at_last_move:.2f}s")
            print(f"  Black time at last move: {time_black_at_last_move:.2f}s")
            print(f"  White time now: {time_white:.2f}s")
            print(f"  Black time now: {time_black:.2f}s")
            print(f"  Current turn: {self.chess_game.get_turn_color_string()}")

            # Log the calculated times
            print(f"Broadcasting times - White: {time_white:.1f}s, Black: {time_black:.1f}s, Turn: {self.chess_game.get_turn_color_string()}")

            # CRITICAL FIX: Get the current turn as a string for the client
            # Make sure we're using the most up-to-date turn information
            current_turn_string = self.chess_game.get_turn_color_string()

            # Log detailed turn information
            print(f"TURN INFORMATION FOR BROADCAST:")
            print(f"  Raw board.turn value: {self.chess_game.board.turn}")
            print(f"  Turn string for client: {current_turn_string}")
            print(f"  FEN: {self.chess_game.get_board_fen()}")

            # CRITICAL FIX: Prepare state dictionary with more detailed information
            state = {
                "type": "game_update",
                "game_id": self.game_id,
                "fen": self.chess_game.get_board_fen(),
                "turn": current_turn_string,
                "is_game_over": self.chess_game.is_game_over(),
                "time_white": time_white,
                "time_black": time_black,
                "timestamp": int(time.time() * 1000),  # Add timestamp for synchronization
                "time_elapsed": time_elapsed_current_turn,  # Add time elapsed for debugging
                "board_turn_raw": self.chess_game.board.turn,  # Add raw turn value for debugging
                "is_capture": self.chess_game.last_move_was_capture,  # Add capture information
                "captured_piece": self.chess_game.captured_piece  # Add captured piece information
            }

            # Add last move if provided
            if last_move:
                state["last_move"] = last_move
                print(f"Including last move in broadcast: {last_move}")

            # Add result if game is over
            if self.chess_game.is_game_over():
                result = self.chess_game.get_game_result()
                if result:
                    state["result"] = result
                    print(f"Game is over, including result: {result}")

            # Convert to JSON
            state_json = json.dumps(state)

            print(f"Broadcasting game state: {state}")
            print(f"CRITICAL - Turn being sent to clients: {current_turn_string}")
            print(f"CRITICAL - Times being sent to clients - White: {time_white:.2f}s, Black: {time_black:.2f}s")
            print(f"CRITICAL - Time elapsed since last move: {time_elapsed_current_turn:.2f}s")

            # CRITICAL FIX: Count clients before sending
            print(f"Number of clients to broadcast to: {len(self.clients)}")
            print(f"Number of spectators to broadcast to: {len(self.spectators)}")

            # Send to all clients and spectators
            clients_to_remove = []
            for client in self.clients:
                try:
                    await client.send(state_json)
                    print(f"Sent game state to client {id(client)}")
                except Exception as e:
                    print(f"Error sending game state to client: {str(e)}")
                    clients_to_remove.append(client)

            # Remove clients that couldn't receive the message
            for client in clients_to_remove:
                if client in self.clients:
                    self.clients.remove(client)
                    print(f"Removed client {id(client)} due to send failure")

            spectators_to_remove = []
            for spectator in self.spectators:
                try:
                    await spectator.send(state_json)
                    print(f"Sent game state to spectator {id(spectator)}")
                except Exception as e:
                    print(f"Error sending game state to spectator: {str(e)}")
                    spectators_to_remove.append(spectator)

            # Remove spectators that couldn't receive the message
            for spectator in spectators_to_remove:
                if spectator in self.spectators:
                    self.spectators.remove(spectator)
                    print(f"Removed spectator {id(spectator)} due to send failure")

            # CRITICAL FIX: Log successful broadcast
            print(f"Successfully broadcast game state to {len(self.clients) - len(clients_to_remove)} clients and {len(self.spectators) - len(spectators_to_remove)} spectators")

        except Exception as e:
            print(f"Error broadcasting game state: {str(e)}")
            import traceback
            traceback.print_exc()

    async def broadcast_game_over(self, result):
        """
        Broadcast game over message to all clients and spectators.

        Args:
            result: Game result dictionary from chess_game.get_game_result()
        """
        try:
            # Cancel the timer task if it's still running
            if self._timer_task and not self._timer_task.done():
                print(f"Cancelling timer task for game {self.game_id}")
                self._timer_task.cancel()

            # Create the game over message
            game_over_message = {
                "type": "game_over",
                "game_id": self.game_id,
                "result": result["outcome"],
                "winner": result.get("winner"),
                "final_time_white": self.chess_game.time_white,
                "final_time_black": self.chess_game.time_black
            }

            # Add detailed information based on the outcome
            if result["outcome"] == "checkmate":
                winner_color = result.get("winner", "unknown")
                game_over_message["details"] = f"{winner_color.capitalize()} wins by checkmate!"
            elif result["outcome"] == "stalemate":
                game_over_message["details"] = "Draw by stalemate. The player to move has no legal moves but is not in check."
            elif result["outcome"] == "draw_insufficient_material":
                game_over_message["details"] = "Draw by insufficient material. Neither player has enough pieces to deliver checkmate."
            elif result["outcome"] == "draw_seventyfive_moves":
                game_over_message["details"] = "Draw by 75-move rule. 75 moves have been made without a pawn move or capture."
            elif result["outcome"] == "draw_fivefold_repetition":
                game_over_message["details"] = "Draw by fivefold repetition. The same position has occurred five times."

            # Add additional information for timeout
            if result["outcome"] == "timeout":
                timed_out_color = "white" if result["winner"] == "black" else "black"
                game_over_message["timed_out_player"] = timed_out_color
                print(f"Game over due to timeout of {timed_out_color} player")

                # Set the timed out player's time to exactly 0 for display purposes
                if timed_out_color == "white":
                    self.chess_game.time_white = 0
                    game_over_message["final_time_white"] = 0
                else:
                    self.chess_game.time_black = 0
                    game_over_message["final_time_black"] = 0

                # Add detailed information about the timeout
                game_over_message["details"] = f"{timed_out_color.capitalize()} player ran out of time. {result['winner'].capitalize()} wins by timeout."

            # Add additional information for opponent disconnection
            elif result["outcome"] == "opponent_disconnected":
                # CRITICAL FIX: Use the disconnected_player from the result if available
                if "disconnected_player" in result:
                    disconnected_color = result["disconnected_player"]
                else:
                    disconnected_color = "white" if result["winner"] == "black" else "black"

                game_over_message["disconnected_player"] = disconnected_color
                print(f"CRITICAL: Game over due to disconnection of {disconnected_color} player")
                print(f"CRITICAL: Winner is {result['winner']} player")

                # Add detailed information about the disconnection
                game_over_message["details"] = f"{disconnected_color.capitalize()} player disconnected from the game. {result['winner'].capitalize()} wins by default."

                # CRITICAL FIX: Log the complete game_over_message
                print(f"CRITICAL: Complete game_over_message: {game_over_message}")

            game_over_json = json.dumps(game_over_message)

            print(f"Broadcasting game over: {game_over_message}")

            # Send to all clients and spectators
            clients_to_remove = []
            for client in self.clients:
                try:
                    await client.send(game_over_json)
                    print(f"Sent game over to client {id(client)}")
                except Exception as e:
                    print(f"Error sending game over to client: {str(e)}")
                    clients_to_remove.append(client)

            # Remove clients that couldn't receive the message
            for client in clients_to_remove:
                if client in self.clients:
                    self.clients.remove(client)
                    print(f"Removed client {id(client)} due to send failure")

            spectators_to_remove = []
            for spectator in self.spectators:
                try:
                    await spectator.send(game_over_json)
                    print(f"Sent game over to spectator {id(spectator)}")
                except Exception as e:
                    print(f"Error sending game over to spectator: {str(e)}")
                    spectators_to_remove.append(spectator)

            # Remove spectators that couldn't receive the message
            for spectator in spectators_to_remove:
                if spectator in self.spectators:
                    self.spectators.remove(spectator)
                    print(f"Removed spectator {id(spectator)} due to send failure")

            print(f"Game over broadcast complete for game {self.game_id}")

        except Exception as e:
            print(f"Error broadcasting game over: {str(e)}")
            import traceback
            traceback.print_exc()

    async def broadcast_chat_message(self, sender, text, sender_websocket=None, username=None, sender_client_id=None):
        """
        Broadcast chat message to all clients and spectators.

        Args:
            sender: Sender role ('white', 'black', or 'Spectator') or display name
            text: Message text
            sender_websocket: The WebSocket connection of the sender (can be None to send to all)
            username: The username of the sender (if provided)
            sender_client_id: The client ID of the sender (if different from sender_websocket)
        """
        # Import CLIENT_USERNAMES from server.py
        from server import CLIENT_USERNAMES
        try:
            # Create a chat message similar to the working implementation
            # Note: Using 'chat_update' type to match the working implementation
            # This is critical for compatibility with the client

            # Get the client ID if sender_websocket is provided or use the provided sender_client_id
            client_id = None
            if sender_client_id is not None:
                # Use the explicitly provided client ID
                client_id = sender_client_id
                print(f"Using provided client ID: {client_id}")
            elif sender_websocket:
                # Fall back to getting the client ID from the websocket
                client_id = id(sender_websocket)
                print(f"Using websocket client ID: {client_id}")

            # Determine the display sender name
            # Always keep track of the original sender role
            original_sender = sender

            # ALWAYS prioritize using real usernames for ALL senders
            # First, check if a username was explicitly provided to this function
            if username:
                display_sender = username
                print(f"Using explicitly provided username: {username}")
            # Next, check if we have a stored username for this client
            elif client_id is not None and client_id in CLIENT_USERNAMES:
                display_sender = CLIENT_USERNAMES[client_id]
                print(f"Using stored username from CLIENT_USERNAMES: {display_sender}")
            # For white/black players without a username, use their role
            elif sender == "white" or sender == "black":
                display_sender = sender.capitalize()  # "White" or "Black"
                print(f"Using capitalized role as display name: {display_sender}")
            # For spectators or other senders without a username
            else:
                # If it's a spectator ID format, clean it up
                if isinstance(sender, str) and sender.startswith("Spectator_"):
                    display_sender = "Spectator"
                    print(f"Using generic 'Spectator' as display name")
                else:
                    # Use the provided sender as a fallback
                    display_sender = sender
                    print(f"Using provided sender as display name: {sender}")

            # For debugging
            print(f"Chat message from {sender} (display as {display_sender})")

            # Create a unique message ID
            message_id = f"{int(time.time() * 1000)}-{id(self)}-{client_id or 0}"

            # Create the chat message
            chat_message = {
                "type": "chat_update",  # IMPORTANT: Must be 'chat_update' to match working implementation
                "sender": display_sender,
                "text": text,
                "game_id": self.game_id,
                "timestamp": int(time.time() * 1000),  # Add timestamp for message ordering
                "original_sender": display_sender,  # Use display_sender (username) for client-side identification
                "sender_role": original_sender,  # Include the sender's role (white, black, or spectator)
                "sender_id": client_id,  # Include the client ID for filtering on the client side
                "message_id": message_id,  # Add a unique message ID
                "username": display_sender  # Include the username explicitly
            }

            # Log the chat message for debugging
            print(f"Formatted chat message: {chat_message}")

            # Store the message in our tracking dictionary
            if client_id is not None:
                # Store the message
                self.chat_messages[message_id] = chat_message

                # Check if this is a new message or a response to previous messages
                is_response = False

                # Check if there are any pending messages from other players
                for other_id, pending_msgs in self.pending_responses.items():
                    if other_id != client_id and pending_msgs:
                        # This is a response to another player's message
                        is_response = True
                        print(f"Message from {client_id} is a response to pending messages from {other_id}")
                        # We don't remove the pending messages here because multiple players might need to respond
                        break

                # Update the last message time for this player
                self.player_last_message_time[client_id] = chat_message["timestamp"]

                # If this is a new message (not a response), add it to pending responses
                if not is_response:
                    # Initialize the pending responses list for this sender if it doesn't exist
                    if client_id not in self.pending_responses:
                        self.pending_responses[client_id] = []

                    # Add this message to the pending responses list
                    self.pending_responses[client_id].append(message_id)
                    print(f"Added message {message_id} to pending responses for sender {client_id}")
                else:
                    # This is a response, so we can clear pending messages from other players
                    # that are older than this response
                    for other_id in list(self.pending_responses.keys()):
                        if other_id != client_id:
                            # Get the pending messages for this other player
                            pending_msgs = self.pending_responses[other_id]

                            # Remove messages that have been responded to
                            # (i.e., messages that are older than this response)
                            msgs_to_remove = []
                            for pending_msg_id in pending_msgs[:]:
                                if pending_msg_id in self.chat_messages:
                                    pending_msg = self.chat_messages[pending_msg_id]
                                    if pending_msg["timestamp"] < chat_message["timestamp"]:
                                        # This pending message has been responded to
                                        msgs_to_remove.append(pending_msg_id)
                                        pending_msgs.remove(pending_msg_id)

                            # If we removed all pending messages for this player, remove the player from pending_responses
                            if not pending_msgs:
                                del self.pending_responses[other_id]
                                print(f"Removed all pending messages for sender {other_id}")

            chat_json = json.dumps(chat_message)

            print(f"Broadcasting chat message: {chat_message}")
            print(f"Number of clients: {len(self.clients)}, Number of spectators: {len(self.spectators)}")

            # Send to all clients, ALWAYS excluding the sender
            clients_to_remove = []
            for client in self.clients:
                try:
                    # Skip the sender if sender_websocket is provided
                    if sender_websocket and client == sender_websocket:
                        client_id = id(client)
                        print(f"Skipping sender client {client_id}")
                        continue

                    # Get the current client ID
                    current_client_id = id(client)

                    # Also skip if current client ID matches the sender_id
                    if client_id and current_client_id == client_id:
                        print(f"Skipping sender client by ID match: current={current_client_id}, sender={client_id}")
                        continue

                    client_id = id(client)
                    print(f"Sending chat message to client {client_id}")
                    await client.send(chat_json)
                    print(f"Successfully sent chat message to client {client_id}")
                except Exception as e:
                    print(f"Error sending chat message to client: {str(e)}")
                    clients_to_remove.append(client)

            # Remove clients that couldn't receive the message
            for client in clients_to_remove:
                if client in self.clients:
                    self.clients.remove(client)
                    print(f"Removed client {id(client)} due to send failure")

            # Send to all spectators, ALWAYS excluding the sender
            spectators_to_remove = []
            for spectator in self.spectators:
                try:
                    # Skip the sender if sender_websocket is provided
                    if sender_websocket and spectator == sender_websocket:
                        spectator_id = id(spectator)
                        print(f"Skipping sender spectator {spectator_id}")
                        continue

                    # Get the current spectator ID
                    current_spectator_id = id(spectator)

                    # Also skip if current spectator ID matches the sender_id
                    if client_id and current_spectator_id == client_id:
                        print(f"Skipping sender spectator by ID match: current={current_spectator_id}, sender={client_id}")
                        continue

                    spectator_id = id(spectator)
                    print(f"Sending chat message to spectator {spectator_id}")
                    await spectator.send(chat_json)
                    print(f"Successfully sent chat message to spectator {spectator_id}")
                except Exception as e:
                    print(f"Error sending chat message to spectator: {str(e)}")
                    spectators_to_remove.append(spectator)

            # Remove spectators that couldn't receive the message
            for spectator in spectators_to_remove:
                if spectator in self.spectators:
                    self.spectators.remove(spectator)
                    print(f"Removed spectator {id(spectator)} due to send failure")

        except Exception as e:
            print(f"Error broadcasting chat message: {str(e)}")
            import traceback
            traceback.print_exc()

    async def send_initial_state(self, websocket):
        """
        Send initial game state to a client.

        Args:
            websocket: The WebSocket connection to send the state to
        """
        try:
            # Get player color
            player_color_str = None
            player_id = id(websocket)
            player_color = self.chess_game.get_player_color(player_id)

            if player_color is not None:
                player_color_str = "white" if player_color == True else "black"

            # IMPORTANT FIX: Use the exact time values if available
            # These are the most accurate values for time calculation
            if hasattr(self.chess_game, 'exact_time_white_at_move') and hasattr(self.chess_game, 'exact_time_black_at_move'):
                time_white = self.chess_game.exact_time_white_at_move
                time_black = self.chess_game.exact_time_black_at_move
                print(f"INITIAL STATE: Using exact time values")
            else:
                # Fall back to the time_at_last_move values if exact values aren't available
                time_white = getattr(self.chess_game, 'time_at_last_move_white', self.chess_game.time_white)
                time_black = getattr(self.chess_game, 'time_at_last_move_black', self.chess_game.time_black)
                print(f"INITIAL STATE: Using fallback time values")

            # Calculate current time values based on elapsed time since last move
            current_time = asyncio.get_event_loop().time()
            if hasattr(self.chess_game, 'exact_move_timestamp') and self.chess_game.exact_move_timestamp is not None:
                time_elapsed = current_time - self.chess_game.exact_move_timestamp
                print(f"INITIAL STATE: Time elapsed since last move: {time_elapsed:.2f}s")

                # Update the time for the current player
                if self.chess_game.board.turn == True:  # White's turn
                    time_white = max(0, time_white - time_elapsed)
                else:  # Black's turn
                    time_black = max(0, time_black - time_elapsed)

            # Log the time values for debugging
            print(f"INITIAL STATE TIME VALUES:")
            print(f"  time_white: {time_white:.2f}s")
            print(f"  time_black: {time_black:.2f}s")
            print(f"  current turn: {self.chess_game.get_turn_color_string()}")

            # Prepare initial state
            initial_state = {
                "type": "game_start",
                "game_id": self.game_id,
                "fen": self.chess_game.get_board_fen(),
                "turn": self.chess_game.get_turn_color_string(),
                "time_white": time_white,
                "time_black": time_black
            }

            # Add player color if this is a player
            if player_color_str:
                initial_state["color"] = player_color_str

            print(f"Sending initial state to player {player_id}: {initial_state}")

            await websocket.send(json.dumps(initial_state))

        except Exception as e:
            print(f"Error sending initial state: {str(e)}")

    async def add_spectator(self, websocket):
        """
        Add a spectator to the game.

        Args:
            websocket: The WebSocket connection for the spectator
        """
        try:
            self.spectators.add(websocket)

            # IMPORTANT FIX: Use the exact time values if available
            # These are the most accurate values for time calculation
            if hasattr(self.chess_game, 'exact_time_white_at_move') and hasattr(self.chess_game, 'exact_time_black_at_move'):
                time_white = self.chess_game.exact_time_white_at_move
                time_black = self.chess_game.exact_time_black_at_move
                print(f"SPECTATOR INFO: Using exact time values")
            else:
                # Fall back to the time_at_last_move values if exact values aren't available
                time_white = getattr(self.chess_game, 'time_at_last_move_white', self.chess_game.time_white)
                time_black = getattr(self.chess_game, 'time_at_last_move_black', self.chess_game.time_black)
                print(f"SPECTATOR INFO: Using fallback time values")

            # Calculate current time values based on elapsed time since last move
            current_time = asyncio.get_event_loop().time()
            if hasattr(self.chess_game, 'exact_move_timestamp') and self.chess_game.exact_move_timestamp is not None:
                time_elapsed = current_time - self.chess_game.exact_move_timestamp
                print(f"SPECTATOR INFO: Time elapsed since last move: {time_elapsed:.2f}s")

                # Update the time for the current player
                if self.chess_game.board.turn == True:  # White's turn
                    time_white = max(0, time_white - time_elapsed)
                else:  # Black's turn
                    time_black = max(0, time_black - time_elapsed)

            # Log the time values for debugging
            print(f"SPECTATOR INFO TIME VALUES:")
            print(f"  time_white: {time_white:.2f}s")
            print(f"  time_black: {time_black:.2f}s")
            print(f"  current turn: {self.chess_game.get_turn_color_string()}")

            # Send spectate info
            spectate_info = {
                "type": "spectate_info",
                "game_id": self.game_id,
                "fen": self.chess_game.get_board_fen(),
                "turn": self.chess_game.get_turn_color_string(),
                "time_white": time_white,
                "time_black": time_black
            }

            print(f"Adding spectator {id(websocket)}, sending: {spectate_info}")

            await websocket.send(json.dumps(spectate_info))

        except Exception as e:
            print(f"Error adding spectator: {str(e)}")
            if websocket in self.spectators:
                self.spectators.remove(websocket)

    def remove_spectator(self, websocket):
        """
        Remove a spectator from the game.

        Args:
            websocket: The WebSocket connection for the spectator
        """
        if websocket in self.spectators:
            self.spectators.remove(websocket)

    async def _chat_timer_loop(self):
        """
        Timer loop that checks for chat message timeouts.
        Deletes messages that don't receive a response within 1 minute.
        """
        try:
            while not self.chess_game.is_game_over():
                # Sleep for a short time to avoid consuming too much CPU
                await asyncio.sleep(1.0)  # Check every second

                # Get current time
                current_time = time.time()

                # Check for message timeouts
                for sender_id, message_ids in list(self.pending_responses.items()):
                    # Skip if no pending messages
                    if not message_ids:
                        continue

                    # Get the timestamp of the first message in the list
                    first_message_id = message_ids[0]
                    if first_message_id not in self.chat_messages:
                        # Message was already deleted, remove from pending list
                        message_ids.pop(0)
                        continue

                    first_message = self.chat_messages[first_message_id]
                    message_time = first_message.get('timestamp', 0) / 1000  # Convert from milliseconds

                    # Check if message is older than 1 minute
                    if current_time - message_time > 60:  # 60 seconds = 1 minute
                        print(f"Message timeout detected for sender {sender_id}, message ID {first_message_id}")

                        # Get all messages within the 1-minute window from this sender
                        messages_to_delete = []
                        for msg_id in message_ids[:]:
                            if msg_id in self.chat_messages:
                                msg = self.chat_messages[msg_id]
                                msg_time = msg.get('timestamp', 0) / 1000

                                # If message is within the 1-minute window of the first message
                                if message_time <= msg_time <= message_time + 60:
                                    messages_to_delete.append(msg_id)
                                    message_ids.remove(msg_id)

                        # Delete the messages
                        if messages_to_delete:
                            await self._delete_chat_messages(messages_to_delete, sender_id)

                # Clean up empty pending response lists
                for sender_id in list(self.pending_responses.keys()):
                    if not self.pending_responses[sender_id]:
                        del self.pending_responses[sender_id]

        except asyncio.CancelledError:
            print(f"Chat timer loop cancelled for game {self.game_id}")
        except Exception as e:
            print(f"Error in chat timer loop: {str(e)}")
            import traceback
            traceback.print_exc()

    async def _delete_chat_messages(self, message_ids, sender_id):
        """
        Delete chat messages and notify clients.

        Args:
            message_ids: List of message IDs to delete
            sender_id: ID of the sender whose messages are being deleted
        """
        if not message_ids:
            return

        # Create a list of deleted messages for logging
        deleted_messages = []

        # Remove messages from the chat_messages dictionary
        for msg_id in message_ids:
            if msg_id in self.chat_messages:
                deleted_messages.append(self.chat_messages[msg_id])
                del self.chat_messages[msg_id]

        print(f"Deleted {len(deleted_messages)} messages from sender {sender_id} due to timeout")

        # Create a deletion notification message
        deletion_message = {
            "type": "chat_messages_deleted",
            "game_id": self.game_id,
            "sender_id": sender_id,
            "message_ids": message_ids,
            "reason": "timeout",
            "timestamp": int(time.time() * 1000)
        }

        # Send the deletion notification to all clients
        deletion_json = json.dumps(deletion_message)

        # Send to all clients
        clients_to_remove = []
        for client in self.clients:
            try:
                await client.send(deletion_json)
                print(f"Sent deletion notification to client {id(client)}")
            except Exception as e:
                print(f"Error sending deletion notification to client: {str(e)}")
                clients_to_remove.append(client)

        # Remove clients that couldn't receive the message
        for client in clients_to_remove:
            if client in self.clients:
                self.clients.remove(client)
                print(f"Removed client {id(client)} due to send failure")

        # Send to all spectators
        spectators_to_remove = []
        for spectator in self.spectators:
            try:
                await spectator.send(deletion_json)
                print(f"Sent deletion notification to spectator {id(spectator)}")
            except Exception as e:
                print(f"Error sending deletion notification to spectator: {str(e)}")
                spectators_to_remove.append(spectator)

        # Remove spectators that couldn't receive the message
        for spectator in spectators_to_remove:
            if spectator in self.spectators:
                self.spectators.remove(spectator)
                print(f"Removed spectator {id(spectator)} due to send failure")

    async def close_session(self):
        """
        Close the game session and clean up resources.
        """
        # Cancel the game timer task
        if self._timer_task and not self._timer_task.done():
            self._timer_task.cancel()
            try:
                await self._timer_task
            except asyncio.CancelledError:
                pass  # Task was cancelled, which is expected

        # Cancel the chat timer task
        if self.chat_timer_task and not self.chat_timer_task.done():
            self.chat_timer_task.cancel()
            try:
                await self.chat_timer_task
            except asyncio.CancelledError:
                pass  # Task was cancelled, which is expected