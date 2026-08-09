const API_URL =
  'https://script.google.com/macros/s/AKfycbyddXsu8aS1TzqzX8PXDWrfUBS8zYKukI7QVM9rTRpxVLnsLcUeMzKevoAn7RWHnml0Nw/exec';

/**
 * Fetches the full inventory list from the Apps Script API.
 * Throws on network failure, non-2xx response, or an API-reported error
 * payload (the backend returns { error: true, message } on failure).
 */
export async function fetchInventory() {
  const res = await fetch(API_URL, { method: 'GET' });

  if (!res.ok) {
    throw new Error(`API request failed (HTTP ${res.status}).`);
  }

  const data = await res.json();

  if (data && data.error) {
    throw new Error(data.message || 'The inventory API returned an error.');
  }

  if (!Array.isArray(data)) {
    throw new Error('Unexpected API response shape (expected an array).');
  }

  return data;
}
