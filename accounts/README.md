# Accounts Worker

Optional. It lets people keep their cosmetics tracking on an account and use it on several devices. Without it, the site works the same and tracking stays in each person's browser, with export and import.

## What it stores

- A Discord user id, display name and avatar reference. No email and no password.
- The marks a person makes: owned, wishlist, favorite, alert, Battle Pass tier, mythic option and claimed drop.
- A hash of each session token, so a copy of the database can't be used to sign in.

Anyone can delete their account from the Collection page, which removes all of it.

This service doesn't know what anyone really owns in the game, and it never asks Discord for anything beyond `identify`.

## Set it up

You need the same Cloudflare account as the timer in `timer/`, and a Discord account.

1. **Create the database**, then paste the id it prints into `database_id` in `wrangler.toml`:

   ```bash
   npx wrangler d1 create ow2-accounts
   ```

2. **Create the tables:**

   ```bash
   npx wrangler d1 migrations apply ow2-accounts --remote
   ```

3. **Deploy once** to learn the Worker's address, which looks like `https://ow2-accounts.<your-subdomain>.workers.dev`:

   ```bash
   npx wrangler deploy
   ```

4. **Create a Discord application** at https://discord.com/developers/applications:
   - Under **OAuth2**, add the redirect `https://ow2-accounts.<your-subdomain>.workers.dev/auth/discord/callback`.
   - Copy the **Client ID** into `DISCORD_CLIENT_ID` in `wrangler.toml`, and put that same redirect address in `CALLBACK_URL`.
   - Reset and copy the **Client Secret**. Keep it out of any file, and paste it only at this prompt:

   ```bash
   npx wrangler secret put DISCORD_CLIENT_SECRET
   ```

5. **Deploy again:**

   ```bash
   npx wrangler deploy
   ```

6. **Turn it on for the site.** On GitHub, open **Settings → Secrets and variables → Actions → Variables**, add `ACCOUNT_API_URL` with the Worker's address, then run **Actions → Deploy Vite site to Pages → Run workflow**. A "Sign in with Discord" button then appears on the Collection page.

## Limits

Cloudflare's free plan allows 100,000 D1 writes a day. Each mark is one write, and requests are rate limited per person and per address. Old sessions and sign-in records are cleared at each sign-in.

## Test

```bash
npm run test:accounts
```

The tests run the real SQL migration on SQLite, with Discord faked.
