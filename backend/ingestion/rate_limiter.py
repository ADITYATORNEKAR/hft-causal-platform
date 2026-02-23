"""
Token bucket rate limiter for Alpha Vantage API integration.

This module provides asynchronous rate limiting for the Alpha Vantage free tier,
which allows 5 requests per minute. The TokenBucket class uses a refill rate of
1 token every 12 seconds to maintain compliance with API limits.
"""

import asyncio
import time
from typing import Optional

import httpx


class TokenBucket:
    """
    Asynchronous token bucket implementation for API rate limiting.
    Designed for Alpha Vantage's free tier: 5 requests per minute.

    Capacity: 5 tokens
    Refill rate: 1 token every 12 seconds
    """

    def __init__(self, capacity: int = 5, refill_rate: float = 12.0):
        """
        Initialize the token bucket.

        Args:
            capacity: Maximum number of tokens in the bucket (default: 5)
            refill_rate: Seconds between token refills (default: 12.0)
        """
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = float(capacity)
        self.last_refill = time.time()
        self._lock = asyncio.Lock()

    async def _refill(self) -> None:
        """Internal method to refill tokens based on elapsed time."""
        now = time.time()
        elapsed = now - self.last_refill

        # Calculate tokens to add based on elapsed time
        tokens_to_add = elapsed / self.refill_rate
        self.tokens = min(self.capacity, self.tokens + tokens_to_add)
        self.last_refill = now

    async def acquire(self, tokens: int = 1) -> None:
        """
        Acquire tokens from the bucket, waiting if necessary.

        This method blocks (via asyncio.sleep) until the requested number
        of tokens is available. It respects the bucket capacity and refill rate.

        Args:
            tokens: Number of tokens to acquire (default: 1)

        Raises:
            ValueError: If requested tokens exceed bucket capacity
        """
        if tokens > self.capacity:
            raise ValueError(
                f"Requested {tokens} tokens exceeds bucket capacity of {self.capacity}"
            )

        async with self._lock:
            while True:
                await self._refill()

                if self.tokens >= tokens:
                    self.tokens -= tokens
                    return

                # Calculate wait time until next token is available
                deficit = tokens - self.tokens
                wait_time = deficit * self.refill_rate

                # Release lock during sleep to allow other tasks
                await asyncio.sleep(wait_time)


# Global token bucket instance for Alpha Vantage
alpha_vantage_bucket = TokenBucket(capacity=5, refill_rate=12.0)


async def fetch_alpha_vantage_data(
    endpoint: str,
    params: dict,
    api_key: str,
    timeout: int = 30,
    retries: int = 3,
) -> Optional[dict]:
    """
    Fetch data from Alpha Vantage API with rate limiting.

    This wrapper function acquires a token from the global token bucket
    before making the API call, ensuring compliance with Alpha Vantage's
    free tier rate limits (5 requests per minute).

    Args:
        endpoint: Alpha Vantage API endpoint (e.g., 'GLOBAL_QUOTE', 'TIME_SERIES_DAILY')
        params: Query parameters for the API call (symbol, interval, etc.)
        api_key: Alpha Vantage API key
        timeout: Request timeout in seconds (default: 30)
        retries: Number of retry attempts on failure (default: 3)

    Returns:
        Dictionary containing the API response, or None if all retries failed

    Example:
        >>> data = await fetch_alpha_vantage_data(
        ...     endpoint='GLOBAL_QUOTE',
        ...     params={'symbol': 'AAPL'},
        ...     api_key='your_api_key'
        ... )
        >>> print(data)
    """
    # Acquire token before making request
    await alpha_vantage_bucket.acquire(tokens=1)

    # Prepare request parameters
    base_url = "https://www.alphavantage.co/query"
    query_params = {
        "function": endpoint,
        "apikey": api_key,
        **params,  # Merge additional parameters
    }

    async with httpx.AsyncClient() as client:
        for attempt in range(retries):
            try:
                response = await client.get(
                    base_url, params=query_params, timeout=timeout
                )
                response.raise_for_status()

                data = response.json()

                # Check for API-level errors
                if "Error Message" in data:
                    raise ValueError(f"Alpha Vantage API error: {data['Error Message']}")

                if "Note" in data:
                    raise ValueError(f"Alpha Vantage rate limit: {data['Note']}")

                return data

            except httpx.HTTPError as e:
                if attempt == retries - 1:
                    print(f"Failed to fetch data after {retries} attempts: {e}")
                    return None

                # Exponential backoff on retry
                wait_time = 2**attempt
                await asyncio.sleep(wait_time)

            except ValueError as e:
                print(f"API error: {e}")
                return None

    return None
