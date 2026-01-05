module.exports = {
  apps: [
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
