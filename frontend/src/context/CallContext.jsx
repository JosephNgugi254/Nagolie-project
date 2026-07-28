import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { recoveryAPI } from '../services/api';
import { showToast } from '../components/common/Toast';

const formatCallDuration = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const CallContext = createContext();
const RINGTONE_URL = '/nagolie-iphone-call-ringtone.mp3';

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
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
  const [userDirectory, setUserDirectory] = useState({});

  // Reactive mirror of remote streams so components re-render when a new
  // participant's media arrives — the previous ref-only approach never
  // triggered a re-render for group calls.
  const [remoteStreamsState, setRemoteStreamsState] = useState({});

  const peerConnections = useRef({});     // { [callId]: { [peerId]: RTCPeerConnection } }
  const remoteStreams = useRef({});       // { [callId]: { [peerId]: MediaStream } }
  const pendingIce = useRef({});          // { "callId_peerId": [candidate, ...] }
  const localStream = useRef(null);
  const callTimer = useRef(null);
  const ringtoneAudio = useRef(null);

  const getUserId = () => user?.id;

  // ---------- User directory (for avatars in call UI) ----------
  useEffect(() => {
    recoveryAPI.getUsers()
      .then(res => {
        const map = {};
        (res.data || []).forEach(u => { map[u.id] = u; });
        setUserDirectory(map);
      })
      .catch(() => {});
  }, []);

  // ---------- Ringtone ----------
  const playRingtone = () => {
    if (!ringtoneAudio.current) {
      ringtoneAudio.current = new Audio(RINGTONE_URL);
      ringtoneAudio.current.loop = true;
    }
    ringtoneAudio.current.play().catch(() => {
      showToast.warning('Tap anywhere to enable ringtone', 5000);
      const enableAudio = () => {
        ringtoneAudio.current?.play().catch(() => {});
        document.removeEventListener('click', enableAudio);
      };
      document.addEventListener('click', enableAudio);
    });
  };

  const toggleRingtone = () => {
    if (!ringtoneAudio.current) return;
    ringtoneAudio.current.muted = !ringtoneAudio.current.muted;
    if (!ringtoneAudio.current.muted) ringtoneAudio.current.play().catch(() => {});
  };

  const stopRingtone = () => {
    if (ringtoneAudio.current) {
      ringtoneAudio.current.pause();
      ringtoneAudio.current.currentTime = 0;
    }
  };

  const startTimer = useCallback(() => {
    if (callTimer.current) return;
    callTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (callTimer.current) {
      clearInterval(callTimer.current);
      callTimer.current = null;
    }
  }, []);

  // ---------- ICE queueing helpers ----------
  const flushIceQueue = useCallback(async (callId, peerId, pc) => {
    const key = `${callId}_${peerId}`;
    const queued = pendingIce.current[key] || [];
    for (const c of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.error('ICE flush error', e); }
    }
    delete pendingIce.current[key];
  }, []);

  const queueOrAddIce = useCallback((callId, peerId, candidate) => {
    const pc = peerConnections.current[callId]?.[peerId];
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => console.error('ICE add error', err));
    } else {
      const key = `${callId}_${peerId}`;
      if (!pendingIce.current[key]) pendingIce.current[key] = [];
      pendingIce.current[key].push(candidate);
    }
  }, []);

  // ---------- Remove a single peer's tile/connection (group "leave") ----------
  const removePeer = useCallback((callId, peerId) => {
    peerConnections.current[callId]?.[peerId]?.close();
    if (peerConnections.current[callId]) delete peerConnections.current[callId][peerId];
    if (remoteStreams.current[callId]) delete remoteStreams.current[callId][peerId];
    setRemoteStreamsState(prev => {
      if (!prev[callId]) return prev;
      const inner = { ...prev[callId] };
      delete inner[peerId];
      return { ...prev, [callId]: inner };
    });
  }, []);

  // ---------- Peer connection factory ----------
  const createPeerConnection = useCallback((callId, targetUserId, isInitiator = false) => {
    const pc = new RTCPeerConnection(iceServers);

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => pc.addTrack(track, localStream.current));
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

      setRemoteStreamsState(prev => ({
        ...prev,
        [callId]: { ...(prev[callId] || {}), [targetUserId]: event.streams[0] },
      }));

      setIsCallConnected(prevConnected => {
        if (!prevConnected) startTimer();
        return true;
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        removePeer(callId, targetUserId);
      }
    };

    return pc;
  }, [socket, startTimer, removePeer]);

  // ---------- End call entirely (1-on-1, or last person in a group) ----------
  const endCall = useCallback(async (callId) => {
    stopTimer();

    const peers = peerConnections.current[callId] || {};
    Object.values(peers).forEach(pc => pc.close());
    delete peerConnections.current[callId];
    delete remoteStreams.current[callId];
    setRemoteStreamsState(prev => {
      const copy = { ...prev };
      delete copy[callId];
      return copy;
    });

    if (localStream.current) {
      localStream.current.getTracks().forEach(t => t.stop());
      localStream.current = null;
    }

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
          callee_id: active.isGroup ? null : active.remoteUser?.id,
          is_group: active.isGroup,
          participants: active.participants,
        });
      } catch (err) { console.error('Failed to save call log:', err); }

      if (!active.isGroup && active.remoteUser?.id) {
        const emoji = active.type === 'video' ? '📹' : '📞';
        const label = active.type === 'video' ? 'Video' : 'Voice';
        try {
          await recoveryAPI.sendMessage(active.remoteUser.id, `${emoji} ${label} call · ${formatCallDuration(duration)}`);
        } catch (err) { console.error('Failed to send call log message:', err); }
      }

      const others = (active.participants || []).filter(id => id !== getUserId());
      others.forEach(pid => socket.emit('call_end', { call_id: callId, participants: [pid], duration }));
    }

    setActiveCall(null);
    setIsCallConnected(false);
    setCallDuration(0);
    setIsMinimized(false);
    stopRingtone();
  }, [activeCall, socket, getUserId, stopTimer]);

  // ---------- Leave a group call: only you drop off, call continues for others ----------
  const leaveCall = useCallback((callId) => {
    const active = activeCall;
    if (!active) return;

    const others = (active.participants || []).filter(id => id !== getUserId());
    others.forEach(pid => socket.emit('call_leave', { call_id: callId, target_user_id: pid }));

    // If we're the only one left, treat it as a full end (saves the log too)
    if (others.length === 0) {
      endCall(callId);
      return;
    }

    const peers = peerConnections.current[callId] || {};
    Object.values(peers).forEach(pc => pc.close());
    delete peerConnections.current[callId];
    delete remoteStreams.current[callId];
    setRemoteStreamsState(prev => {
      const copy = { ...prev };
      delete copy[callId];
      return copy;
    });

    if (localStream.current) {
      localStream.current.getTracks().forEach(t => t.stop());
      localStream.current = null;
    }

    stopTimer();
    setActiveCall(null);
    setIsCallConnected(false);
    setCallDuration(0);
    setIsMinimized(false);
  }, [activeCall, socket, getUserId, endCall, stopTimer]);

  // ---------- Start a call (1-on-1 or group) ----------
  const startCall = useCallback(async (targetUserId, type, isGroup = false, participants = []) => {
    if (!isGroup && !onlineUsers.has(targetUserId)) {
      showToast.error('User is offline');
      return;
    }

    const callId = `call_${Date.now()}_${getUserId()}`;
    const allParticipants = isGroup ? Array.from(new Set([getUserId(), ...participants])) : [getUserId(), targetUserId];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      localStream.current = stream;

      if (isGroup) {
        const others = allParticipants.filter(id => id !== getUserId());
        for (const pid of others) {
          const pc = createPeerConnection(callId, pid, true);
          if (!peerConnections.current[callId]) peerConnections.current[callId] = {};
          peerConnections.current[callId][pid] = pc;

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call_offer', {
            target_user_id: pid,
            call_type: type,
            offer,
            call_id: callId,
            is_group: true,
            participants: allParticipants,
            caller_name: user.username,
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
          offer,
          call_id: callId,
          is_group: false,
          participants: allParticipants,
          caller_name: user.username,
        });
      }

      setActiveCall({
        callId,
        type,
        remoteUser: isGroup ? null : { id: targetUserId },
        status: 'ringing',
        startTime: Date.now(),
        isGroup,
        participants: allParticipants,
      });
      setIsMinimized(false);
    } catch (err) {
      console.error('Error starting call:', err);
      showToast.error('Could not access microphone/camera');
    }
  }, [socket, onlineUsers, getUserId, user, createPeerConnection]);

  // ---------- Answer an incoming call ----------
  const answerCall = useCallback(async (callId, accept) => {
    const call = incomingCall;
    if (!call) return;

    if (!accept) {
      socket.emit('call_status', { target_user_id: call.callerId, status: 'declined', call_id: callId });
      setIncomingCall(null);
      stopRingtone();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: call.type === 'video' });
      localStream.current = stream;

      const pc = createPeerConnection(callId, call.callerId, false);
      if (!peerConnections.current[callId]) peerConnections.current[callId] = {};
      peerConnections.current[callId][call.callerId] = pc;

      await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
      await flushIceQueue(callId, call.callerId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('call_answer', { target_user_id: call.callerId, answer, call_id: callId });

      setActiveCall({
        callId,
        type: call.type,
        remoteUser: call.isGroup ? null : { id: call.callerId, name: call.callerName },
        status: 'connecting',
        startTime: Date.now(),
        isGroup: call.isGroup || false,
        participants: call.participants || [getUserId(), call.callerId],
      });
      setIncomingCall(null);
      stopRingtone();
      setIsMinimized(false);
    } catch (err) {
      console.error('Error answering call:', err);
      showToast.error('Could not answer call');
    }
  }, [incomingCall, socket, getUserId, createPeerConnection, flushIceQueue]);

  // ---------- Adder side: invite a new participant into an active group call ----------
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
      offer,
    });

    setActiveCall(prev => prev ? ({
      ...prev,
      participants: prev.participants.includes(newUserId) ? prev.participants : [...prev.participants, newUserId],
    }) : prev);
  }, [activeCall, socket, createPeerConnection]);

  // ---------- Existing member: someone else just joined, connect to them too ----------
  const handleMeshJoin = useCallback(async ({ call_id, new_user_id, call_type }) => {
    if (!activeCall || activeCall.callId !== call_id) return;

    const pc = createPeerConnection(call_id, new_user_id, true);
    if (!peerConnections.current[call_id]) peerConnections.current[call_id] = {};
    peerConnections.current[call_id][new_user_id] = pc;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit('call_offer', {
      target_user_id: new_user_id,
      call_type,
      offer,
      call_id,
      is_group: true,
      participants: activeCall.participants,
      is_mesh: true,
    });

    setActiveCall(prev => prev ? ({
      ...prev,
      participants: prev.participants.includes(new_user_id) ? prev.participants : [...prev.participants, new_user_id],
    }) : prev);
  }, [activeCall, socket, createPeerConnection]);

  // ---------- New participant: silently accept mesh offers from other members ----------
  const handleMeshOffer = useCallback(async (fromUserId, offer, callId) => {
    const pc = createPeerConnection(callId, fromUserId, false);
    if (!peerConnections.current[callId]) peerConnections.current[callId] = {};
    peerConnections.current[callId][fromUserId] = pc;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await flushIceQueue(callId, fromUserId, pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('call_answer', { target_user_id: fromUserId, answer, call_id: callId });

    setActiveCall(prev => prev ? ({
      ...prev,
      participants: prev.participants.includes(fromUserId) ? prev.participants : [...prev.participants, fromUserId],
    }) : prev);
  }, [socket, createPeerConnection, flushIceQueue]);

  // ---------- Socket event wiring ----------
  useEffect(() => {
    if (!socket) return;

    const onCallOffer = (data) => {
      const { caller_id, caller_name, caller_avatar, call_type, offer, call_id, is_group, participants, is_mesh } = data;

      if (is_mesh && activeCall && activeCall.callId === call_id) {
        handleMeshOffer(caller_id, offer, call_id);
        return;
      }

      if (activeCall) {
        socket.emit('call_status', { target_user_id: caller_id, status: 'busy', call_id });
        return;
      }

      setIncomingCall({
        callId: call_id,
        callerId: caller_id,
        callerName: caller_name || 'Unknown',
        callerAvatar: caller_avatar,
        type: call_type,
        offer,
        isGroup: is_group || false,
        participants: participants || [caller_id],
      });
      playRingtone();
    };

    const onCallAnswer = (data) => {
      const { answerer_id, answer, call_id } = data;
      const pc = peerConnections.current[call_id]?.[answerer_id];
      if (!pc) return;
      pc.setRemoteDescription(new RTCSessionDescription(answer)).then(() => {
        flushIceQueue(call_id, answerer_id, pc);
      });
      setActiveCall(prev => {
        if (!prev || prev.callId !== call_id) return prev;
        if (prev.isGroup) return { ...prev, status: 'connected' }; // don't clobber remoteUser for groups
        return { ...prev, status: 'connected', remoteUser: { ...prev.remoteUser, id: answerer_id } };
      });
    };

    const onCallIce = (data) => {
      queueOrAddIce(data.call_id, data.sender_id, data.candidate);
    };

    const onCallEnded = (data) => {
      if (activeCall && activeCall.callId === data.call_id) {
        endCall(data.call_id);
        showToast.info('Call ended by other party');
      }
    };

    const onCallPeerLeft = (data) => {
      const { call_id, user_id } = data;
      if (!activeCall || activeCall.callId !== call_id) return;
      removePeer(call_id, user_id);
      setActiveCall(prev => prev ? ({
        ...prev,
        participants: prev.participants.filter(id => id !== user_id),
      }) : prev);
    };

    const onCallStatus = (data) => {
      const { status, call_id } = data;
      if (!activeCall || activeCall.callId !== call_id) return;
      if (status === 'declined') { endCall(call_id); showToast.info('Call declined'); }
      else if (status === 'busy') { endCall(call_id); showToast.info('User is busy'); }
      else if (status === 'unavailable') { endCall(call_id); showToast.info('User is unavailable'); }
    };

    const onCallInvite = (data) => {
      const { call_id, inviter_id, inviter_name, inviter_avatar, call_type, existing_participants, offer } = data;
      if (!activeCall && !incomingCall) {
        setIncomingCall({
          callId: call_id,
          callerId: inviter_id,
          callerName: inviter_name || 'Inviter',
          callerAvatar: inviter_avatar,
          type: call_type,
          offer,
          isGroup: true,
          participants: existing_participants,
        });
        playRingtone();
      } else {
        socket.emit('call_status', { target_user_id: inviter_id, status: 'busy', call_id });
      }
    };

    const onCallMeshJoin = (data) => handleMeshJoin(data);

    socket.on('call_offer', onCallOffer);
    socket.on('call_answer', onCallAnswer);
    socket.on('call_ice', onCallIce);
    socket.on('call_ended', onCallEnded);
    socket.on('call_peer_left', onCallPeerLeft);
    socket.on('call_status', onCallStatus);
    socket.on('call_invite', onCallInvite);
    socket.on('call_mesh_join', onCallMeshJoin);

    return () => {
      socket.off('call_offer', onCallOffer);
      socket.off('call_answer', onCallAnswer);
      socket.off('call_ice', onCallIce);
      socket.off('call_ended', onCallEnded);
      socket.off('call_peer_left', onCallPeerLeft);
      socket.off('call_status', onCallStatus);
      socket.off('call_invite', onCallInvite);
      socket.off('call_mesh_join', onCallMeshJoin);
    };
  }, [socket, activeCall, incomingCall, endCall, removePeer, queueOrAddIce, flushIceQueue, handleMeshJoin, handleMeshOffer]);

  useEffect(() => {
    return () => {
      stopRingtone();
      stopTimer();
      Object.values(peerConnections.current).forEach(pcs => Object.values(pcs).forEach(pc => pc.close()));
      if (localStream.current) localStream.current.getTracks().forEach(t => t.stop());
    };
  }, [stopTimer]);

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
    toggleRingtone,
    answerCall,
    endCall,
    leaveCall,
    addParticipant,
    localStream: localStream.current,
    remoteStreams: remoteStreamsState,
    userDirectory,
    onlineUsers,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within a CallProvider');
  return context;
};