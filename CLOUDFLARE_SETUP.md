# Cloudflare Workers setup for Holo Apex

The API is deployed separately from the static GitHub Pages frontend. The Worker is named `holo-apex-api`.

## 1. Cloudflare account and deployment token

1. Create or use a Cloudflare account and keep the Workers plan on Free.
2. Create an API token for Workers deployment. For a first deployment that creates the Worker, Cloudflare requires Admin access at the Workers product scope. If you create the Worker named `holo-apex-api` manually first, a token scoped to that Worker with Editor access is sufficient.
3. Copy the Cloudflare Account ID from the account overview.

Do not paste the API token into chat or commit it to Git.

## 2. GitHub Actions credentials

In the GitHub repository, open **Settings → Secrets and variables → Actions** and add:

- Repository secret `CLOUDFLARE_API_TOKEN`: the Cloudflare API token.
- Repository variable `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare Account ID.

The workflow validates the Worker on pull requests. It deploys only after changes reach `main` and the Cloudflare credentials are configured.

## 3. Worker runtime configuration

In Cloudflare **Workers & Pages → holo-apex-api → Settings → Variables and Secrets**, configure:

- Secret `GEMINI_API_KEY`: the Gemini API key used by AI routes.
- Variable `SUPABASE_URL`: the URL of the Holo Apex Supabase project.
- Secret `SUPABASE_SERVICE_ROLE_KEY`: the service-role key for that same Supabase project.

The Firebase Web API key, Supabase table name, and allowed GitHub Pages origin are already configured in `wrangler.jsonc`. The service-role key must remain a Worker secret; never put it in frontend variables.

## 4. Connect the frontend to the deployed Worker

After the first successful Worker deployment, copy the `workers.dev` URL from the GitHub Actions deployment log. In GitHub **Settings → Secrets and variables → Actions → Variables**, add:

- `VITE_API_BASE_URL`: the full Worker URL, for example `https://holo-apex-api.<your-subdomain>.workers.dev` (replace the example with the exact deployed URL).

Then run the **Deploy Holo Apex to GitHub Pages** workflow again so the frontend build embeds the API URL.

## 5. Verify

- Open `https://<your-worker-url>/api/health`; the response should report `status: "ok"`.
- Open the application and test live FX, one AI route, and Supabase status/sync.
- Do not use production financial data for the first test. Use a test workspace and verify a backup before enabling routine sync.

## Free-plan constraints

Cloudflare Workers Free currently allows 100,000 requests per day and 10 ms CPU time per request. Network waiting time is not CPU time, but parsing large image payloads and other CPU-heavy requests must be tested against the 10 ms limit. Gemini usage and any Gemini billing/quota are separate from Cloudflare Workers pricing.
