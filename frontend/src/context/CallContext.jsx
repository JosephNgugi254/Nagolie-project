// context/CallContext.jsx
import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';  // <-- NEW
import { recoveryAPI } from '../services/api';
import { showToast } from '../components/common/Toast';

const CallContext = createContext();

const RINGTONE_URL = '/nagolie-iphone-call-ringtone.mp3';

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const CallProvider = ({ children }) => {
  const { user } = useAuth();
  const { socket, onlineUsers } = useSocket();  // <-- get from context
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isCallConnected, setIsCallConnected] = useState(false);
  const [ringtoneEnabled, setRingtoneEnabled] = useState(false);

  // Refs
  const peerConnections = useRef({});
  const localStream = useRef(null);
  const remoteStreams = useRef({});
  const callTimer = useRef(null);
  const ringtoneAudio = useRef(null);

  const getUserId = () => user?.id;

  // ---- Ringtone ----
  const playRingtone = () => {
    if (!ringtoneAudio.current) {
      ringtoneAudio.current = new Audio(RINGTONE_URL);
      ringtoneAudio.current.loop = true;
    }
    ringtoneAudio.current.play()
      .then(() => setRingtoneEnabled(true))
      .catch(() => {
        // Autoplay blocked – show toast and set up click listener
        showToast.warning('Tap anywhere to enable ringtone', 5000);
        const enableAudio = () => {
          ringtoneAudio.current?.play().catch(() => {});
          document.removeEventListener('click', enableAudio);
        };
        document.addEventListener('click', enableAudio);
      });
  };

  const stopRingtone = () => {
    if (ringtoneAudio.current) {
      ringtoneAudio.current.pause();
      ringtoneAudio.current.currentTime = 0;
    }
  };

  // ---- WebRTC helpers ----
  const createPeerConnection = (callId, targetUserId, isInitiator = false) => {
    const pc = new RTCPeerConnection(iceServers);

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        if (localStream.current) {
          pc.addTrack(track, localStream.current);
        }
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call_ice', {
          target_user_id: targetUserId,
          candidate: event.candidate,
          call_id: callId,
        });
      }
    };

    pc.ontrack = (event) => {
      if (!remoteStreams.current[callId]) remoteStreams.current[callId] = {};
      remoteStreams.current[callId][targetUserId] = event.streams[0];
      if (!activeCall?.isGroup) {
        setActiveCall(prev => ({
          ...prev,
          remoteStream: event.streams[0],
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setIsCallConnected(true);
        if (!callTimer.current) {
          callTimer.current = setInterval(() => {
            setCallDuration(d => d + 1);
          }, 1000);
        }
      }
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall(callId);
      }
    };

    return pc;
  };

  // ---- Start a call ----
  const startCall = useCallback(async (targetUserId, type, isGroup = false, participants = []) => {
    // Check if target is online (from onlineUsers context)
    if (!isGroup && !onlineUsers.has(targetUserId)) {
      showToast.error('User is offline');
      return;
    }

    const callId = `call_${Date.now()}`;
    const allParticipants = isGroup ? participants : [getUserId(), targetUserId];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      localStream.current = stream;

      if (isGroup) {
        const others = participants.filter(id => id !== getUserId());
        for (const pid of others) {
          const pc = createPeerConnection(callId, pid, true);
          if (!peerConnections.current[callId]) peerConnections.current[callId] = {};
          peerConnections.current[callId][pid] = pc;

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call_offer', {
            target_user_id: pid,
            call_type: type,
            offer: offer,
            call_id: callId,
            is_group: true,
            participants: allParticipants,
          });
        }
      } else {
        const pc = createPeerConnection(callId, targetUserId, true);
        peerConnections.current[callId] = { [targetUserId]: pc };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call_offer', {
          target_user_id: targetUserId,
          call_type: type,
          offer: offer,
          call_id: callId,
          is_group: false,
          participants: [getUserId(), targetUserId],
        });
      }

      setActiveCall({
        callId,
        type,
        remoteUser: { id: targetUserId },
        status: 'ringing',
        startTime: Date.now(),
        isGroup,
        participants: allParticipants,
        localStream: stream,
      });
      setIsMinimized(false);
    } catch (err) {
      console.error('Error starting call:', err);
      showToast.error('Could not access microphone/camera');
    }
  }, [socket, onlineUsers, getUserId]);

  // ---- Answer a call ----
  const answerCall = useCallback(async (callId, accept) => {
    const call = incomingCall;
    if (!call) return;

    if (!accept) {
      socket.emit('call_status', {
        target_user_id: call.callerId,
        status: 'declined',
        call_id: callId,
      });
      setIncomingCall(null);
      stopRingtone();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: call.type === 'video',
      });
      localStream.current = stream;

      const pc = createPeerConnection(callId, call.callerId, false);
      if (!peerConnections.current[callId]) peerConnections.current[callId] = {};
      peerConnections.current[callId][call.callerId] = pc;

      await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (call.isGroup && call.participants) {
        const others = call.participants.filter(id => id !== getUserId() && id !== call.callerId);
        for (const pid of others) {
          const otherPc = createPeerConnection(callId, pid, false);
          peerConnections.current[callId][pid] = otherPc;
        }
      }

      socket.emit('call_answer', {
        target_user_id: call.callerId,
        answer: answer,
        call_id: callId,
      });

      setActiveCall({
        callId,
        type: call.type,
        remoteUser: { id: call.callerId, name: call.callerName },
        status: 'connecting',
        startTime: Date.now(),
        isGroup: call.isGroup || false,
        participants: call.participants || [getUserId(), call.callerId],
        localStream: stream,
      });
      setIncomingCall(null);
      stopRingtone();
      setIsMinimized(false);
    } catch (err) {
      console.error('Error answering call:', err);
      showToast.error('Could not answer call');
    }
  }, [incomingCall, socket, getUserId]);

  // ---- End call (unchanged, but uses socket from context) ----
  const endCall = useCallback(async (callId) => {
    // ... (same as before, just uses `socket` from context)
    // I'll keep it short here, but you can copy the previous implementation.
  }, [activeCall, socket, getUserId, callDuration]);

  // ---- Add participant (unchanged) ----
  const addParticipant = useCallback(async (newUserId) => {
    // ... (same as before)
  }, [activeCall, socket]);

  // ---- Socket listeners (unchanged, but uses socket from context) ----
  useEffect(() => {
    // ... (same as before, but uses `socket` from context)
    // Ensure all event handlers use the socket variable.
  }, [socket, activeCall, incomingCall, endCall]);

  // Cleanup (unchanged)
  useEffect(() => {
    return () => {
      stopRingtone();
      if (callTimer.current) clearInterval(callTimer.current);
      Object.values(peerConnections.current).forEach(pcs => {
        Object.values(pcs).forEach(pc => pc.close());
      });
      if (localStream.current) {
        localStream.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const value = {
    activeCall,
    setActiveCall,
    incomingCall,
    setIncomingCall,
    isMinimized,
    setIsMinimized,
    callDuration,
    isCallConnected,
    startCall,
    answerCall,
    endCall,
    addParticipant,
    localStream: localStream.current,
    remoteStreams: remoteStreams.current,
    peerConnections: peerConnections.current,
    onlineUsers, // expose if needed elsewhere
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};