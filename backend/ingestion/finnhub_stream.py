"""
Asynchronous WebSocket client for Finnhub real-time trade data streaming.

This module provides a robust connection to Finnhub's WebSocket API with:
- Automatic reconnection with exponential backoff
- Trade message queueing for downstream processing
- Non-blocking listener pattern using asyncio.Queue
- Comprehensive error handling and logging
"""

import asyncio
import json
import logging
from typing import List, Optional

import websockets
from websockets.exceptions import WebSocketException

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class FinnhubWebSocketClient:
    """
    Asynchronous WebSocket client for Finnhub trade data streaming.

    Handles subscription to multiple tickers, reconnection logic with exponential
    backoff, and non-blocking message queueing for downstream consumers.
    """

    def __init__(
        self,
        api_key: str,
        tickers: List[str],
        queue_maxsize: int = 1000,
        max_reconnect_attempts: int = 10,
        initial_backoff: float = 1.0,
    ):
        """
        Initialize the Finnhub WebSocket client.

        Args:
            api_key: Finnhub API key for authentication
            tickers: List of ticker symbols to subscribe to (e.g., ['AAPL', 'GOOGL'])
            queue_maxsize: Maximum size of the async queue (default: 1000)
            max_reconnect_attempts: Maximum reconnection attempts before shutdown (default: 10)
            initial_backoff: Initial backoff delay in seconds (default: 1.0)
        """
        self.api_key = api_key
        self.tickers = tickers
        self.queue_maxsize = queue_maxsize
        self.max_reconnect_attempts = max_reconnect_attempts
        self.initial_backoff = initial_backoff

        # WebSocket endpoint
        self.ws_url = f"wss://ws.finnhub.io?token={api_key}"

        # Async queue for trade messages
        self.trade_queue: asyncio.Queue = asyncio.Queue(maxsize=queue_maxsize)

        # Connection state tracking
        self.websocket = None
        self.is_connected = False
        self.reconnect_attempts = 0
        self.listener_task = None
        self.reconnect_task = None

    async def connect(self) -> None:
        """
        Establish WebSocket connection and subscribe to tickers.

        Raises:
            Exception: If connection fails after max reconnection attempts
        """
        try:
            logger.info(f"Connecting to Finnhub WebSocket: {self.ws_url}")
            self.websocket = await websockets.connect(self.ws_url)
            self.is_connected = True
            self.reconnect_attempts = 0
            logger.info("Connected to Finnhub WebSocket")

            # Subscribe to tickers
            await self._subscribe_tickers()

        except WebSocketException as e:
            logger.error(f"WebSocket connection error: {e}")
            await self._handle_reconnection()
        except Exception as e:
            logger.error(f"Unexpected error during connection: {e}")
            await self._handle_reconnection()

    async def _subscribe_tickers(self) -> None:
        """
        Send subscription messages for all tickers.

        Each ticker is subscribed individually via JSON message:
        {"type": "subscribe", "symbol": "AAPL"}
        """
        for ticker in self.tickers:
            subscribe_message = {"type": "subscribe", "symbol": ticker}
            try:
                await self.websocket.send(json.dumps(subscribe_message))
                logger.info(f"Subscribed to {ticker}")
            except Exception as e:
                logger.error(f"Failed to subscribe to {ticker}: {e}")
                raise

    async def _handle_reconnection(self) -> None:
        """
        Handle reconnection logic with exponential backoff.

        - Increments reconnection attempt counter
        - Calculates exponential backoff delay: initial_backoff * 2^(attempt)
        - Caps backoff at 5 minutes (300 seconds)
        - Raises exception if max attempts exceeded
        """
        self.is_connected = False
        self.reconnect_attempts += 1

        if self.reconnect_attempts > self.max_reconnect_attempts:
            logger.error(
                f"Max reconnection attempts ({self.max_reconnect_attempts}) exceeded. "
                "Shutting down."
            )
            raise Exception("Max reconnection attempts exceeded")

        # Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 300s
        backoff_delay = min(
            self.initial_backoff * (2 ** (self.reconnect_attempts - 1)),
            300.0,  # Cap at 5 minutes
        )

        logger.info(
            f"Reconnection attempt {self.reconnect_attempts}/{self.max_reconnect_attempts}. "
            f"Retrying in {backoff_delay:.1f} seconds..."
        )

        await asyncio.sleep(backoff_delay)
        await self.connect()

    async def _listen(self) -> None:
        """
        Listen for incoming WebSocket messages and queue them.

        Continuously reads messages from WebSocket and places them in the
        async queue for downstream processing. Non-blocking queue.put_nowait()
        ensures the listener never stalls.

        Handles:
        - Trade messages: {"type": "trade", "data": [...]}
        - Ping/pong messages: {"type": "ping"}
        - Status messages: {"type": "status", ...}
        """
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)

                    # Only queue trade messages
                    if data.get("type") == "trade":
                        try:
                            # Non-blocking queue insertion
                            self.trade_queue.put_nowait(data)
                        except asyncio.QueueFull:
                            logger.warning(
                                f"Trade queue is full (size={self.queue_maxsize}). "
                                "Dropping oldest message."
                            )
                            # Drop oldest message and retry
                            try:
                                self.trade_queue.get_nowait()
                                self.trade_queue.put_nowait(data)
                            except asyncio.QueueEmpty:
                                pass

                    elif data.get("type") == "ping":
                        # Respond to ping
                        await self.websocket.send(json.dumps({"type": "pong"}))

                    elif data.get("type") == "status":
                        logger.info(f"Status message: {data}")

                except json.JSONDecodeError as e:
                    logger.error(f"Failed to decode JSON message: {e}. Raw: {message}")
                    continue

        except WebSocketException as e:
            logger.error(f"WebSocket error during listening: {e}")
            await self._handle_reconnection()
        except asyncio.CancelledError:
            logger.info("Listener task cancelled")
            raise
        except Exception as e:
            logger.error(f"Unexpected error in listener: {e}")
            await self._handle_reconnection()

    async def start(self) -> None:
        """
        Start the WebSocket client.

        Initiates connection and spawns the listener task to continuously
        read and queue incoming messages.
        """
        logger.info(f"Starting Finnhub WebSocket client for tickers: {self.tickers}")
        await self.connect()

        # Spawn listener task
        self.listener_task = asyncio.create_task(self._listen())
        logger.info("Listener task started")

    async def stop(self) -> None:
        """
        Gracefully stop the WebSocket client.

        - Cancels listener task
        - Unsubscribes from all tickers
        - Closes WebSocket connection
        """
        logger.info("Stopping Finnhub WebSocket client")

        # Cancel listener task
        if self.listener_task and not self.listener_task.done():
            self.listener_task.cancel()
            try:
                await self.listener_task
            except asyncio.CancelledError:
                logger.info("Listener task cancelled successfully")

        # Unsubscribe from tickers
        if self.is_connected and self.websocket:
            for ticker in self.tickers:
                unsubscribe_message = {"type": "unsubscribe", "symbol": ticker}
                try:
                    await self.websocket.send(json.dumps(unsubscribe_message))
                except Exception as e:
                    logger.error(f"Failed to unsubscribe from {ticker}: {e}")

            # Close connection
            await self.websocket.close()
            self.is_connected = False

        logger.info("Finnhub WebSocket client stopped")

    async def get_trades(self, timeout: Optional[float] = None) -> dict:
        """
        Get the next trade message from the queue.

        Non-blocking retrieval that waits for the next available trade message.
        This is the primary interface for downstream consumers.

        Args:
            timeout: Optional timeout in seconds for queue.get()

        Returns:
            Dictionary containing trade data with structure:
            {
                "type": "trade",
                "data": [
                    {
                        "s": "AAPL",          # Symbol
                        "p": 150.25,          # Price
                        "v": 100,             # Volume
                        "t": 1631234567890,   # Timestamp (ms)
                        "c": ["bid"]          # Conditions
                    }
                ]
            }

        Raises:
            asyncio.TimeoutError: If timeout is specified and exceeded
        """
        try:
            return await asyncio.wait_for(self.trade_queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning(f"No trades received within {timeout}s timeout")
            raise

    def get_queue_size(self) -> int:
        """Get current size of the trade queue."""
        return self.trade_queue.qsize()

    def is_healthy(self) -> bool:
        """Check if client is connected and listener is running."""
        return (
            self.is_connected
            and self.listener_task is not None
            and not self.listener_task.done()
        )


# Example usage and convenience function
async def create_finnhub_stream(
    api_key: str,
    tickers: List[str],
) -> FinnhubWebSocketClient:
    """
    Factory function to create and start a Finnhub WebSocket client.

    Args:
        api_key: Finnhub API key
        tickers: List of ticker symbols to stream

    Returns:
        Started FinnhubWebSocketClient instance

    Example:
        >>> client = await create_finnhub_stream(
        ...     api_key="your_api_key",
        ...     tickers=["AAPL", "GOOGL", "MSFT"]
        ... )
        >>>
        >>> # Consume trades
        >>> while True:
        ...     trade_msg = await client.get_trades(timeout=5.0)
        ...     print(f"Received {len(trade_msg['data'])} trades")
    """
    client = FinnhubWebSocketClient(api_key=api_key, tickers=tickers)
    await client.start()
    return client
