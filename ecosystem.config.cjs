module.exports = {
  apps: [
    // Orchestrator
    { 
      name: 'orchestrator', 
      script: './dist/orchestrator/index.js', 
      instances: 1,
      env: { 
        PORT: 3000,
        NODE_ENV: 'production'
      }
    },
    
    // Batch 1: Core Conversational
    { 
      name: 'dialogue-agent', 
      script: './dist/agents/dialogue/index.js', 
      instances: 2 
    },
    { 
      name: 'voice-agent', 
      script: './dist/agents/voice/index.js', 
      instances: 1 
    },
    { 
      name: 'knowledge-agent', 
      script: './dist/agents/knowledge/index.js', 
      instances: 2 
    },
    { 
      name: 'web-agent', 
      script: './dist/agents/web/index.js', 
      instances: 1 
    },
    { 
      name: 'spotify-agent', 
      script: './dist/agents/spotify/index.js', 
      instances: 1 
    },
    { 
      name: 'self-healing-agent', 
      script: './dist/agents/self-healing/index.js', 
      instances: 1 
    },
    
    // Batch 2: Personal Finance
    { 
      name: 'finance-agent', 
      script: './dist/agents/finance/index.js', 
      instances: 1 
    },
    { 
      name: 'savings-agent', 
      script: './dist/agents/savings/index.js', 
      instances: 1 
    },
    { 
      name: 'insights-agent', 
      script: './dist/agents/insights/index.js', 
      instances: 1 
    },
    { 
      name: 'alert-agent', 
      script: './dist/agents/alert/index.js', 
      instances: 1 
    },
    { 
      name: 'privacy-agent', 
      script: './dist/agents/privacy/index.js', 
      instances: 1 
    }
  ]
};
