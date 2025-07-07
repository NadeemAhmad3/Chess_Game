# server/server.py
import asyncio
import websockets
import json
import logging
import sys
import os
import time
from game_manager import GameManager
from lobby import Lobby

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize game manager and lobby
game_manager = GameManager()
lobby = Lobby(game_manager)

# Set to keep track of all connected clients
ALL_CONNECTED_CLIENTS = set()
# Dictionary to map client IDs to usernames - simple key-value store
CLIENT_USERNAMES = {}

async def handler(websocket):
    """
    Handle WebSocket connections and messages.

    Args:
        websocket: The WebSocket connection
    """
    try:
        # Get client information
        client_id = id(websocket)
        remote = websocket.remote_address if hasattr(websocket, 'remote_address') else 'unknown'

        # Log connection
        logger.info(f"Client connected: {client_id} from {remote}")

        # Add the client to the set of connected clients
        ALL_CONNECTED_CLIENTS.add(websocket)
        print(f"New client connected: {client_id} from {remote}")

        # Send initial status message
        try:
            await websocket.send(json.dumps({
                "type": "status",
                "message": "Connected. Choose action."
            }))
        except Exception as e:
            logger.error(f"Error sending initial status: {str(e)}")
            return

        # Process incoming messages
        async for message_str in websocket:
            try:
                # Parse the message
                message_data = json.loads(message_str)
                msg_type = message_data.get('type')

                # Check if the client is in a game or spectating
                logger.info(f"Checking if client {client_id} is in a game or spectating")
                logger.info(f"Message type: {msg_type}")

                # IMPORTANT: For chat messages, check if the game_id is provided in the message
                # and if the client is actually in that game
                if msg_type == "chat_message":
                    message_game_id = message_data.get("game_id", "lobby")
                    logger.info(f"Chat message with game_id: {message_game_id}")

                    # Check if the client is in a game
                    if client_id in game_manager.player_to_game:
                        client_game_id = game_manager.player_to_game[client_id]
                        logger.info(f"Client {client_id} is in game {client_game_id}")

                        # If the client is in a game, force the game_id to be the correct one
                        # This ensures chat messages are routed to the right game
                        if message_game_id != client_game_id:
                            logger.info(f"Overriding message game_id from {message_game_id} to {client_game_id}")
                            message_data["game_id"] = client_game_id
                            message_str = json.dumps(message_data)

                    # Check if the client is spectating a game
                    elif client_id in game_manager.spectator_to_game:
                        client_game_id = game_manager.spectator_to_game[client_id]
                        logger.info(f"Client {client_id} is spectating game {client_game_id}")

                        # If the client is spectating a game, force the game_id to be the correct one
                        if message_game_id != client_game_id:
                            logger.info(f"Overriding message game_id from {message_game_id} to {client_game_id}")
                            message_data["game_id"] = client_game_id
                            message_str = json.dumps(message_data)

                # Handle ping/pong messages to keep the connection alive
                if msg_type == "ping":
                    # Respond with a pong message
                    await websocket.send(json.dumps({"type": "pong"}))
                    continue
                elif msg_type == "pong":
                    # Just acknowledge the pong
                    continue

                # Handle chat messages specially
                elif msg_type == "chat_message":
                    # Get the message text and game ID
                    text = message_data.get('text', '')
                    game_id = message_data.get('game_id', 'lobby')

                    # Check if this is a game chat or lobby chat
                    if game_id != 'lobby' and game_id in game_manager.active_games:
                        # This is a game chat message
                        logger.info(f"Chat message for game: {game_id}")

                        # Get the game session
                        game_session = game_manager.active_games[game_id]

                        # Determine the sender role
                        player_color = None
                        for color, sock in game_session.player_map.items():
                            if sock == websocket:
                                player_color = color
                                break

                        # If player_color is None, this might be a spectator
                        if player_color is None:
                            # Check if this is a spectator
                            is_spectator = False
                            for spec_sock in game_session.spectators:
                                if spec_sock == websocket:
                                    is_spectator = True
                                    break

                            if is_spectator:
                                sender_role = "Spectator"
                            else:
                                # Not a player or spectator, use a generic name
                                sender_role = "Guest"
                        else:
                            sender_role = player_color

                        # Get username from message or use stored username
                        username = message_data.get('username')

                        # Store username if provided
                        if username:
                            CLIENT_USERNAMES[client_id] = username
                            logger.info(f"Stored username for client {client_id}: {username}")

                        # Get the display name to use
                        display_name = None
                        if client_id in CLIENT_USERNAMES:
                            display_name = CLIENT_USERNAMES[client_id]
                            logger.info(f"Using stored username: {display_name}")
                        elif username:
                            display_name = username
                            logger.info(f"Using provided username: {display_name}")
                        else:
                            logger.info(f"No username available for client {client_id}")

                        # Broadcast the chat message to all players and spectators in the game
                        # Pass the client ID explicitly to ensure proper filtering
                        # Always exclude the sender to avoid duplicate messages
                        # Pass the display_name to ensure usernames are used
                        await game_session.broadcast_chat_message(sender_role, text, websocket, display_name, client_id)

                        logger.info(f"Broadcast game chat message from {sender_role} to game {game_id}")
                        continue
                    else:
                        # This is a lobby chat message
                        logger.info(f"Lobby chat message from client {client_id}: {text}")

                        # Get username from message
                        username = message_data.get('username')

                        # Store username if provided
                        if username:
                            CLIENT_USERNAMES[client_id] = username
                            logger.info(f"Stored username for client {client_id}: {username}")

                        # Create sender display name - ALWAYS use real name if available
                        if client_id in CLIENT_USERNAMES:
                            sender_display = CLIENT_USERNAMES[client_id]
                        elif username:
                            sender_display = username
                        else:
                            # If no username is available, use a generic name
                            sender_display = f"Guest_{client_id%1000}"

                        logger.info(f"Using display name: {sender_display} for client {client_id}")

                        # Create a unique message ID
                        message_id = f"{int(time.time() * 1000)}-lobby-{client_id}"

                        # Create a chat message
                        chat_message = {
                            "type": "chat_update",
                            "sender": sender_display,
                            "text": text,
                            "game_id": "lobby",
                            "timestamp": int(time.time() * 1000),
                            "original_sender": sender_display,  # Use the same sender display name for client-side identification
                            "sender_id": client_id,  # Include the client ID for filtering on the client side
                            "message_id": message_id,  # Add a unique message ID
                            "username": sender_display  # Include the username explicitly
                        }

                        # Broadcast to all clients in the lobby EXCEPT the sender
                        for client in ALL_CONNECTED_CLIENTS:
                            try:
                                # Skip the sender
                                if client == websocket:
                                    logger.info(f"Skipping sender client {client_id}")
                                    continue

                                # Also skip if client ID matches the sender ID
                                current_client_id = id(client)
                                if current_client_id == client_id:
                                    logger.info(f"Skipping sender client by ID match: {current_client_id}")
                                    continue

                                await client.send(json.dumps(chat_message))
                                logger.info(f"Sent lobby chat message to client {id(client)}")
                            except Exception as e:
                                logger.error(f"Error sending lobby chat message: {str(e)}")

                        continue

                # Now check if the client is in a game or spectating
                in_game = client_id in game_manager.player_to_game
                is_spectator = client_id in game_manager.spectator_to_game

                logger.info(f"Client {client_id} in game: {in_game}, is spectator: {is_spectator}")

                if in_game or is_spectator:
                    # Get the game ID
                    if in_game:
                        game_id = game_manager.player_to_game[client_id]
                        logger.info(f"Client {client_id} is in game {game_id}")
                    else:
                        game_id = game_manager.spectator_to_game[client_id]
                        logger.info(f"Client {client_id} is spectating game {game_id}")

                    # Handle chat messages
                    if msg_type == "chat_message":
                        logger.info(f"Processing chat message from client {client_id}")
                        session = game_manager.get_game_session(game_id)

                        if session:
                            text = message_data.get('text', '')

                            if is_spectator:
                                # Spectator chat
                                logger.info(f"Broadcasting spectator chat message from {client_id}")
                                # Get username from message
                                username = message_data.get('username')

                                # Store username if provided
                                if username:
                                    CLIENT_USERNAMES[client_id] = username
                                    logger.info(f"Stored username for spectator {client_id}: {username}")

                                # Get the display name - ALWAYS use real name if available
                                if client_id in CLIENT_USERNAMES:
                                    display_name = CLIENT_USERNAMES[client_id]
                                elif username:
                                    display_name = username
                                else:
                                    # If no username is available, use a generic name
                                    display_name = f"Spectator_{client_id%1000}"

                                logger.info(f"Using display name: {display_name} for spectator {client_id}")

                                # Pass the sender's websocket to avoid echoing back the message
                                # Use the display name directly as the sender
                                await session.broadcast_chat_message(
                                    display_name, text, websocket, None)
                            else:
                                # Player chat - let the game session handle it
                                logger.info(f"Forwarding player chat message from {client_id} to game session")
                                await game_manager.handle_client_message(websocket, message_str)
                        else:
                            logger.error(f"Game session {game_id} not found for chat message")
                    else:
                        # Handle all other game-related messages
                        logger.info(f"Forwarding game-related message from {client_id} to game manager")
                        await game_manager.handle_client_message(websocket, message_str)

                # Handle lobby and spectating actions
                else:
                    if msg_type == "join_lobby":
                        logger.info(f"Client {client_id} is joining the lobby")
                        # Store username if provided
                        username = message_data.get('username')
                        if username:
                            CLIENT_USERNAMES[client_id] = username
                            logger.info(f"Stored username for client {client_id}: {username}")

                        # Just register the client, don't add to queue
                        try:
                            await websocket.send(json.dumps({
                                "type": "status",
                                "message": "Connected to lobby. Select an option to continue."
                            }))
                            logger.info(f"Sent lobby join confirmation to client {client_id}")
                        except Exception as e:
                            logger.error(f"Error sending lobby join confirmation to client {client_id}: {str(e)}")

                    elif msg_type == "join_queue":
                        logger.info(f"Client {client_id} is joining the queue")

                        # Store username if provided
                        username = message_data.get('username')
                        if username:
                            CLIENT_USERNAMES[client_id] = username
                            logger.info(f"Stored username for client {client_id}: {username}")

                        # Check if this client is already in a game
                        if client_id in game_manager.player_to_game:
                            game_id = game_manager.player_to_game[client_id]
                            logger.info(f"Client {client_id} is already in game {game_id}, removing from game first")

                            # Remove the client from the game
                            await game_manager.remove_client(websocket)
                            logger.info(f"Removed client {client_id} from game {game_id}")

                            # Force remove from player_to_game mapping
                            if client_id in game_manager.player_to_game:
                                del game_manager.player_to_game[client_id]
                                logger.info(f"Forced removal of player {client_id} from player_to_game mapping")

                        # Add the player to the queue
                        await lobby.add_player(websocket)
                        logger.info(f"Client {client_id} added to queue")

                        # Send confirmation to the client
                        try:
                            await websocket.send(json.dumps({
                                "type": "status",
                                "message": "Joined queue. Waiting for opponent..."
                            }))
                            logger.info(f"Sent queue join confirmation to client {client_id}")

                            # IMPORTANT: Try to match players immediately
                            # This ensures that if there are already players in the queue, they get matched right away
                            await lobby.try_match_players()
                            logger.info(f"Tried to match players after client {client_id} joined queue")
                        except Exception as e:
                            logger.error(f"Error sending queue join confirmation to client {client_id}: {str(e)}")

                    elif msg_type == "leave_queue":
                        logger.info(f"Client {client_id} is leaving the queue")
                        lobby.remove_player(websocket)
                        logger.info(f"Client {client_id} removed from queue")
                        try:
                            await websocket.send(json.dumps({
                                "type": "status",
                                "message": "Left queue. Returned to main menu."
                            }))
                            logger.info(f"Sent queue leave confirmation to client {client_id}")
                        except Exception as e:
                            logger.error(f"Error sending queue leave confirmation to client {client_id}: {str(e)}")

                    elif msg_type == "leave_game":
                        logger.info(f"Client {client_id} is leaving their current game")

                        # CRITICAL FIX: Check if the client provided a game_id
                        provided_game_id = message_data.get('game_id')
                        force_end = message_data.get('force_end', False)

                        if force_end:
                            logger.info(f"CRITICAL: Client {client_id} requested force_end=True")

                        if provided_game_id:
                            logger.info(f"Client {client_id} provided game_id: {provided_game_id}")

                            # Check if the provided game_id is valid
                            if provided_game_id in game_manager.active_games:
                                game_id = provided_game_id
                                logger.info(f"Using provided game_id: {game_id}")

                                # CRITICAL FIX: If force_end is True, mark the game as ended
                                if force_end:
                                    logger.info(f"CRITICAL: Marking game {game_id} as ended due to force_end flag")
                                    game_session = game_manager.active_games.get(game_id)
                                    if game_session:
                                        game_session.is_game_over = True
                                        logger.info(f"CRITICAL: Game {game_id} marked as ended")
                            else:
                                logger.warning(f"Provided game_id {provided_game_id} is not valid")
                                # Continue with the normal flow to check if the client is in a game

                        # Check if the client is in a game
                        game_id = None
                        if provided_game_id and provided_game_id in game_manager.active_games:
                            # Use the provided game_id
                            game_id = provided_game_id
                            logger.info(f"Client {client_id} is leaving provided game {game_id}")
                        elif client_id in game_manager.player_to_game:
                            # Use the game_id from the player_to_game mapping
                            game_id = game_manager.player_to_game[client_id]
                            logger.info(f"Client {client_id} is leaving mapped game {game_id}")

                        if game_id:
                            # CRITICAL FIX: Get the game session and player color BEFORE removing the client
                            game_session = game_manager.active_games.get(game_id)
                            if game_session:
                                # Get the player's color before removing them
                                leaving_player_color = None
                                if websocket in game_session.player_map:
                                    leaving_player_color = game_session.player_map.get(websocket)
                                    logger.info(f"Player {client_id} with color {leaving_player_color} is leaving game {game_id}")

                                # Get the opponent's websocket and color
                                opponent_websocket = None
                                opponent_color = None
                                for client in game_session.clients:
                                    if client != websocket:
                                        opponent_websocket = client
                                        opponent_color = game_session.player_map.get(client)
                                        break

                                if opponent_websocket and opponent_color:
                                    logger.info(f"Found opponent with color {opponent_color}")

                                    # Create a result dictionary for the game over message
                                    result = {
                                        "outcome": "opponent_disconnected",
                                        "winner": opponent_color,
                                        "details": f"Your opponent has left the game. You win by default."
                                    }

                                    # CRITICAL FIX: Add the disconnected player information
                                    disconnected_color = "white" if opponent_color == "black" else "black"
                                    result["disconnected_player"] = disconnected_color

                                    logger.info(f"CRITICAL: Created game over result: {result}")
                                    logger.info(f"CRITICAL: Opponent color: {opponent_color}, Disconnected color: {disconnected_color}")

                                    # Broadcast game over BEFORE removing the client
                                    try:
                                        logger.info(f"CRITICAL: Broadcasting game over message to remaining player")
                                        await game_session.broadcast_game_over(result)
                                        logger.info(f"CRITICAL: Successfully broadcast game over due to player {client_id} leaving")

                                        # CRITICAL FIX: Also send a direct opponent_disconnected message to the remaining player
                                        # This ensures the client receives the message even if the broadcast fails
                                        try:
                                            # CRITICAL FIX: Send multiple messages with different types to ensure at least one gets through
                                            # This is a robust approach to handle various client states

                                            # First, send a direct win notification message
                                            # This is a special message type that will be handled specifically by the client
                                            win_notification = {
                                                "type": "win_notification",
                                                "game_id": game_id,
                                                "winner": opponent_color,
                                                "disconnected_player": disconnected_color,
                                                "details": f"Your opponent has left the game. You win by default.",
                                                "final_time_white": game_session.chess_game.time_white,
                                                "final_time_black": game_session.chess_game.time_black,
                                                "timestamp": int(time.time() * 1000)  # Add timestamp for ordering
                                            }
                                            logger.info(f"CRITICAL: Sending win_notification to remaining player: {win_notification}")
                                            await opponent_websocket.send(json.dumps(win_notification))
                                            logger.info(f"CRITICAL: Successfully sent win_notification")

                                            # Add a small delay to ensure the win_notification is processed first
                                            await asyncio.sleep(0.2)

                                            # Then, send a direct game_over message with all required fields
                                            game_over_message = {
                                                "type": "game_over",
                                                "game_id": game_id,  # Include the game ID
                                                "result": "opponent_disconnected",
                                                "winner": opponent_color,
                                                "disconnected_player": disconnected_color,
                                                "details": f"Your opponent has left the game. You win by default.",
                                                # Include final times to match the broadcast_game_over format
                                                "final_time_white": game_session.chess_game.time_white,
                                                "final_time_black": game_session.chess_game.time_black,
                                                "timestamp": int(time.time() * 1000)  # Add timestamp for ordering
                                            }
                                            logger.info(f"CRITICAL: Sending direct game_over message to remaining player: {game_over_message}")
                                            await opponent_websocket.send(json.dumps(game_over_message))
                                            logger.info(f"CRITICAL: Successfully sent direct game_over message")

                                            # Add a small delay to ensure the game_over message is processed
                                            await asyncio.sleep(0.2)

                                            # Then, also send a direct opponent_disconnected message as a backup
                                            direct_message = {
                                                "type": "opponent_disconnected",
                                                "game_id": game_id,  # Include the game ID
                                                "winner": opponent_color,
                                                "disconnected_player": disconnected_color,
                                                "details": f"Your opponent has left the game. You win by default.",
                                                "timestamp": int(time.time() * 1000)  # Add timestamp for ordering
                                            }
                                            logger.info(f"CRITICAL: Sending direct opponent_disconnected message to remaining player: {direct_message}")
                                            await opponent_websocket.send(json.dumps(direct_message))
                                            logger.info(f"CRITICAL: Successfully sent direct opponent_disconnected message")

                                            # Add another small delay to ensure the messages are processed
                                            await asyncio.sleep(0.2)

                                            # Send a final game update to ensure the client has the latest state
                                            # This is especially important for clients that might have missed earlier messages
                                            final_update = {
                                                "type": "game_update",
                                                "game_id": game_id,
                                                "fen": game_session.chess_game.get_board_fen(),
                                                "turn": game_session.chess_game.get_turn_color_string(),
                                                "time_white": game_session.chess_game.time_white,
                                                "time_black": game_session.chess_game.time_black,
                                                "result": "opponent_disconnected",
                                                "winner": opponent_color,
                                                "disconnected_player": disconnected_color,
                                                "is_game_over": True,
                                                "timestamp": int(time.time() * 1000)  # Add timestamp for ordering
                                            }
                                            logger.info(f"CRITICAL: Sending final game update to remaining player: {final_update}")
                                            await opponent_websocket.send(json.dumps(final_update))
                                            logger.info(f"CRITICAL: Successfully sent final game update")

                                            # Add another small delay to ensure all messages are processed
                                            await asyncio.sleep(0.2)

                                            # Send a system chat message to the remaining player
                                            chat_message = {
                                                "type": "chat_update",
                                                "sender": "System",
                                                "text": f"Your opponent has left the game. You win by default.",
                                                "game_id": game_id,
                                                "timestamp": int(time.time() * 1000),
                                                "isSystem": True
                                            }
                                            logger.info(f"CRITICAL: Sending system chat message to remaining player: {chat_message}")
                                            await opponent_websocket.send(json.dumps(chat_message))
                                            logger.info(f"CRITICAL: Successfully sent system chat message")

                                            # CRITICAL FIX: Send a special forced win message that will be displayed regardless of client state
                                            forced_win_message = {
                                                "type": "forced_win",
                                                "game_id": game_id,
                                                "winner": opponent_color,
                                                "disconnected_player": disconnected_color,
                                                "details": f"Your opponent has left the game. You win by default.",
                                                "timestamp": int(time.time() * 1000)
                                            }
                                            logger.info(f"CRITICAL: Sending forced win message to remaining player: {forced_win_message}")
                                            await opponent_websocket.send(json.dumps(forced_win_message))
                                            logger.info(f"CRITICAL: Successfully sent forced win message")

                                            # CRITICAL FIX: Send an alert message that will be displayed regardless of client state
                                            alert_message = {
                                                "type": "alert",
                                                "message": "You won! Your opponent has left the game.",
                                                "game_id": game_id,
                                                "timestamp": int(time.time() * 1000)
                                            }
                                            logger.info(f"CRITICAL: Sending alert message to remaining player: {alert_message}")
                                            await opponent_websocket.send(json.dumps(alert_message))
                                            logger.info(f"CRITICAL: Successfully sent alert message")
                                        except Exception as e:
                                            logger.error(f"CRITICAL ERROR: Error sending direct messages: {str(e)}")
                                            import traceback
                                            logger.error(f"CRITICAL ERROR: {traceback.format_exc()}")
                                    except Exception as e:
                                        logger.error(f"CRITICAL ERROR: Error broadcasting game over: {str(e)}")
                                        import traceback
                                        logger.error(f"CRITICAL ERROR: {traceback.format_exc()}")

                            # Now remove the client from the game
                            await game_manager.remove_client(websocket)
                            logger.info(f"Removed client {client_id} from game {game_id}")

                            # Send confirmation
                            try:
                                await websocket.send(json.dumps({
                                    "type": "status",
                                    "message": "Left game. Ready to join a new game."
                                }))
                                logger.info(f"Sent game leave confirmation to client {client_id}")
                            except Exception as e:
                                logger.error(f"Error sending game leave confirmation to client {client_id}: {str(e)}")
                        else:
                            logger.info(f"Client {client_id} is not in a game, ignoring leave_game message")

                    elif msg_type == "list_games":
                        logger.info(f"Client {client_id} requested list of active games")
                        try:
                            await lobby.send_active_games_list(websocket)
                            logger.info(f"Successfully sent active games list to client {client_id}")
                        except Exception as e:
                            logger.error(f"Error sending active games list to client {client_id}: {str(e)}")
                            import traceback
                            logger.error(f"Traceback: {traceback.format_exc()}")

                            # Send an error message to the client
                            try:
                                await websocket.send(json.dumps({
                                    "type": "error",
                                    "message": f"Error listing games: {str(e)}"
                                }))
                            except Exception as e2:
                                logger.error(f"Error sending error message to client {client_id}: {str(e2)}")

                    elif msg_type == "spectate_game":
                        game_id_to_spectate = message_data.get('game_id')
                        if game_id_to_spectate:
                            success = await game_manager.add_spectator_to_game(
                                game_id_to_spectate, websocket)
                            if not success:
                                await websocket.send(json.dumps({
                                    "type": "error",
                                    "message": f"Game {game_id_to_spectate} not found."
                                }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "message": "Missing game_id parameter."
                            }))

                    elif msg_type == "chat_message":
                        # Get the message text and game ID
                        text = message_data.get('text', '')
                        game_id = message_data.get('game_id', 'lobby')

                        # Check if this is a game chat or lobby chat
                        if game_id != 'lobby' and game_id in game_manager.active_games:
                            # This is a game chat message
                            logger.info(f"Chat message with game_id: {game_id}")

                            # Get the game session
                            game_session = game_manager.active_games[game_id]

                            # Get username from message
                            username = message_data.get('username')

                            # Store username if provided
                            if username:
                                CLIENT_USERNAMES[client_id] = username
                                logger.info(f"Stored username for client {client_id}: {username}")

                            # Determine the sender role
                            player_color = game_manager.get_player_color(client_id, game_id)
                            sender_role = player_color if player_color else "Spectator"

                            # Get the username to display
                            display_name = None
                            if client_id in CLIENT_USERNAMES:
                                display_name = CLIENT_USERNAMES[client_id]
                            elif username:
                                display_name = username

                            # Broadcast the chat message to all players and spectators in the game
                            # Pass the client ID explicitly to ensure proper filtering
                            await game_session.broadcast_chat_message(sender_role, text, websocket, display_name, client_id)

                            logger.info(f"Broadcast game chat message from {sender_role} to game {game_id}")
                        else:
                            # This is a lobby chat message
                            # Get username from message
                            username = message_data.get('username')

                            # Store username if provided
                            if username:
                                CLIENT_USERNAMES[client_id] = username
                                logger.info(f"Stored username for client {client_id}: {username}")

                            # Create sender display name - ALWAYS use real name if available
                            if client_id in CLIENT_USERNAMES:
                                sender_id = CLIENT_USERNAMES[client_id]
                            elif username:
                                sender_id = username
                            else:
                                # If no username is available, use a generic name
                                sender_id = f"Guest_{client_id%1000}"

                            logger.info(f"Using display name: {sender_id} for client {client_id}")

                            # Create a unique message ID
                            message_id = f"{int(time.time() * 1000)}-lobby-{client_id}"

                            # Create the chat message - use chat_update to match the working implementation
                            chat_message = {
                                "type": "chat_update",  # Changed from 'chat_message' to 'chat_update'
                                "sender": sender_id,
                                "text": text,
                                "game_id": "lobby",
                                "timestamp": int(time.time() * 1000),  # Add timestamp for message ordering
                                "original_sender": sender_id,  # Use the same sender ID for client-side identification
                                "sender_id": client_id,  # Include the client ID for filtering on the client side
                                "message_id": message_id,  # Add a unique message ID
                                "username": sender_id  # Include the username explicitly
                            }

                            chat_json = json.dumps(chat_message)
                            logger.info(f"Broadcasting lobby chat message: {chat_message}")

                            # Broadcast to ALL clients in the lobby, EXCEPT the sender
                            # This matches the working implementation's broadcast function
                            for client in ALL_CONNECTED_CLIENTS:
                                try:
                                    # Skip the sender
                                    if client == websocket:
                                        logger.info(f"Skipping sender client {client_id}")
                                        continue

                                    # Get the current client ID
                                    current_client_id = id(client)

                                    # Also skip if client ID matches the sender ID
                                    if current_client_id == client_id:
                                        logger.info(f"Skipping sender client by ID match: {current_client_id}")
                                        continue

                                    # Only send to clients that are not in a game
                                    if (current_client_id not in game_manager.player_to_game and
                                        current_client_id not in game_manager.spectator_to_game):
                                        await client.send(chat_json)
                                        logger.info(f"Sent lobby chat message to client {current_client_id}")
                                except Exception as e:
                                    logger.error(f"Error sending lobby chat message: {str(e)}")

                    elif msg_type == "request_game_state":
                        # Handle request for game state update
                        game_id = message_data.get('game_id')
                        client_id = id(websocket)

                        # Log all active games for debugging
                        logger.info(f"Active games: {list(game_manager.active_games.keys())}")
                        logger.info(f"Player to game mapping: {game_manager.player_to_game}")
                        logger.info(f"Spectator to game mapping: {game_manager.spectator_to_game}")

                        # First, check if the client is a player in a game
                        player_game_id = game_manager.player_to_game.get(client_id)

                        # If the client is a player, use their game ID regardless of what was sent
                        if player_game_id:
                            logger.info(f"Client {client_id} requested game state update, using their player game ID: {player_game_id}")
                            game_session = game_manager.active_games.get(player_game_id)
                            if game_session:
                                await game_session.broadcast_game_state()
                                return
                            else:
                                logger.warning(f"Player {client_id} has game ID {player_game_id} but no active game session found")

                        # If the client is a spectator, use their game ID regardless of what was sent
                        spectator_game_id = game_manager.spectator_to_game.get(client_id)
                        if spectator_game_id:
                            logger.info(f"Client {client_id} requested game state update, using their spectator game ID: {spectator_game_id}")
                            game_session = game_manager.active_games.get(spectator_game_id)
                            if game_session:
                                await game_session.broadcast_game_state()
                                return
                            else:
                                logger.warning(f"Spectator {client_id} has game ID {spectator_game_id} but no active game session found")

                        # If we get here, the client is not in a game or the game ID is invalid
                        # Try to use the provided game ID as a fallback
                        if game_id and game_id in game_manager.active_games:
                            logger.info(f"Client {client_id} requested game state update for game {game_id}")
                            game_session = game_manager.active_games[game_id]

                            # CRITICAL FIX: Check if the game is over
                            if game_session.is_game_over:
                                logger.info(f"CRITICAL: Game {game_id} is over, sending game_over message")

                                # Send a game_over message to the client
                                try:
                                    await websocket.send(json.dumps({
                                        "type": "game_over",
                                        "game_id": game_id,
                                        "result": "game_ended",
                                        "details": "This game has ended.",
                                        "timestamp": int(time.time() * 1000)
                                    }))
                                    logger.info(f"CRITICAL: Sent game_over message to client {client_id}")

                                    # Also send an alert message
                                    await websocket.send(json.dumps({
                                        "type": "alert",
                                        "message": "This game has ended. Please start a new game.",
                                        "game_id": game_id,
                                        "timestamp": int(time.time() * 1000)
                                    }))
                                    logger.info(f"CRITICAL: Sent alert message to client {client_id}")
                                except Exception as e:
                                    logger.error(f"CRITICAL ERROR: Error sending game_over message: {str(e)}")

                                # Don't associate the client with the game or broadcast the game state
                                return

                            # IMPORTANT: Associate this client with the game
                            # This ensures future requests will work correctly
                            if websocket in game_session.clients:
                                logger.info(f"Client {client_id} is already in game {game_id}, updating player mapping")
                                game_manager.player_to_game[client_id] = game_id
                            elif websocket in game_session.spectators:
                                logger.info(f"Client {client_id} is already spectating game {game_id}, updating spectator mapping")
                                game_manager.spectator_to_game[client_id] = game_id

                            await game_session.broadcast_game_state()
                        else:
                            # CRITICAL FIX: Don't send an error for this - it's likely just a client that reconnected
                            # and is trying to get the state of a game that no longer exists
                            logger.warning(f"Invalid game_id in request_game_state: {game_id}")

                            # Simply return without sending an error message
                            # This prevents the "Invalid game_id" error from appearing in the client
                            # The client will continue to use its local state until it receives a valid update
                            return
                    else:
                        logger.error(f"Unknown command: {msg_type}")
                        await websocket.send(json.dumps({
                            "type": "error",
                            "message": f"Unknown command: {msg_type}"
                        }))

            except json.JSONDecodeError:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON message."
                }))
            except Exception as e:
                logger.error(f"Error processing message: {str(e)}")
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Server error: {str(e)}"
                }))

    finally:
        # Clean up when the connection is closed
        try:
            if websocket in ALL_CONNECTED_CLIENTS:
                ALL_CONNECTED_CLIENTS.remove(websocket)

            # Remove from game if they were playing or spectating
            try:
                await game_manager.remove_client(websocket)
            except Exception as e:
                logger.error(f"Error removing client from game: {str(e)}")

            # Remove from lobby if they were waiting
            try:
                lobby.remove_player(websocket)
            except Exception as e:
                logger.error(f"Error removing client from lobby: {str(e)}")

            # Remove from username map
            try:
                if client_id in CLIENT_USERNAMES:
                    del CLIENT_USERNAMES[client_id]
                    logger.info(f"Removed username for client {client_id}")
            except Exception as e:
                logger.error(f"Error removing client from username map: {str(e)}")

            logger.info(f"Client disconnected: {id(websocket)}")
        except Exception as e:
            logger.error(f"Error during cleanup: {str(e)}")

