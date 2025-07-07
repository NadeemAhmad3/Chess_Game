# server/game_manager.py
import json
import uuid
import asyncio
from game_session import GameSession

class GameManager:
    def __init__(self):
        """
        Initialize the game manager.
        """
        self.active_games = {}  # Maps game_id -> GameSession instance
        self.player_to_game = {}  # Maps websocket_id -> game_id
        self.spectator_to_game = {}  # Maps websocket_id -> game_id

    async def start_new_game_session(self, player1_ws, player2_ws):
        """
        Start a new game session between two players.

        Args:
            player1_ws: WebSocket connection for player 1
            player2_ws: WebSocket connection for player 2

        Returns:
            GameSession: The newly created game session
        """
        player1_id = id(player1_ws)
        player2_id = id(player2_ws)

        print(f"Starting new game session between players {player1_id} and {player2_id}")

        # Check if either player is already in a game
        # Force remove players from any existing games
        if player1_id in self.player_to_game:
            old_game_id = self.player_to_game[player1_id]
            print(f"Player {player1_id} is already in game {old_game_id}, forcing removal")
            try:
                # Force remove from player_to_game mapping
                del self.player_to_game[player1_id]
                print(f"Forced removal of player {player1_id} from player_to_game mapping")
            except Exception as e:
                print(f"Error removing player {player1_id} from game: {str(e)}")

        if player2_id in self.player_to_game:
            old_game_id = self.player_to_game[player2_id]
            print(f"Player {player2_id} is already in game {old_game_id}, forcing removal")
            try:
                # Force remove from player_to_game mapping
                del self.player_to_game[player2_id]
                print(f"Forced removal of player {player2_id} from player_to_game mapping")
            except Exception as e:
                print(f"Error removing player {player2_id} from game: {str(e)}")

        # Check if both websockets are still open
        try:
            # Simple check to see if the websockets are still open
            # This will raise an exception if the websocket is closed
            player1_ws.protocol
            player2_ws.protocol
            print("Both players are connected, proceeding with game creation")
        except Exception as e:
            print(f"One of the players disconnected before game could start: {str(e)}")
            return None

        # Generate a unique game_id
        game_id = str(uuid.uuid4())
        print(f"Generated game ID: {game_id}")

        # Create a new game session
        try:
            game_session = GameSession(game_id, player1_ws, player2_ws)
            print(f"Created game session object for game {game_id}")
        except Exception as e:
            print(f"Error creating game session: {str(e)}")
            return None

        # Store the game session
        self.active_games[game_id] = game_session
        print(f"Added game {game_id} to active games")

        # CRITICAL FIX: Map player websockets to the game_id
        # Make sure to remove any existing mappings first
        # This prevents issues with players being mapped to multiple games
        if player1_id in self.player_to_game:
            old_game_id = self.player_to_game[player1_id]
            print(f"Player {player1_id} was already in game {old_game_id}, removing old mapping")
            del self.player_to_game[player1_id]

        if player2_id in self.player_to_game:
            old_game_id = self.player_to_game[player2_id]
            print(f"Player {player2_id} was already in game {old_game_id}, removing old mapping")
            del self.player_to_game[player2_id]

        # Now add the new mappings
        self.player_to_game[player1_id] = game_id
        self.player_to_game[player2_id] = game_id
        print(f"Mapped players {player1_id} and {player2_id} to game {game_id}")

        # Log all active games and mappings for debugging
        print(f"Active games: {list(self.active_games.keys())}")
        print(f"Player to game mapping: {self.player_to_game}")

        # Start the game session logic
        try:
            await game_session.start_session_logic(player1_ws, player2_ws)
            print(f"Started game session logic for game {game_id}")
        except Exception as e:
            print(f"Error starting game session logic: {str(e)}")
            # Clean up
            if game_id in self.active_games:
                del self.active_games[game_id]
            if player1_id in self.player_to_game:
                del self.player_to_game[player1_id]
            if player2_id in self.player_to_game:
                del self.player_to_game[player2_id]
            return None

        # Send initial game state to both players
        success = True
        try:
            await game_session.send_initial_state(player1_ws)
            print(f"Sent initial state to player {player1_id}")
        except Exception as e:
            print(f"Error sending initial state to player {player1_id}: {str(e)}")
            success = False

        try:
            await game_session.send_initial_state(player2_ws)
            print(f"Sent initial state to player {player2_id}")
        except Exception as e:
            print(f"Error sending initial state to player {player2_id}: {str(e)}")
            success = False

        # If we couldn't send to either player, clean up the game session
        if not success:
            print(f"Failed to start game session {game_id}, cleaning up")
            if game_id in self.active_games:
                del self.active_games[game_id]
            if player1_id in self.player_to_game:
                del self.player_to_game[player1_id]
            if player2_id in self.player_to_game:
                del self.player_to_game[player2_id]
            return None

        print(f"Game session {game_id} successfully created and initialized")
        return game_session

    def get_game_session(self, game_id):
        """
        Get a game session by its ID.

        Args:
            game_id: The ID of the game session

        Returns:
            GameSession or None: The game session if found, None otherwise
        """
        return self.active_games.get(game_id)

    async def handle_client_message(self, websocket, message_str):
        """
        Handle a message from a client.

        Args:
            websocket: The WebSocket connection that sent the message
            message_str: The message string (JSON)

        Returns:
            bool: True if the message was handled, False otherwise
        """
        client_id = id(websocket)
        print(f"Handling client message from {client_id}: {message_str}")

        try:
            # Parse the message to get the type
            message_data = json.loads(message_str)
            msg_type = message_data.get('type')
            print(f"Message type: {msg_type}")
        except json.JSONDecodeError:
            print(f"Invalid JSON message from client {client_id}")
            return False

        # Check if the client is a player in a game
        game_id = self.player_to_game.get(client_id)
        if game_id:
            print(f"Client {client_id} is a player in game {game_id}")
            game_session = self.active_games.get(game_id)
            if game_session:
                print(f"Found game session {game_id} for player {client_id}")

                # Special handling for chat messages to ensure they're properly routed
                if msg_type == 'chat_message':
                    print(f"Processing chat message from player {client_id} in game {game_id}")

                    # Make sure the game_id in the message matches the player's game
                    message_game_id = message_data.get('game_id')
                    if message_game_id != game_id:
                        print(f"WARNING: Message game_id {message_game_id} doesn't match player's game {game_id}")
                        print(f"Forcing game_id to {game_id}")
                        message_data['game_id'] = game_id
                        message_str = json.dumps(message_data)

                    # Get the player's color (white or black)
                    player_color = game_session.player_map.get(websocket)
                    if player_color:
                        print(f"Player {client_id} is {player_color}")
                        text = message_data.get('text', '')
                        # Get username from message
                        username = message_data.get('username')

                        # Import CLIENT_USERNAMES from server.py
                        from server import CLIENT_USERNAMES

                        # Store username if provided
                        if username:
                            CLIENT_USERNAMES[client_id] = username
                            print(f"Stored username for player {client_id}: {username}")

                        # Use stored username if available
                        if not username and client_id in CLIENT_USERNAMES:
                            username = CLIENT_USERNAMES[client_id]
                            print(f"Using stored username for player {client_id}: {username}")

                        # Broadcast the chat message with the correct sender role
                        # Pass the sender's websocket to avoid echoing back the message
                        await game_session.broadcast_chat_message(player_color, text, websocket, username)
                        return True
                    else:
                        print(f"Could not determine color for player {client_id}")

                # Special handling for request_game_state
                if msg_type == 'request_game_state':
                    print(f"Processing request_game_state from player {client_id} in game {game_id}")
                    # Get the game ID from the message, but use the player's game ID if different
                    message_game_id = message_data.get('game_id')
                    if message_game_id != game_id:
                        print(f"WARNING: Message game_id {message_game_id} doesn't match player's game {game_id}")
                        print(f"Using player's game ID: {game_id}")

                    await game_session.broadcast_game_state()
                    return True

                # For other non-chat messages, use the standard handler
                await game_session.handle_message(websocket, message_str)
                return True
            else:
                print(f"Game session {game_id} not found for player {client_id}")

        # If not a player, check if the client is a spectator
        game_id = self.spectator_to_game.get(client_id)
        if game_id:
            print(f"Client {client_id} is a spectator in game {game_id}")
            game_session = self.active_games.get(game_id)
            if game_session:
                print(f"Found game session {game_id} for spectator {client_id}")
                # Spectators can send chat messages and request game state
                if msg_type == 'chat_message':
                    print(f"Processing chat message from spectator {client_id}")
                    text = message_data.get('text', '')

                    # Make sure the game_id in the message matches the spectator's game
                    message_game_id = message_data.get('game_id')
                    if message_game_id != game_id:
                        print(f"WARNING: Message game_id {message_game_id} doesn't match spectator's game {game_id}")
                        print(f"Forcing game_id to {game_id}")
                        message_data['game_id'] = game_id
                        message_str = json.dumps(message_data)

                    # Get username if provided
                    username = message_data.get('username')

                    # Import CLIENT_USERNAMES from server.py
                    from server import CLIENT_USERNAMES

                    # Store username if provided
                    if username:
                        CLIENT_USERNAMES[client_id] = username
                        print(f"Stored username for spectator {client_id}: {username}")

                    # Use stored username if available
                    if not username and client_id in CLIENT_USERNAMES:
                        username = CLIENT_USERNAMES[client_id]
                        print(f"Using stored username for spectator {client_id}: {username}")

                    # Create a display name for the spectator
                    display_name = username if username else (CLIENT_USERNAMES.get(client_id) or f"Spectator_{client_id%1000}")

                    # Pass the sender's websocket to avoid echoing back the message
                    # Use the display name directly as the sender
                    # Also pass the client_id to ensure proper filtering
                    await game_session.broadcast_chat_message(display_name, text, websocket, display_name, client_id)
                    return True
                elif msg_type == 'request_game_state':
                    print(f"Processing request_game_state from spectator {client_id} in game {game_id}")
                    # Get the game ID from the message, but use the spectator's game ID if different
                    message_game_id = message_data.get('game_id')
                    if message_game_id != game_id:
                        print(f"WARNING: Message game_id {message_game_id} doesn't match spectator's game {game_id}")
                        print(f"Using spectator's game ID: {game_id}")

                    await game_session.broadcast_game_state()
                    return True
                else:
                    print(f"Spectator {client_id} sent non-chat message: {msg_type}")
            else:
                print(f"Game session {game_id} not found for spectator {client_id}")

        print(f"Message from client {client_id} could not be handled")
        return False

    async def add_spectator_to_game(self, game_id, websocket):
        """
        Add a spectator to a game.

        Args:
            game_id: The ID of the game to spectate
            websocket: The WebSocket connection for the spectator

        Returns:
            bool: True if the spectator was added, False otherwise
        """
        game_session = self.get_game_session(game_id)

        if game_session:
            await game_session.add_spectator(websocket)

            # Map the spectator to the game
            spectator_id = id(websocket)
            self.spectator_to_game[spectator_id] = game_id

            return True

        return False

    async def remove_client(self, websocket):
        """
        Remove a client (player or spectator) from their game.

        Args:
            websocket: The WebSocket connection to remove

        Returns:
            bool: True if the client was removed, False otherwise
        """
        try:
            client_id = id(websocket)
            removed = False

            # Check if the client is a player
            if client_id in self.player_to_game:
                game_id = self.player_to_game[client_id]
                game_session = self.active_games.get(game_id)

                if game_session:
                    # Remove the player from the game session
                    if websocket in game_session.clients:
                        game_session.clients.remove(websocket)

                    # Remove the player mapping
                    del self.player_to_game[client_id]

                    # Check if the game should be closed
                    if not game_session.clients or len(game_session.clients) <= 1:
                        print(f"Game {game_id} has {len(game_session.clients)} clients left, checking if it should be closed")

                        # IMPORTANT: Always consider the game as running if there's at least one client left
                        # This ensures the remaining player is always declared the winner
                        print(f"Game {game_id} has clients left, will send disconnection message")

                        # CRITICAL FIX: Only notify the remaining player if this is a disconnection, not a leave_game
                        # For leave_game, we already sent the notification in server.py
                        # Check if this is a disconnection by checking if the game is still in active_games
                        is_disconnection = True

                        # If the game ID is not in active_games, it means the player used leave_game
                        # and we already sent the notification in server.py
                        if game_id not in self.active_games:
                            is_disconnection = False
                            print(f"Game {game_id} not in active_games, assuming leave_game was used")

                        if len(game_session.clients) == 1 and is_disconnection:
                            try:
                                # Add a short delay before sending the disconnection message
                                # This gives the client time to process the game start message
                                await asyncio.sleep(2.0)

                                remaining_player = next(iter(game_session.clients))
                                remaining_player_id = id(remaining_player)
                                print(f"Notifying remaining player {remaining_player_id} about opponent disconnection")

                                # Get the remaining player's color
                                # CRITICAL FIX: Use both player_map and player_colors to determine the color
                                remaining_player_color = game_session.player_map.get(remaining_player)
                                remaining_player_id = id(remaining_player)

                                # If player_map doesn't have the color, try to get it from chess_game.player_colors
                                if not remaining_player_color and hasattr(game_session.chess_game, 'player_colors'):
                                    chess_color = game_session.chess_game.player_colors.get(remaining_player_id)
                                    if chess_color is not None:
                                        remaining_player_color = "white" if chess_color == True else "black"
                                        print(f"Got remaining player color from chess_game.player_colors: {remaining_player_color}")

                                print(f"Remaining player color: {remaining_player_color}")

                                # Declare the remaining player as the winner
                                # IMPORTANT: If we still don't have a color, default to 'white' to ensure someone wins
                                if not remaining_player_color:
                                    remaining_player_color = 'white'  # Default to white if color can't be determined
                                    print(f"Using default color 'white' for remaining player")

                                # Now we definitely have a color
                                # Create a result dictionary similar to what chess_game.get_game_result() returns
                                result = {
                                    "outcome": "opponent_disconnected",
                                    "winner": remaining_player_color,
                                    "details": "Your opponent has disconnected from the game."
                                }

                                print(f"Declaring {remaining_player_color} as winner due to opponent disconnection")

                                # Broadcast game over with the result
                                await game_session.broadcast_game_over(result)
                                print(f"Broadcast game over due to opponent disconnection")
                            except Exception as e:
                                print(f"Error notifying remaining player: {str(e)}")
                        else:
                            print(f"No remaining players to notify or notification already sent")

                        # Close the game session
                        try:
                            await game_session.close_session()
                            print(f"Closed game session {game_id}")
                        except Exception as e:
                            print(f"Error closing game session {game_id}: {str(e)}")

                        # Remove the game from active games
                        if game_id in self.active_games:
                            del self.active_games[game_id]
                            print(f"Removed game {game_id} from active games")



                    removed = True

            # Check if the client is a spectator (even if they were also a player)
            if client_id in self.spectator_to_game:
                game_id = self.spectator_to_game[client_id]
                game_session = self.active_games.get(game_id)

                if game_session:
                    # Remove the spectator from the game session
                    try:
                        game_session.remove_spectator(websocket)
                    except Exception as e:
                        print(f"Error removing spectator: {str(e)}")

                    # Remove the spectator mapping
                    del self.spectator_to_game[client_id]

                    removed = True

            return removed
        except Exception as e:
            print(f"Error in remove_client: {str(e)}")
            return False

    def get_active_games_info(self):
        """
        Get information about all active games.

        Returns:
            list: A list of dictionaries containing game information
        """
        try:
            print("Getting active games info")
            games_info = []

            # Log the number of active games
            print(f"Number of active games: {len(self.active_games)}")
            print(f"Active game IDs: {list(self.active_games.keys())}")

            # Log the player to game mapping
            print(f"Player to game mapping: {self.player_to_game}")

            for game_id, game_session in self.active_games.items():
                try:
                    # Get player IDs or names
                    player_ids = []
                    for player_id, game in self.player_to_game.items():
                        if game == game_id:
                            player_ids.append(str(player_id))

                    # Get the number of spectators
                    num_spectators = 0
                    for spectator_id, game in self.spectator_to_game.items():
                        if game == game_id:
                            num_spectators += 1

                    # Create game info dictionary
                    game_info = {
                        "id": game_id,
                        "players": player_ids,
                        "num_players": len(player_ids),
                        "num_spectators": num_spectators,
                        "status": "Ongoing" if not game_session.chess_game.is_game_over() else "Completed",
                        "fen": game_session.chess_game.get_board_fen(),
                        "turn": game_session.chess_game.get_turn_color_string(),
                        "time_white": game_session.chess_game.time_white,
                        "time_black": game_session.chess_game.time_black
                    }

                    games_info.append(game_info)
                    print(f"Added game info for game {game_id}: {game_info}")
                except Exception as e:
                    print(f"Error getting info for game {game_id}: {str(e)}")
                    # Add a minimal game info object to avoid breaking the client
                    games_info.append({
                        "id": game_id,
                        "players": [],
                        "num_players": 0,
                        "num_spectators": 0,
                        "status": "Error",
                        "error": str(e)
                    })

            print(f"Returning info for {len(games_info)} games")
            return games_info
        except Exception as e:
            print(f"Error in get_active_games_info: {str(e)}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            # Return an empty list to avoid breaking the client
            return []