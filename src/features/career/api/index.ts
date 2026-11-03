import { createOverfastProvider } from './provider';
import { CareerStore, type StorageLike } from './store';

export const OVERFAST_URL = 'https://overfast-api.tekrop.fr';

// Set VITE_CAREER_API_URL at build time to route through the Cloudflare Worker in /worker.
// Without it the site talks to OverFast directly, which its CORS policy allows.
const workerUrl = (import.meta.env.VITE_CAREER_API_URL ?? '').trim().replace(/\/+$/, '');

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const careerStore = new CareerStore(
  createOverfastProvider(workerUrl ? { baseUrl: workerUrl, fallbackUrl: OVERFAST_URL } : { baseUrl: OVERFAST_URL }),
  { storage: browserStorage() },
);
