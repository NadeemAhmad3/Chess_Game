# server/player.py
import json

class Player:
    """
    Represents a player in the chess application.
    Encapsulates the WebSocket connection and player identity.
    """

    def __init__(self, websocket, player_id=None):
        """
        Initialize a new player.

        Args:
            websocket: The WebSocket connection for this player
            player_id: Optional player ID (defaults to id(websocket))
        """
        self.websocket = websocket
        self.player_id = player_id if player_id is not None else id(websocket)
        self.name = f"Player_{self.player_id % 1000}"  # Default display name
        self.preferences = {}  # For storing player preferences (e.g., color preference)

    def get_id(self):
        """
        Get the player's ID.

        Returns:
            The player's ID
        """
        return self.player_id

    def get_websocket(self):
        """
        Get the player's WebSocket connection.

        Returns:
            The WebSocket connection
        """
        return self.websocket

    async def send_message(self, message_dict):
        """
        Send a message to the player.

        Args:
            message_dict: The message to send as a dictionary

        Returns:
            bool: True if the message was sent successfully, False otherwise
        """
        try:
            # Convert the message to a JSON string
            message_str = json.dumps(message_dict)

            # Send the message
            await self.websocket.send(message_str)
            return True
        except Exception as e:
            print(f"Error sending message to player {self.player_id}: {str(e)}")
            return False

    def __hash__(self):
        """
        Make Player objects hashable for use in sets and as dictionary keys.

        Returns:
            Hash of the player's ID
        """
        return hash(self.player_id)

    def __eq__(self, other):
        """
        Check if two Player objects are equal.

        Args:
            other: The object to compare with

        Returns:
            bool: True if the objects are equal, False otherwise
        """
        return isinstance(other, Player) and self.player_id == other.player_id

    def __str__(self):
        """
        Get a string representation of the player.

        Returns:
            String representation
        """
        return f"{self.name} (ID: {self.player_id})"