// context/CallContext.jsx
import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
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
  const { socket, onlineUsers } = useSocket();
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isCallConnected, setIsCallConnected] = useState(false);
  const [ringtoneEnabled, setRingtoneEnabled] = useState(false);

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
            caller_name: user.username, // ✅ pass caller name
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
          caller_name: user.username, // ✅ pass caller name
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
  }, [socket, onlineUsers, getUserId, user]);

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

  // ---- End call (full implementation) ----
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

  // ---- Add participant ----
  const addParticipant = useCallback(async (newUserId) => {
    if (!activeCall || !activeCall.isGroup) return;
    const callId = activeCall.callId;
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

    setActiveCall(prev => ({
      ...prev,
      participants: [...prev.participants, newUserId],
    }));
  }, [activeCall, socket]);

  // ---- Socket listeners ----
  useEffect(() => {
    if (!socket) return;

    const onCallOffer = (data) => {
      const { caller_id, caller_name, call_type, offer, call_id, is_group, participants } = data;
      if (activeCall) {
        socket.emit('call_status', {
          target_user_id: caller_id,
          status: 'busy',
          call_id: call_id,
        });
        return;
      }

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
        setActiveCall(prev => ({
          ...prev,
          status: 'connected',
          remoteUser: { ...prev.remoteUser, id: answerer_id },
        }));
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
      const { call_id, inviter_id, inviter_name, call_type, existing_participants, offer } = data;
      if (!activeCall && !incomingCall) {
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

  // Cleanup
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
    onlineUsers,
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