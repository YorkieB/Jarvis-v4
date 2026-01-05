module.exports = {
  apps: [
    // Batch 3: Computer Control
    { 
      name: 'windows-control-agent', 
      script: './dist/agents/windows-control/index.js', 
      instances: 1 
    },
    { 
      name: 'browser-control-agent', 
      script: './dist/agents/browser-control/index.js', 
      instances: 1 
    },
    { 
      name: 'document-control-agent', 
      script: './dist/agents/document-control/index.js', 
      instances: 1 
    },
    { 
      name: 'email-control-agent', 
      script: './dist/agents/email-control/index.js', 
      instances: 1 
    },
    { 
      name: 'calendar-control-agent', 
      script: './dist/agents/calendar-control/index.js', 
      instances: 1 
    }
  ]
};
