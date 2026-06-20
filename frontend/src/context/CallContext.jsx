// context/CallContext.jsx
import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { recoveryAPI } from '../services/api';
import { showToast } from '../components/common/Toast';

const CallContext = createContext();

const RINGTONE_URL = '/nagolie-iphone-call-ringtone.mp3';

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Add TURN servers if needed for production
  ],
};

export const CallProvider = ({ children, socket }) => {
  const { user } = useAuth();
  const [activeCall, setActiveCall] = useState(null); // { callId, type, remoteUser, status, startTime, isGroup, participants }
  const [incomingCall, setIncomingCall] = useState(null); // { callId, callerId, callerName, type, offer, participants }
  const [isMinimized, setIsMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isCallConnected, setIsCallConnected] = useState(false);

  // Refs for WebRTC
  const peerConnections = useRef({}); // callId -> { [userId]: RTCPeerConnection }
  const localStream = useRef(null);
  const remoteStreams = useRef({}); // callId -> { [userId]: MediaStream }
  const callTimer = useRef(null);
  const ringtoneAudio = useRef(null);

  // Helper to get current user ID
  const getUserId = () => user?.id;

  // ---- Ringtone ----
  const playRingtone = () => {
    if (!ringtoneAudio.current) {
      ringtoneAudio.current = new Audio(RINGTONE_URL);
      ringtoneAudio.current.loop = true;
    }
    ringtoneAudio.current.play().catch(() => {});
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

    // Add local tracks if we have them
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
      // Store remote stream
      if (!remoteStreams.current[callId]) remoteStreams.current[callId] = {};
      remoteStreams.current[callId][targetUserId] = event.streams[0];
      // If this is a 1‑on‑1 call, we can set it as the main remote stream
      if (!activeCall?.isGroup) {
        // Update activeCall with remote stream (to be used in CallScreen)
        setActiveCall(prev => ({
          ...prev,
          remoteStream: event.streams[0],
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setIsCallConnected(true);
        // Start timer if not started
        if (!callTimer.current) {
          callTimer.current = setInterval(() => {
            setCallDuration(d => d + 1);
          }, 1000);
        }
      }
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        // End call
        endCall(callId);
      }
    };

    return pc;
  };

  // ---- Start a call ----
  const startCall = useCallback(async (targetUserId, type, isGroup = false, participants = []) => {
    // Check if target is online
    // We'll rely on onlineUsers from parent (passed via context or prop)
    // For now, we'll assume we have a function to check
    // We'll handle offline check in the component

    const callId = `call_${Date.now()}`;
    const allParticipants = isGroup ? participants : [getUserId(), targetUserId];

    try {
      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      localStream.current = stream;

      // Create peer connection for each participant (for group, we'll create per participant)
      if (isGroup) {
        // For group, we connect to each participant (except self)
        const others = participants.filter(id => id !== getUserId());
        for (const pid of others) {
          const pc = createPeerConnection(callId, pid, true);
          if (!peerConnections.current[callId]) peerConnections.current[callId] = {};
          peerConnections.current[callId][pid] = pc;

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          // Send offer to that participant
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
        // 1‑on‑1
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

      // Set active call
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
      // Play local ringback tone? We'll just show "Calling..."
    } catch (err) {
      console.error('Error starting call:', err);
      showToast.error('Could not access microphone/camera');
    }
  }, [socket, getUserId]);

  // ---- Answer a call ----
  const answerCall = useCallback(async (callId, accept) => {
    const call = incomingCall;
    if (!call) return;

    if (!accept) {
      // Decline
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
      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: call.type === 'video',
      });
      localStream.current = stream;

      // Create peer connection to the caller
      const pc = createPeerConnection(callId, call.callerId, false);
      if (!peerConnections.current[callId]) peerConnections.current[callId] = {};
      peerConnections.current[callId][call.callerId] = pc;

      await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // If group, we also need to connect to other participants
      if (call.isGroup && call.participants) {
        const others = call.participants.filter(id => id !== getUserId() && id !== call.callerId);
        for (const pid of others) {
          const otherPc = createPeerConnection(callId, pid, false);
          peerConnections.current[callId][pid] = otherPc;
          // We'll send offers to others after we answer the caller
          // For simplicity, we'll let the caller handle distributing offers to others
          // Or we can emit call_answer to the caller, who then sends offers to others
        }
      }

      socket.emit('call_answer', {
        target_user_id: call.callerId,
        answer: answer,
        call_id: callId,
      });

      // Set active call
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

  // ---- End call ----
  const endCall = useCallback(async (callId) => {
    // Stop timer
    if (callTimer.current) {
      clearInterval(callTimer.current);
      callTimer.current = null;
    }

    // Close all peer connections
    if (peerConnections.current[callId]) {
      Object.values(peerConnections.current[callId]).forEach(pc => pc.close());
      delete peerConnections.current[callId];
    }

    // Stop local tracks
    if (localStream.current) {
      localStream.current.getTracks().forEach(t => t.stop());
      localStream.current = null;
    }

    // Clean remote streams
    delete remoteStreams.current[callId];

    // Save call log
    const active = activeCall;
    if (active) {
      const duration = Math.floor((Date.now() - active.startTime) / 1000);
      try {
        await recoveryAPI.saveCallLog({
          call_type: active.type,
          status: 'ended',
          started_at: new Date(active.startTime).toISOString(),
          ended_at: new Date().toISOString(),
          duration_seconds: duration,
          caller_id: getUserId(),
          callee_id: active.isGroup ? null : active.remoteUser.id,
          is_group: active.isGroup,
          participants: active.participants,
        });
        // Optionally, add a system message to chat
        // We'll emit a message via socket or call an API
      } catch (err) {
        console.error('Failed to save call log:', err);
      }
    }

    // Notify others
    const participants = active?.participants || [];
    socket.emit('call_end', {
      call_id: callId,
      participants: participants,
      duration: callDuration,
    });

    // Reset state
    setActiveCall(null);
    setIsCallConnected(false);
    setCallDuration(0);
    setIsMinimized(false);
    stopRingtone();
  }, [activeCall, socket, getUserId, callDuration]);

  // ---- Add participant (group) ----
  const addParticipant = useCallback(async (newUserId) => {
    if (!activeCall || !activeCall.isGroup) return;
    const callId = activeCall.callId;
    // Create a new peer connection for this participant
    const pc = createPeerConnection(callId, newUserId, true);
    if (!peerConnections.current[callId]) peerConnections.current[callId] = {};
    peerConnections.current[callId][newUserId] = pc;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit('call_add_participant', {
      new_user_id: newUserId,
      call_id: callId,
      call_type: activeCall.type,
      existing_participants: activeCall.participants,
      offer: offer,
    });

    // Update participants list
    setActiveCall(prev => ({
      ...prev,
      participants: [...prev.participants, newUserId],
    }));
  }, [activeCall, socket]);

  // ---- Socket listeners ----
  useEffect(() => {
    if (!socket) return;

    const onCallOffer = (data) => {
      // We are the callee
      const { caller_id, caller_name, call_type, offer, call_id, is_group, participants } = data;
      // Check if we are already in a call
      if (activeCall) {
        socket.emit('call_status', {
          target_user_id: caller_id,
          status: 'busy',
          call_id: call_id,
        });
        return;
      }

      // Check if caller is in our contacts? We'll accept any.
      setIncomingCall({
        callId: call_id,
        callerId: caller_id,
        callerName: caller_name || 'Unknown',
        type: call_type,
        offer: offer,
        isGroup: is_group || false,
        participants: participants || [caller_id],
      });
      playRingtone();
    };

    const onCallAnswer = (data) => {
      const { answerer_id, answer, call_id } = data;
      const pc = peerConnections.current[call_id]?.[answerer_id];
      if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(answer));
        // Update status
        setActiveCall(prev => ({
          ...prev,
          status: 'connected',
          remoteUser: { ...prev.remoteUser, id: answerer_id },
        }));
        // If group, we may need to send offers to other participants
      }
    };

    const onCallIce = (data) => {
      const { sender_id, candidate, call_id } = data;
      const pc = peerConnections.current[call_id]?.[sender_id];
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const onCallEnded = (data) => {
      const { call_id } = data;
      if (activeCall && activeCall.callId === call_id) {
        endCall(call_id);
        showToast.info('Call ended by other party');
      }
    };

    const onCallStatus = (data) => {
      const { status, call_id } = data;
      if (activeCall && activeCall.callId === call_id) {
        if (status === 'declined') {
          endCall(call_id);
          showToast.info('Call declined');
        } else if (status === 'busy') {
          endCall(call_id);
          showToast.info('User is busy');
        } else if (status === 'unavailable') {
          endCall(call_id);
          showToast.info('User is unavailable');
        }
      }
    };

    const onCallInvite = (data) => {
      // We are invited to a group call
      const { call_id, inviter_id, inviter_name, call_type, existing_participants, offer } = data;
      // We can auto-answer or show a prompt
      // For simplicity, auto-answer if not in a call
      if (!activeCall && !incomingCall) {
        // We'll treat as incoming call but with group info
        setIncomingCall({
          callId: call_id,
          callerId: inviter_id,
          callerName: inviter_name || 'Inviter',
          type: call_type,
          offer: offer,
          isGroup: true,
          participants: existing_participants,
        });
        playRingtone();
      } else {
        // Decline
        socket.emit('call_status', {
          target_user_id: inviter_id,
          status: 'busy',
          call_id: call_id,
        });
      }
    };

    socket.on('call_offer', onCallOffer);
    socket.on('call_answer', onCallAnswer);
    socket.on('call_ice', onCallIce);
    socket.on('call_ended', onCallEnded);
    socket.on('call_status', onCallStatus);
    socket.on('call_invite', onCallInvite);

    return () => {
      socket.off('call_offer', onCallOffer);
      socket.off('call_answer', onCallAnswer);
      socket.off('call_ice', onCallIce);
      socket.off('call_ended', onCallEnded);
      socket.off('call_status', onCallStatus);
      socket.off('call_invite', onCallInvite);
    };
  }, [socket, activeCall, incomingCall, endCall]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRingtone();
      if (callTimer.current) clearInterval(callTimer.current);
      // Close all peer connections
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