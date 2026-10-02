# Free AI App (secure version)

Keys stay on the server. Browser never sees them.

## Run locally
1. `npm install`
2. Create a `.env` file with GROQ_API_KEY=, GEMINI_API_KEY=, OPENROUTER_API_KEY= 
3. Run `node --env-file=.env server.js` (Node 20.6+), then open http://localhost:3000

## Deploy (Render / Railway)
- Upload this folder to your private GitHub repo (without .env)
- New Web Service -> connect repo -> Build: `npm install` -> Start: `npm start`
- Add GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY under Environment Variables

## Before selling
- Check each provider's Terms for commercial use
- Add login + payments (next step)
