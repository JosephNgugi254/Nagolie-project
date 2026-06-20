// components/call/CallUI.jsx
import React from 'react';
import { useCall } from '../../context/CallContext';
import { useSocket } from '../../context/SocketContext'; // NEW
import IncomingCallModal from './IncomingCallModal';
import CallScreen from './CallScreen';
import FloatingCallWidget from './FloatingCallWidget';
import AddParticipantModal from './AddParticipantModal';

const CallUI = () => {
  const { onlineUsers } = useSocket(); // get onlineUsers from context
  const {
    activeCall,
    incomingCall,
    isMinimized,
    setIsMinimized,
    callDuration,
    localStream,
    remoteStreams,
    answerCall,
    endCall,
    addParticipant,
  } = useCall();

  const [showAddParticipant, setShowAddParticipant] = React.useState(false);

  if (!activeCall && !incomingCall) return null;

  return (
    <>
      {incomingCall && (
        <IncomingCallModal
          call={incomingCall}
          onAnswer={() => answerCall(incomingCall.callId, true)}
          onDecline={() => answerCall(incomingCall.callId, false)}
        />
      )}

      {activeCall && !isMinimized && (
        <CallScreen
          call={activeCall}
          localStream={localStream}
          remoteStream={remoteStreams[activeCall.callId]?.[activeCall.remoteUser?.id]}
          onEnd={() => endCall(activeCall.callId)}
          onMinimize={() => setIsMinimized(true)}
          duration={callDuration}
          isGroup={activeCall.isGroup}
          participants={activeCall.participants}
          onAddParticipant={() => setShowAddParticipant(true)}
        />
      )}

      {activeCall && isMinimized && (
        <FloatingCallWidget
          call={activeCall}
          duration={callDuration}
          onMaximize={() => setIsMinimized(false)}
          onEnd={() => endCall(activeCall.callId)}
        />
      )}

      <AddParticipantModal
        isOpen={showAddParticipant}
        onClose={() => setShowAddParticipant(false)}
        onAdd={addParticipant}
        currentParticipants={activeCall?.participants || []}
        onlineUsers={onlineUsers}
      />
    </>
  );
};

export default CallUI;