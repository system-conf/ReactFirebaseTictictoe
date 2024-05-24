// src/Chat.js
import React, { useState, useEffect } from 'react';
import { firestore } from './firebase';
import { serverTimestamp } from 'firebase/firestore'; // serverTimestamp import edelim

const Chat = ({ room }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const unsubscribe = firestore
      .collection('rooms')
      .doc(room)
      .collection('messages')
      .orderBy('timestamp')
      .onSnapshot(snapshot => {
        const fetchedMessages = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMessages(fetchedMessages);
      });

    return () => unsubscribe();
  }, [room]);

  const sendMessage = async () => {
    if (message.trim()) {
      await firestore.collection('rooms').doc(room).collection('messages').add({
        text: message,
        timestamp: serverTimestamp(), // serverTimestamp kullanımı burada gerekli
      });
      setMessage('');
    }
  };

  return (
    <div className="chat">
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className="message">
            {msg.text}
          </div>
        ))}
      </div>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type a message"
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
};

export default Chat;
