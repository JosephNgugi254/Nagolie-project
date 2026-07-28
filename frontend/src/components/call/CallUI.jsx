import React from 'react';
import { useCall } from '../../context/CallContext';
import { useSocket } from '../../context/SocketContext';
import IncomingCallModal from './IncomingCallModal';
import CallScreen from './CallScreen';
import FloatingCallWidget from './FloatingCallWidget';
import AddParticipantModal from './AddParticipantModal';

const CallUI = () => {
  const { onlineUsers } = useSocket();
  const {
    activeCall, incomingCall, isMinimized, setIsMinimized, callDuration,
    localStream, remoteStreams, userDirectory,
    answerCall, endCall, leaveCall, addParticipant,
  } = useCall();

  const [showAddParticipant, setShowAddParticipant] = React.useState(false);

  if (!activeCall && !incomingCall) return null;

  const remoteStreamsForCall = remoteStreams[activeCall?.callId] || {};
  const hangUp = () => activeCall?.isGroup ? leaveCall(activeCall.callId) : endCall(activeCall.callId);

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
          remoteStreamsMap={remoteStreamsForCall}
          userDirectory={userDirectory}
          onEnd={hangUp}
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
          onEnd={hangUp}
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