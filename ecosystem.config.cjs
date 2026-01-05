module.exports = {
  apps: [
    // Batch 4: Creative Media Agents
    { 
      name: 'music-generation-agent', 
      script: './dist/agents/music-generation/index.js', 
      instances: 1 
    },
    { 
      name: 'image-generation-agent', 
      script: './dist/agents/image-generation/index.js', 
      instances: 1 
    },
    { 
      name: 'podcast-generation-agent', 
      script: './dist/agents/podcast-generation/index.js', 
      instances: 1 
    },
    { 
      name: 'creative-memory-agent', 
      script: './dist/agents/creative-memory/index.js', 
      instances: 1 
    }
  ]
};
