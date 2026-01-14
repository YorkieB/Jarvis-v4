# Jarvis v4 Frontend

Modern chat and voice interface for Jarvis v4 AI Assistant.

## Features

- ✅ Real-time chat interface
- ✅ Voice recording with microphone
- ✅ Socket.IO integration for real-time communication
- ✅ Audio streaming to backend
- ✅ Responsive design
- ✅ Web Speech API support (fallback)
- ✅ Connection status indicators
- ✅ Error handling and user feedback

## File Structure

```
public/
├── index.html          # Main HTML structure
├── css/
│   └── style.css      # Styling and responsive design
├── js/
│   └── app.js         # Main application logic
└── README.md          # This file
```

## How It Works

### Chat Interface

- Type messages in the input field and press Enter or click Send
- Messages are displayed in real-time
- User messages appear on the right, assistant messages on the left

### Voice Recording

1. Click the microphone button to start recording
2. Speak into your microphone
3. Audio is streamed to the server in real-time
4. Server processes audio through Deepgram (STT) → OpenAI (LLM) → ElevenLabs (TTS)
5. Responses are streamed back as audio and text

### Socket.IO Events

**Client → Server:**

- `start-audio-stream` - Begin audio streaming session
- `audio-chunk` - Send audio data chunk (ArrayBuffer)
- `end-audio-stream` - End audio streaming session

**Server → Client:**

- `transcription` - Speech-to-text result
- `llm-response` - AI-generated text response
- `audio-chunk` - Text-to-speech audio data
- `stream-ended` - Stream completion notification
- `error` - Error messages

## Browser Compatibility

- ✅ Chrome/Edge (full support)
- ✅ Firefox (full support)
- ✅ Safari (may have limited Web Speech API support)
- ⚠️ Microphone access requires HTTPS in production

## Development

The frontend is served statically by the Express server. To test:

1. Start the backend server:

   ```bash
   npm run dev
   ```

2. Open browser to:

   ```
   http://localhost:3000
   ```

3. Allow microphone access when prompted

## Troubleshooting

**Microphone not working:**

- Check browser permissions
- Ensure HTTPS in production (required for microphone access)
- Check browser console for errors

**Socket.IO connection issues:**

- Verify server is running
- Check network connectivity
- Review server logs for connection errors

**Audio playback issues:**

- Check browser audio permissions
- Verify audio codec support
- Check browser console for errors

## Future Enhancements

- [ ] React.js migration for better state management
- [ ] Wake word detection
- [ ] Multiple language support
- [ ] Voice selection UI
- [ ] Conversation history persistence
- [ ] Typing indicators
- [ ] Message timestamps
- [ ] File upload support