async def main():
    """
    Start the WebSocket server.
    """
    # Use 0.0.0.0 to allow connections from any IP
    # This is essential for WebSocket connections to work properly
    host = "0.0.0.0"
    port = 8765

    # Print a clear message about the server address
    print(f"Server will be accessible at:")
    print(f"  - Local: ws://localhost:{port}")
    print(f"  - Network: ws://<your-ip-address>:{port}")

    # Log the Python version and environment
    print(f"Python version: {sys.version}")
    print(f"Current directory: {os.getcwd()}")

    logger.info(f"Starting WebSocket server on {host}:{port}")

    # Create the server with the simplest possible configuration
    try:
        # CRITICAL FIX: Use a more robust server configuration
        # This configuration is known to work with most clients
        await websockets.serve(
            handler,
            host,
            port,
            # IMPORTANT: Disable ping/pong to avoid connection issues
            # Some browsers have issues with WebSocket ping/pong
            ping_interval=None,
            ping_timeout=None,
            # Don't restrict origins to allow connections from any client
            origins=None,
            # Increase max message size
            max_size=10 * 1024 * 1024,  # 10 MB
            # Set a longer close timeout
            close_timeout=10,
            # Disable compression which can cause issues in some environments
            compression=None
        )

        print(f"WebSocket server started successfully on {host}:{port}!")
        print(f"Waiting for connections...")

        # Run forever
        await asyncio.Future()
    except Exception as e:
        print(f"ERROR starting WebSocket server: {e}")
        logger.error(f"Failed to start WebSocket server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # CRITICAL FIX: Use a more robust way to run the server
    # This handles keyboard interrupts and other exceptions better
    try:
        print("Starting Chess WebSocket Server...")
        print("Press Ctrl+C to stop the server")
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"\nServer stopped due to error: {e}")
        logger.error(f"Server error: {e}")
    finally:
        print("Server shutdown complete")