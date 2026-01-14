/**
 * Jarvis v4 Frontend Application
 * Handles chat interface, Socket.IO communication, and voice recording
 */

class JarvisApp {
  constructor() {
    this.socket = null;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recognition = null;
    this.isConnected = false;

    // DOM elements
    this.messagesContainer = document.getElementById('messages');
    this.messageInput = document.getElementById('messageInput');
    this.sendButton = document.getElementById('sendButton');
    this.voiceButton = document.getElementById('voiceButton');
    this.voiceStatus = document.getElementById('voiceStatus');
    this.voiceStatusText = document.getElementById('voiceStatusText');
    this.connectionStatus = document.getElementById('connectionStatus');
    this.statusDot = this.connectionStatus.querySelector('.status-dot');
    this.statusText = this.connectionStatus.querySelector('.status-text');

    this.init();
  }

  init() {
    this.setupSocketIO();
    this.setupEventListeners();
    this.setupSpeechRecognition();
    this.checkBrowserSupport();
  }

  setupSocketIO() {
    // Connect to Socket.IO server
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ Connected to server');
      this.isConnected = true;
      this.updateConnectionStatus('connected', 'Connected');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
      this.isConnected = false;
      this.updateConnectionStatus('disconnected', 'Disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.updateConnectionStatus('disconnected', 'Connection Error');
    });

    // Audio streaming events
    this.socket.on('transcription', (data) => {
      console.log('📝 Transcription received:', data);
      if (data.transcript) {
        this.addMessage('user', data.transcript);
        this.updateVoiceStatus('Transcription received', false);
      }
    });

    this.socket.on('llm-response', (data) => {
      console.log('🤖 LLM response:', data);
      if (data.response) {
        this.addMessage('assistant', data.response);
      }
    });

    this.socket.on('audio-chunk', (data) => {
      console.log('🔊 Audio chunk received');
      this.playAudioChunk(data.audio);
    });

    this.socket.on('stream-ended', () => {
      console.log('✅ Stream ended');
      this.updateVoiceStatus('Stream completed', false);
      this.isRecording = false;
      this.voiceButton.classList.remove('recording');
    });

    this.socket.on('error', (error) => {
      console.error('❌ Server error:', error);
      this.addMessage(
        'system',
        `Error: ${error.message || 'An error occurred'}`,
      );
      this.updateVoiceStatus('Error occurred', false);
      this.stopRecording();
    });
  }

  setupEventListeners() {
    // Send button
    this.sendButton.addEventListener('click', () => this.sendMessage());

    // Enter key to send
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Voice button
    this.voiceButton.addEventListener('click', () => {
      if (this.isRecording) {
        this.stopRecording();
      } else {
        this.startRecording();
      }
    });
  }

  setupSpeechRecognition() {
    // Check if Web Speech API is available
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('🎤 Speech recognized:', transcript);
        this.messageInput.value = transcript;
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        this.addMessage('system', `Speech recognition error: ${event.error}`);
      };
    }
  }

  checkBrowserSupport() {
    const issues = [];

    if (!this.socket) {
      issues.push('Socket.IO not loaded');
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      issues.push('Microphone access not available');
    }

    if (!this.recognition) {
      issues.push(
        'Web Speech API not available (voice input will use server transcription)',
      );
    }

    if (issues.length > 0) {
      console.warn('⚠️ Browser compatibility issues:', issues);
    }
  }

  updateConnectionStatus(status, text) {
    this.statusDot.className = 'status-dot ' + status;
    this.statusText.textContent = text;
  }

  addMessage(role, content, timestamp = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const paragraphs = content.split('\n').filter((p) => p.trim());
    paragraphs.forEach((p) => {
      const pEl = document.createElement('p');
      pEl.textContent = p;
      contentDiv.appendChild(pEl);
    });

    if (timestamp) {
      const timeEl = document.createElement('div');
      timeEl.className = 'message-timestamp';
      timeEl.textContent = new Date(timestamp).toLocaleTimeString();
      contentDiv.appendChild(timeEl);
    }

    messageDiv.appendChild(contentDiv);
    this.messagesContainer.appendChild(messageDiv);

    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message || !this.isConnected) return;

    // Add user message to UI
    this.addMessage('user', message);
    this.messageInput.value = '';

    // Send to server via Socket.IO
    // Note: You may need to implement a chat message handler on the server
    // For now, we'll use the audio streaming pipeline
    console.log('📤 Sending message:', message);

    // If server has a chat endpoint, use it:
    // this.socket.emit('chat-message', { message });

    // Otherwise, show a placeholder response
    setTimeout(() => {
      this.addMessage(
        'assistant',
        'I received your message. Voice conversation is available via the microphone button.',
      );
    }, 500);
  }

  async startRecording() {
    if (!this.isConnected) {
      this.addMessage('system', 'Not connected to server. Please wait...');
      return;
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Initialize MediaRecorder
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          // Send audio chunk to server
          this.sendAudioChunk(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        this.socket.emit('end-audio-stream');
        console.log('🛑 Recording stopped');
      };

      // Start recording
      this.mediaRecorder.start(100); // Send chunks every 100ms
      this.isRecording = true;
      this.voiceButton.classList.add('recording');
      this.updateVoiceStatus('Recording... Speak now', true);

      // Notify server
      this.socket.emit('start-audio-stream');
      console.log('🎤 Recording started');
    } catch (error) {
      console.error('❌ Error starting recording:', error);
      this.addMessage('system', `Failed to start recording: ${error.message}`);
      this.updateVoiceStatus('Recording failed', false);
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      this.voiceButton.classList.remove('recording');
      this.updateVoiceStatus('Processing...', true);
    }
  }

  sendAudioChunk(audioBlob) {
    if (!this.isConnected) return;

    // Convert blob to ArrayBuffer for transmission
    // The backend expects Buffer | ArrayBuffer directly
    const reader = new FileReader();
    reader.onloadend = () => {
      const arrayBuffer = reader.result;
      // Send ArrayBuffer directly (Socket.IO will handle binary data)
      this.socket.emit('audio-chunk', arrayBuffer);
    };
    reader.readAsArrayBuffer(audioBlob);
  }

  playAudioChunk(audioData) {
    // Convert base64/ArrayBuffer to audio and play
    try {
      const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play().catch((error) => {
        console.error('Error playing audio:', error);
      });
    } catch (error) {
      console.error('Error processing audio chunk:', error);
    }
  }

  updateVoiceStatus(text, show) {
    this.voiceStatusText.textContent = text;
    this.voiceStatus.style.display = show ? 'flex' : 'none';
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new JarvisApp();
  });
} else {
  new JarvisApp();
}
