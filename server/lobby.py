# server/lobby.py
import json
import asyncio
import time
from game_session import GameSession

class Lobby:
    def __init__(self, game_manager_ref):
        """
        Initialize the lobby.

        Args:
            game_manager_ref: Reference to the GameManager instance
        """
        self.game_manager = game_manager_ref
        self.waiting_players = []  # List of WebSockets for players waiting for a match

    async def add_player(self, websocket):
        """
        Add a player to the waiting list and try to match players.

        Args:
            websocket: The WebSocket connection for the player
        """
        # Get the player ID for logging
        player_id = id(websocket)

        # Check if the player is already in the waiting list
        if websocket in self.waiting_players:
            print(f"Player {player_id} is already in the waiting list")
            return

        # Force remove the player from any existing games

        # Check if the player is already in a game
        if player_id in self.game_manager.player_to_game:
            game_id = self.game_manager.player_to_game[player_id]
            print(f"Player {player_id} is already in game {game_id}, removing from game first")

            try:
                # Remove the player from the game
                await self.game_manager.remove_client(websocket)
                print(f"Removed player {player_id} from game {game_id}")

                # Force remove from player_to_game mapping
                if player_id in self.game_manager.player_to_game:
                    del self.game_manager.player_to_game[player_id]
                    print(f"Forced removal of player {player_id} from player_to_game mapping")
            except Exception as e:
                print(f"Error removing player {player_id} from game: {str(e)}")

            # Small delay to ensure clean state
            await asyncio.sleep(0.5)

        # Double-check that the player is completely removed from any games
        if player_id in self.game_manager.player_to_game:
            print(f"WARNING: Player {player_id} is still in a game after removal attempt")
            del self.game_manager.player_to_game[player_id]
            print(f"Forced removal of player {player_id} from player_to_game mapping")

        # Now add the player to the waiting list
        print(f"Adding player {player_id} to waiting list")
        self.waiting_players.append(websocket)
        print(f"Waiting list now has {len(self.waiting_players)} players")

        # Try to match players immediately
        # This ensures that if there are already players in the queue, they get matched right away
        print(f"Trying to match players immediately after adding player {player_id}")
        await self.try_match_players()

        # If we still have at least 2 players in the queue, try matching again
        # This handles the case where the first match attempt failed
        if len(self.waiting_players) >= 2:
            print(f"Still have {len(self.waiting_players)} players in queue after first match attempt, trying again")
            await asyncio.sleep(1.0)  # Small delay to ensure clean state
            await self.try_match_players()

    def remove_player(self, websocket):
        """
        Remove a player from the waiting list.

        Args:
            websocket: The WebSocket connection for the player
        """
        if websocket in self.waiting_players:
            self.waiting_players.remove(websocket)

    async def try_match_players(self):
        """
        Try to match waiting players and start a game session.
        """
        # First, clean up any disconnected players from the waiting list
        self.waiting_players = [ws for ws in self.waiting_players if self._is_connected(ws)]
        print(f"Cleaned up waiting list, now have {len(self.waiting_players)} players")

        if len(self.waiting_players) >= 2:
            print(f"Found {len(self.waiting_players)} players in queue, attempting to match first two")

            # Get the first two players but don't remove them yet
            player1_ws = self.waiting_players[0]
            player2_ws = self.waiting_players[1]

            # Get player IDs for logging
            player1_id = id(player1_ws)
            player2_id = id(player2_ws)
            print(f"Attempting to match players {player1_id} and {player2_id}")

            # Double-check that both players are still connected
            if not self._is_connected(player1_ws) or not self._is_connected(player2_ws):
                print("One of the players disconnected during matching")
                # Clean up again and return
                self.waiting_players = [ws for ws in self.waiting_players if self._is_connected(ws)]
                print(f"Cleaned up waiting list again, now have {len(self.waiting_players)} players")
                return

            # Force remove both players from any existing games

            # Check if player1 is in a game
            if player1_id in self.game_manager.player_to_game:
                game_id = self.game_manager.player_to_game[player1_id]
                print(f"Player {player1_id} is still in game {game_id}, removing from game first")
                try:
                    # Remove player1 from the game
                    await self.game_manager.remove_client(player1_ws)
                    print(f"Removed player {player1_id} from game {game_id}")

                    # Force remove from player_to_game mapping
                    if player1_id in self.game_manager.player_to_game:
                        del self.game_manager.player_to_game[player1_id]
                        print(f"Forced removal of player {player1_id} from player_to_game mapping")
                except Exception as e:
                    print(f"Error removing player {player1_id} from game: {str(e)}")

                # Small delay to ensure clean state
                await asyncio.sleep(0.5)

            # Check if player2 is in a game
            if player2_id in self.game_manager.player_to_game:
                game_id = self.game_manager.player_to_game[player2_id]
                print(f"Player {player2_id} is still in game {game_id}, removing from game first")
                try:
                    # Remove player2 from the game
                    await self.game_manager.remove_client(player2_ws)
                    print(f"Removed player {player2_id} from game {game_id}")

                    # Force remove from player_to_game mapping
                    if player2_id in self.game_manager.player_to_game:
                        del self.game_manager.player_to_game[player2_id]
                        print(f"Forced removal of player {player2_id} from player_to_game mapping")
                except Exception as e:
                    print(f"Error removing player {player2_id} from game: {str(e)}")

                # Small delay to ensure clean state
                await asyncio.sleep(0.5)

            # Double-check that both players are completely removed from any games
            if player1_id in self.game_manager.player_to_game:
                print(f"WARNING: Player {player1_id} is still in a game after removal attempt")
                del self.game_manager.player_to_game[player1_id]
                print(f"Forced removal of player {player1_id} from player_to_game mapping")

            if player2_id in self.game_manager.player_to_game:
                print(f"WARNING: Player {player2_id} is still in a game after removal attempt")
                del self.game_manager.player_to_game[player2_id]
                print(f"Forced removal of player {player2_id} from player_to_game mapping")

            # Now remove the players from the waiting list
            self.waiting_players.pop(0)  # Remove player1
            self.waiting_players.pop(0)  # Remove player2

            print(f"Matching players {id(player1_ws)} and {id(player2_ws)}")

            # Notify both players that a match is being created
            try:
                await player1_ws.send(json.dumps({
                    "type": "status",
                    "message": "Match found! Creating game..."
                }))
                await player2_ws.send(json.dumps({
                    "type": "status",
                    "message": "Match found! Creating game..."
                }))
            except Exception as e:
                print(f"Error notifying players about match: {str(e)}")
                # If we can't send messages, players might be disconnected
                # Put them back in the queue if they're still connected
                if self._is_connected(player1_ws):
                    self.waiting_players.append(player1_ws)
                if self._is_connected(player2_ws):
                    self.waiting_players.append(player2_ws)
                return

            # Start a new game session with a timeout
            try:
                # IMPORTANT: Double-check that both players are still connected
                if not self._is_connected(player1_ws) or not self._is_connected(player2_ws):
                    print("One of the players disconnected during game creation")
                    game_session = None
                else:
                    # Set a timeout for game session creation
                    print(f"Starting new game session between players {player1_id} and {player2_id}")
                    game_session = await asyncio.wait_for(
                        self.game_manager.start_new_game_session(player1_ws, player2_ws),
                        timeout=5.0  # 5 second timeout
                    )
                    print(f"Game session creation completed with result: {game_session}")
            except asyncio.TimeoutError:
                print("Game session creation timed out")
                game_session = None
            except Exception as e:
                print(f"Error creating game session: {str(e)}")
                game_session = None

            # If game session creation failed, put players back in the queue if they're still connected
            if game_session is None:
                print("Game session creation failed, returning players to queue if still connected")

                # Notify players about the failure
                try:
                    if self._is_connected(player1_ws):
                        await player1_ws.send(json.dumps({
                            "type": "error",
                            "message": "Failed to create game. Please try again."
                        }))
                except Exception:
                    pass

                try:
                    if self._is_connected(player2_ws):
                        await player2_ws.send(json.dumps({
                            "type": "error",
                            "message": "Failed to create game. Please try again."
                        }))
                except Exception:
                    pass

                # Return players to the queue
                if self._is_connected(player1_ws):
                    self.waiting_players.append(player1_ws)
                    print(f"Player {id(player1_ws)} returned to queue")
                else:
                    print(f"Player {id(player1_ws)} disconnected, not returning to queue")

                if self._is_connected(player2_ws):
                    self.waiting_players.append(player2_ws)
                    print(f"Player {id(player2_ws)} returned to queue")
                else:
                    print(f"Player {id(player2_ws)} disconnected, not returning to queue")
            else:
                print(f"Game session {game_session.game_id} created successfully")

    def _is_connected(self, websocket):
        """
        Check if a websocket is still connected.

        Args:
            websocket: The WebSocket connection to check

        Returns:
            bool: True if the websocket is still connected, False otherwise
        """
        try:
            websocket.protocol
            return True
        except Exception:
            return False

    async def send_active_games_list(self, websocket):
        """
        Send a list of active games to a client.

        Args:
            websocket: The WebSocket connection to send the list to
        """
        try:
            # Get the client ID for logging
            client_id = id(websocket)
            print(f"Sending active games list to client {client_id}")

            # Get the list of active games
            active_games = self.game_manager.get_active_games_info()
            print(f"Found {len(active_games)} active games")

            # Create the message
            games_list_message = {
                "type": "games_list",
                "games": active_games,
                "timestamp": int(time.time() * 1000)  # Add timestamp for ordering
            }

            # Log the message for debugging
            print(f"Sending games list message: {games_list_message}")

            # Send the message
            await websocket.send(json.dumps(games_list_message))
            print(f"Successfully sent active games list to client {client_id}")

            # Also send a status message to confirm
            await websocket.send(json.dumps({
                "type": "status",
                "message": f"Found {len(active_games)} active games",
                "timestamp": int(time.time() * 1000)
            }))
            print(f"Sent status message to client {client_id}")

            return True
        except Exception as e:
            print(f"Error sending active games list: {str(e)}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")

            # Try to send an error message
            try:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Error listing games: {str(e)}",
                    "timestamp": int(time.time() * 1000)
                }))
            except Exception as e2:
                print(f"Error sending error message: {str(e2)}")

            return False