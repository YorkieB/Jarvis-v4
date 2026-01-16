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
    this.userId = localStorage.getItem('jarvis_userId') || null;
    this.continuousMode = localStorage.getItem('jarvis_continuous') === 'true';

    // Voice enrollment state
    this.enrollmentSamples = [];
    this.currentSampleIndex = 0;
    this.totalSamples = 3;
    this.enrollmentRecorder = null;
    this.isEnrolling = false;

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
    this.enrollVoiceBtn = document.getElementById('enrollVoiceBtn');
    this.enrollmentModal = document.getElementById('enrollmentModal');
    this.userIdInput = document.getElementById('userIdInput');
    this.recordSampleBtn = document.getElementById('recordSampleBtn');
    this.submitEnrollmentBtn = document.getElementById('submitEnrollmentBtn');
    this.cancelEnrollmentBtn = document.getElementById('cancelEnrollmentBtn');
    this.closeEnrollmentModal = document.getElementById('closeEnrollmentModal');
    this.continuousToggle = document.getElementById('continuousToggle');
    this.continuousStatus = document.getElementById('continuousStatus');
    this.sttStatus = document.getElementById('sttStatus');
    this.toastContainer = document.createElement('div');
    this.toastContainer.id = 'toastContainer';
    document.body.appendChild(this.toastContainer);

    this.init();
  }

  init() {
    this.setupSocketIO();
    this.setupEventListeners();
    this.setupSpeechRecognition();
    this.setupVoiceEnrollment();
    this.checkBrowserSupport();
    this.checkVoiceEnrollmentStatus();

    console.log('Continuous voice mode:', this.continuousMode ? 'ON' : 'OFF');
  }

  setupSocketIO() {
    // Connect to Socket.IO server with userId if available
    const socketOptions = {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      auth: {},
    };

    // Add userId to query if available
    if (this.userId) {
      socketOptions.query = { userId: this.userId };
    }

    const tenantToken = localStorage.getItem('jarvis_tenant_token');
    if (tenantToken) {
      socketOptions.auth.tenantToken = tenantToken;
    }
    if (this.userId) {
      socketOptions.auth.userId = this.userId;
    }

    this.socket = io(socketOptions);

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

    this.socket.on('audio-complete', () => {
      console.log('✅ TTS complete');
      this.updateVoiceStatus('Response finished', false);
      this.voiceButton.classList.remove('recording');
      this.isRecording = false;

      if (this.continuousMode) {
        // Auto-restart recording for continuous conversation
        setTimeout(() => {
          if (!this.isRecording) {
            this.startRecording();
          }
        }, 50);
      }
    });

    this.socket.on('tts-cancel', () => {
      console.log('⏹️ TTS canceled (barge-in)');
      this.updateVoiceStatus('Listening...', true);
      this.stopAudioPlayback();
      if (this.continuousMode && !this.isRecording) {
        setTimeout(() => this.startRecording(), 20);
      }
    });

    this.socket.on('voice-error', (data) => {
      console.warn('Voice error:', data);
      this.addMessage(
        'system',
        `Voice playback issue: ${data?.message || 'Unknown error'}`,
      );
      this.updateVoiceStatus('Voice issue', false);
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

    this.socket.on('voice-verification-failed', (data) => {
      console.warn('Voice verification failed:', data);
      this.addMessage(
        'system',
        `Voice not recognized: ${data.message || 'Unauthorized access attempt'}`,
      );
      this.updateVoiceStatus('Voice verification failed', false);
      this.stopRecording();
    });

    this.socket.on('stt-provider-changed', (data) => {
      const provider = data?.provider || 'unknown';
      const reason = data?.reason || 'failover';
      this.addMessage(
        'system',
        `Switched speech recognizer to ${provider} (${reason}).`,
      );
      this.updateVoiceStatus(`Using ${provider.toUpperCase()} STT`, true);
      this.updateSttStatus(provider);
      if (reason !== 'initial') {
        this.showToast(`Switched to ${provider.toUpperCase()} STT (${reason})`);
      }
    });
  }

  updateSttStatus(provider) {
    if (!this.sttStatus) return;
    const label = (provider || 'unknown').toUpperCase();
    this.sttStatus.textContent = `STT: ${label}`;
  }

  showToast(message) {
    if (!this.toastContainer) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    this.toastContainer.appendChild(el);
    setTimeout(() => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 300);
    }, 2500);
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

    // Voice enrollment button
    if (this.enrollVoiceBtn) {
      this.enrollVoiceBtn.addEventListener('click', () => {
        this.showEnrollmentModal();
      });
    }

    // Continuous mode toggle
    if (this.continuousToggle) {
      this.continuousToggle.addEventListener('click', () => {
        this.setContinuousMode(!this.continuousMode);
        this.refreshContinuousStatus();
      });
      this.refreshContinuousStatus();
    }

    // Enrollment modal controls
    if (this.closeEnrollmentModal) {
      this.closeEnrollmentModal.addEventListener('click', () => {
        this.hideEnrollmentModal();
      });
    }

    if (this.cancelEnrollmentBtn) {
      this.cancelEnrollmentBtn.addEventListener('click', () => {
        this.hideEnrollmentModal();
      });
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      this.stopRecording();
      this.stopAudioPlayback();
      if (this.socket) {
        this.socket.disconnect();
      }
    });
  }

  setupVoiceEnrollment() {
    if (!this.recordSampleBtn || !this.submitEnrollmentBtn) return;

    // Set user ID if stored
    if (this.userId && this.userIdInput) {
      this.userIdInput.value = this.userId;
    }

    // Update submit button when userId changes
    if (this.userIdInput) {
      this.userIdInput.addEventListener('input', () => {
        this.updateEnrollmentUI();
      });
    }

    this.recordSampleBtn.addEventListener('click', () => {
      if (this.isEnrolling) {
        this.stopEnrollmentRecording();
      } else {
        this.startEnrollmentRecording();
      }
    });

    this.submitEnrollmentBtn.addEventListener('click', () => {
      this.submitEnrollment();
    });
  }

  async checkVoiceEnrollmentStatus() {
    if (!this.userId) return;

    try {
      const tenantToken = localStorage.getItem('jarvis_tenant_token');
      const headers = tenantToken ? { 'x-tenant-token': tenantToken } : {};
      const response = await fetch(`/api/voice/status/${this.userId}`, {
        headers,
      });
      const data = await response.json();

      if (data.hasVoiceprint) {
        this.addMessage(
          'system',
          '✅ Your voice is enrolled. Jarvis will only respond to you.',
        );
      } else {
        this.addMessage(
          'system',
          '⚠️ Voice not enrolled. Click "Enroll Voice" to set up voice authentication.',
        );
      }
    } catch (error) {
      console.error('Failed to check voice status:', error);
    }
  }

  showEnrollmentModal() {
    if (this.enrollmentModal) {
      this.enrollmentModal.style.display = 'flex';
      this.enrollmentSamples = [];
      this.currentSampleIndex = 0;
      this.updateEnrollmentUI();
    }
  }

  hideEnrollmentModal() {
    if (this.enrollmentModal) {
      this.enrollmentModal.style.display = 'none';
      if (this.isEnrolling) {
        this.stopEnrollmentRecording();
      }
    }
  }

  updateEnrollmentUI() {
    const currentSampleEl = document.getElementById('currentSample');
    const totalSamplesEl = document.getElementById('totalSamples');
    const samplesContainer = document.getElementById('enrollmentSamples');

    if (currentSampleEl)
      currentSampleEl.textContent = this.currentSampleIndex + 1;
    if (totalSamplesEl) totalSamplesEl.textContent = this.totalSamples;

    if (samplesContainer) {
      samplesContainer.innerHTML = '';
      for (let i = 0; i < this.enrollmentSamples.length; i++) {
        const sampleDiv = document.createElement('div');
        sampleDiv.className = 'sample-item';
        sampleDiv.innerHTML = `
                    <span>Sample ${i + 1}</span>
                    <span class="sample-duration">${(this.enrollmentSamples[i].duration / 1000).toFixed(1)}s</span>
                    <button class="remove-sample" data-index="${i}">Remove</button>
                `;
        samplesContainer.appendChild(sampleDiv);
      }

      // Add remove handlers
      samplesContainer.querySelectorAll('.remove-sample').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.target.dataset.index);
          this.enrollmentSamples.splice(index, 1);
          this.updateEnrollmentUI();
        });
      });
    }

    // Update submit button state
    if (this.submitEnrollmentBtn) {
      this.submitEnrollmentBtn.disabled =
        this.enrollmentSamples.length < 3 || !this.userIdInput?.value;
    }
  }

  async startEnrollmentRecording() {
    if (!this.userIdInput?.value) {
      alert('Please enter your user ID first');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.enrollmentRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      const chunks = [];
      const startTime = Date.now();

      this.enrollmentRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      this.enrollmentRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const duration = Date.now() - startTime;
        const blob = new Blob(chunks, { type: 'audio/webm' });

        this.enrollmentSamples.push({
          blob,
          duration,
        });

        this.updateEnrollmentUI();
        this.isEnrolling = false;

        if (this.recordSampleBtn) {
          this.recordSampleBtn.textContent = 'Start Recording Sample';
          this.recordSampleBtn.classList.remove('recording');
        }
      };

      this.enrollmentRecorder.start();
      this.isEnrolling = true;

      if (this.recordSampleBtn) {
        this.recordSampleBtn.textContent = 'Stop Recording';
        this.recordSampleBtn.classList.add('recording');
      }
    } catch (error) {
      console.error('Failed to start enrollment recording:', error);
      alert('Failed to access microphone. Please check permissions.');
    }
  }

  stopEnrollmentRecording() {
    if (this.enrollmentRecorder && this.isEnrolling) {
      this.enrollmentRecorder.stop();
    }
  }

  async submitEnrollment() {
    if (!this.userIdInput?.value) {
      alert('Please enter your user ID');
      return;
    }

    if (this.enrollmentSamples.length < 3) {
      alert('Please record at least 3 samples');
      return;
    }

    const userId = this.userIdInput.value;
    this.userId = userId;
    localStorage.setItem('jarvis_userId', userId);

    try {
      // Convert blobs to base64
      const audioSamples = await Promise.all(
        this.enrollmentSamples.map((sample) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result.split(',')[1];
              resolve(base64);
            };
            reader.readAsDataURL(sample.blob);
          });
        }),
      );

      const tenantToken = localStorage.getItem('jarvis_tenant_token');
      const response = await fetch('/api/voice/enroll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenantToken ? { 'x-tenant-token': tenantToken } : {}),
        },
        body: JSON.stringify({
          userId,
          audioSamples,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(
          'Voice enrolled successfully! Jarvis will now only respond to your voice.',
        );
        this.hideEnrollmentModal();
        this.addMessage(
          'system',
          '✅ Voice enrollment completed successfully!',
        );
      } else {
        alert(`Enrollment failed: ${data.message || data.error}`);
      }
    } catch (error) {
      console.error('Enrollment submission failed:', error);
      alert('Failed to submit enrollment. Please try again.');
    }
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
        if (!this.continuousMode) {
          this.updateVoiceStatus('Stream completed', false);
        }
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
      if (!this.audioPlayer) {
        this.audioPlayer = new Audio();
      }
      this.audioPlayer.src = audioUrl;
      this.audioPlayer.play().catch((error) => {
        console.error('Error playing audio:', error);
      });
    } catch (error) {
      console.error('Error processing audio chunk:', error);
    }
  }

  stopAudioPlayback() {
    if (this.audioPlayer) {
      try {
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
      } catch (e) {
        console.warn('Failed to stop audio player', e);
      }
    }
  }

  setContinuousMode(enabled) {
    this.continuousMode = enabled;
    localStorage.setItem('jarvis_continuous', enabled ? 'true' : 'false');
    console.log('Continuous voice mode set to', enabled);
    this.refreshContinuousStatus();
  }

  refreshContinuousStatus() {
    if (this.continuousStatus) {
      this.continuousStatus.textContent = this.continuousMode
        ? 'Continuous: ON'
        : 'Continuous: OFF';
      this.continuousStatus.className = this.continuousMode
        ? 'pill on'
        : 'pill off';
    }
    if (this.continuousToggle) {
      this.continuousToggle.textContent = this.continuousMode
        ? 'Disable Continuous'
        : 'Enable Continuous';
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
