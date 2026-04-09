import { useState, useEffect, useRef } from 'react';
import { recoveryAPI } from '../../services/api';
import Modal from '../common/Modal';
import { showToast } from '../common/Toast';
import { useAuth } from '../../context/AuthContext';

function CommentBox({ loanId, onClose }) {
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); // { id, username }
  const [lastReadAt, setLastReadAt] = useState(null);

  const chatBoxRef = useRef(null);
  const newCommentRefs = useRef({});

  useEffect(() => {
    fetchCommentsAndReadStatus();
  }, [loanId]);

  const fetchCommentsAndReadStatus = async () => {
    try {
      const res = await recoveryAPI.getCommentsWithReadStatus(loanId);
      setLastReadAt(new Date(res.data.last_read_at));
      setComments(res.data.comments);
    } catch (err) {
      console.error(err);
      showToast.error('Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  // After comments loaded, highlight new ones and mark read
  useEffect(() => {
    if (!loading && comments.length > 0 && lastReadAt) {
      // Find first new comment (anywhere in the tree) to scroll to
      let firstNewCommentId = null;
      const findNew = (commentList) => {
        for (const comment of commentList) {
          // Skip own comments
          if (comment.user_id === currentUserId) continue;
          if (new Date(comment.created_at) > lastReadAt) {
            firstNewCommentId = comment.id;
            return true;
          }
          if (comment.replies && findNew(comment.replies)) return true;
        }
        return false;
      };
      findNew(comments);

      if (firstNewCommentId) {
        // Scroll to that comment after a short delay (to allow DOM render)
        setTimeout(() => {
          const element = document.getElementById(`comment-${firstNewCommentId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Add scaling effect
            element.classList.add('comment-highlight');
            setTimeout(() => {
              element.classList.remove('comment-highlight');
            }, 1000);
          }
        }, 100);
      }

      // Mark all comments as read (update last_read_at)
      recoveryAPI.markCommentRead(loanId).catch(err => console.error(err));
    }
  }, [loading, comments, lastReadAt]);

  const handleSend = async () => {
    if (!newComment.trim()) return;
    try {
      await recoveryAPI.addComment(loanId, newComment, replyingTo?.id);
      setNewComment('');
      setReplyingTo(null);
      fetchCommentsAndReadStatus();
    } catch (err) {
      showToast.error('Failed to send comment');
    }
  };

  const handleEdit = async (commentId) => {
    if (!editContent.trim()) return;
    try {
      await recoveryAPI.editComment(loanId, commentId, editContent);
      setEditingCommentId(null);
      setEditContent('');
      fetchCommentsAndReadStatus();
    } catch (err) {
      showToast.error('Failed to edit comment');
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'director': return '#fff4e6';
      case 'secretary': return '#ffe6f0';
      case 'accountant': return '#e6f0ff';
      case 'valuer': return '#e6ffe6';
      default: return '#f8f9fa';
    }
  };

  const groupCommentsByDate = () => {
    const groups = {};
    comments.forEach(comment => {
      const date = new Date(comment.created_at);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      let dateKey;
      if (date.toDateString() === today.toDateString()) {
        dateKey = 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateKey = 'Yesterday';
      } else {
        dateKey = date.toLocaleDateString();
      }
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(comment);
    });
    return groups;
  };

  const groups = groupCommentsByDate();

  const renderComment = (comment, depth = 0) => {
    const isNew = lastReadAt && new Date(comment.created_at) > lastReadAt && comment.user_id !== currentUserId;
    return (
      <div
        key={comment.id}
        id={`comment-${comment.id}`}
        style={{ marginLeft: `${depth * 20}px` }}
        className={`mb-3 ${isNew ? 'new-comment' : ''}`}
      >
        <div
          className="p-2 rounded position-relative"
          style={{ backgroundColor: getRoleColor(comment.role), borderLeft: `4px solid ${getRoleColor(comment.role)}` }}
        >
          <div className="d-flex justify-content-between align-items-start">
            <strong>{comment.user}</strong>
            <div>
              {comment.user_id === currentUserId && (
                <button
                  className="btn btn-sm btn-link text-secondary"
                  onClick={() => {
                    setEditingCommentId(comment.id);
                    setEditContent(comment.content);
                  }}
                >
                  <i className="fas fa-edit"></i>
                </button>
              )}
              <button
                className="btn btn-sm btn-link text-secondary"
                onClick={() => setReplyingTo({ id: comment.id, username: comment.user })}
              >
                <i className="fas fa-reply"></i>
              </button>
            </div>
          </div>
          {editingCommentId === comment.id ? (
            <div className="mt-2">
              <textarea
                className="form-control"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows="2"
              />
              <div className="mt-2">
                <button className="btn btn-sm btn-primary" onClick={() => handleEdit(comment.id)}>Save</button>
                <button className="btn btn-sm btn-secondary ms-2" onClick={() => setEditingCommentId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <p className="mb-1 mt-2">{comment.content}</p>
          )}
          <div className="text-muted small text-end mt-1">
            {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {comment.edited && <span className="ms-2">(edited)</span>}
          </div>
        </div>
        {comment.replies && comment.replies.map(reply => renderComment(reply, depth + 1))}
      </div>
    );
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Comments" size="lg">
      <div
        className="chat-box"
        ref={chatBoxRef}
        style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1rem' }}
      >
        {loading ? (
          <div className="text-center py-3">Loading...</div>
        ) : comments.length === 0 ? (
          <p className="text-muted text-center">No comments yet.</p>
        ) : (
          Object.entries(groups).map(([dateKey, cmts]) => (
            <div key={dateKey}>
              <div className="chat-date-separator">{dateKey}</div>
              {cmts.map(comment => renderComment(comment))}
            </div>
          ))
        )}
      </div>
      {replyingTo && (
        <div className="alert alert-info py-2 mb-2">
          Replying to {replyingTo.username}
          <button className="float-end btn-close" onClick={() => setReplyingTo(null)}></button>
        </div>
      )}
      <div className="input-group">
        <input
          type="text"
          className="form-control"
          placeholder={replyingTo ? `Reply to ${replyingTo.username}...` : "Write a comment..."}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="btn btn-primary" onClick={handleSend} title="Send">
          <i className="fas fa-paper-plane"></i>
        </button>
      </div>
    </Modal>
  );
}

export default CommentBox;