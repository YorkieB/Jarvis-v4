const fs = require('fs');
const path = require('path');

// Read and parse .env file
const envPath = path.join(__dirname, '.env');
const envVars = { NODE_ENV: 'production' };

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    line = line.trim();
    if (line && !line.startsWith('#') && line.includes('=')) {
      const equalsIndex = line.indexOf('=');
      const key = line.substring(0, equalsIndex).trim();
      let value = line.substring(equalsIndex + 1).trim();

      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      envVars[key] = value;
    }
  });
  console.log(
    `✅ Loaded ${Object.keys(envVars).length} environment variables from .env`
  );
} else {
  console.warn(`⚠️  .env file not found at ${envPath}`);
}

module.exports = {
  apps: [
    // Orchestrator
    {
      name: 'orchestrator',
      script: './dist/orchestrator/index.js',
      instances: 1,
      env: {
        ...envVars,
        PORT: process.env.PORT || envVars.PORT || 3000,
      },
    },

    // Batch 1: Core Conversational
    {
      name: 'dialogue-agent',
      script: './dist/agents/dialogue/index.js',
      instances: 2,
      env: envVars,
    },
    {
      name: 'voice-agent',
      script: './dist/agents/voice/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'knowledge-agent',
      script: './dist/agents/knowledge/index.js',
      instances: 2,
      env: envVars,
    },
    {
      name: 'web-agent',
      script: './dist/agents/web/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'spotify-agent',
      script: './dist/agents/spotify/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'self-healing-agent',
      script: './dist/agents/self-healing/index.js',
      instances: 1,
      env: envVars,
    },

    // Batch 2: Personal Finance
    {
      name: 'finance-agent',
      script: './dist/agents/finance/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'savings-agent',
      script: './dist/agents/savings/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'insights-agent',
      script: './dist/agents/insights/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'alert-agent',
      script: './dist/agents/alert/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'privacy-agent',
      script: './dist/agents/privacy/index.js',
      instances: 1,
      env: envVars,
    },

    // Batch 3: Computer Control
    {
      name: 'windows-control-agent',
      script: './dist/agents/windows-control/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'browser-control-agent',
      script: './dist/agents/browser-control/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'document-control-agent',
      script: './dist/agents/document-control/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'email-control-agent',
      script: './dist/agents/email-control/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'calendar-control-agent',
      script: './dist/agents/calendar-control/index.js',
      instances: 1,
      env: envVars,
    },

    // Batch 4: Creative Media
    {
      name: 'music-generation-agent',
      script: './dist/agents/music-generation/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'image-generation-agent',
      script: './dist/agents/image-generation/index.js',
      instances: 1,
      max_memory_restart: '2G',
      env: envVars,
    },
    {
      name: 'podcast-generation-agent',
      script: './dist/agents/podcast-generation/index.js',
      instances: 1,
      env: envVars,
    },
    {
      name: 'creative-memory-agent',
      script: './dist/agents/creative-memory/index.js',
      instances: 1,
      env: envVars,
    },
  ],
};
