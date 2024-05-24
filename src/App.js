// src/App.js
import React, { useState, useEffect } from "react";
import {
  firestore,
  auth,
  signInAnonymously,
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "./firebase";
import "./App.css";

const clickSound = new Audio("/touch.mp3");
const winSound = new Audio("/win.mp3");
const joinSound = new Audio("/click.mp3");
const playAgainSound = new Audio("/click.mp3");

function App() {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [connected, setConnected] = useState(false);
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [winner, setWinner] = useState(null);
  const [playerSymbol, setPlayerSymbol] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [presenceInterval, setPresenceInterval] = useState(null);

  useEffect(() => {
    signInAnonymously(auth)
      .then(() => {
        console.log("User signed in anonymously");
      })
      .catch((error) => {
        console.error("Error signing in anonymously", error);
      });
  }, []);

  useEffect(() => {
    if (!room) return;

    const unsubscribe = onSnapshot(doc(firestore, "rooms", room), (doc) => {
      const data = doc.data();
      if (data) {
        setBoard(data.board);
        setIsXNext(data.isXNext);
        setWinner(data.winner);
        setGameStarted(true);
        checkAndResetRoom(data);
      }
    });

    window.addEventListener("beforeunload", handleBeforeUnload);

    // Kullanıcının varlık durumu bilgilerini periyodik olarak güncelle
    const interval = setInterval(updatePresence, 5000); // Her 5 saniyede bir güncelle
    setPresenceInterval(interval);

    return () => {
      leaveRoom();
      unsubscribe();
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [room]);

  const handleBeforeUnload = (event) => {
    leaveRoom();
    event.preventDefault();
    event.returnValue = ""; // Chrome requires returnValue to be set
  };

  const calculateWinner = (squares) => {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];

    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (
        squares[a] &&
        squares[a] === squares[b] &&
        squares[a] === squares[c]
      ) {
        return squares[a];
      }
    }

    if (squares.every((square) => square !== null)) {
      return "Draw";
    }

    return null;
  };

  const handleClick = async (index) => {
    if (
      !gameStarted ||
      winner ||
      board[index] ||
      playerSymbol !== (isXNext ? "X" : "O")
    )
      return;

    const newBoard = board.slice();
    newBoard[index] = playerSymbol;
    setBoard(newBoard);
    setIsXNext(!isXNext);

    const calculatedWinner = calculateWinner(newBoard);
    if (calculatedWinner) {
      setWinner(calculatedWinner);
      winSound.play();
    } else {
      clickSound.play();
    }

    await updateDoc(doc(firestore, "rooms", room), {
      board: newBoard,
      isXNext: !isXNext,
      winner: calculatedWinner,
      lastActivity: Timestamp.now(), // Son aktivite zaman damgasını güncelle
    });
  };

  const handleRestart = async () => {
    await updateDoc(doc(firestore, "rooms", room), {
      board: Array(9).fill(null),
      isXNext: true,
      winner: null,
      lastActivity: Timestamp.now(), // Son aktivite zaman damgasını güncelle
    });
    playAgainSound.play();
  };

  const joinRoom = async () => {
    if (name && room) {
      const roomRef = doc(firestore, "rooms", room);
      const roomDoc = await getDoc(roomRef);

      if (!roomDoc.exists() || !roomDoc.data().players) {
        // Oda yoksa veya oyuncu bilgisi yoksa yeni oda oluştur
        await setDoc(roomRef, {
          board: Array(9).fill(null),
          isXNext: true,
          players: { [name]: { symbol: "X", lastActivity: Timestamp.now() } },
          winner: null,
          lastActivity: Timestamp.now(), // Oda oluşturulma zaman damgası
        });
        setPlayerSymbol("X");
      } else {
        const roomData = roomDoc.data();
        if (Object.keys(roomData.players).length < 2) {
          const symbol = Object.keys(roomData.players).length === 0 ? "X" : "O";
          await updateDoc(roomRef, {
            [`players.${name}`]: { symbol, lastActivity: Timestamp.now() },
            lastActivity: Timestamp.now(), // Son aktivite zaman damgasını güncelle
          });
          setPlayerSymbol(symbol);
        } else {
          alert("Room is full");
          return;
        }
      }

      setConnected(true);
      joinSound.play();
    }
  };

  const leaveRoom = async () => {
    if (room) {
      const roomRef = doc(firestore, "rooms", room);
      const roomDoc = await getDoc(roomRef);

      if (roomDoc.exists()) {
        const roomData = roomDoc.data();
        const remainingPlayers = Object.keys(roomData.players).filter(
          (player) => player !== name
        );
        if (remainingPlayers.length === 0) {
          await deleteDoc(roomRef);
        } else {
          const updatedPlayers = remainingPlayers.reduce((acc, player) => {
            acc[player] = roomData.players[player];
            return acc;
          }, {});
          await updateDoc(roomRef, {
            players: updatedPlayers,
            lastActivity: Timestamp.now(), // Son aktivite zaman damgasını güncelle
          });
        }
      }
    }
  };

  const updatePresence = async () => {
    if (room && name) {
      const roomRef = doc(firestore, "rooms", room);
      const roomDoc = await getDoc(roomRef);

      if (!roomDoc.exists()) {
        return; // Oda mevcut değilse, işlemi durdur
      }

      await updateDoc(roomRef, {
        [`players.${name}.lastActivity`]: Timestamp.now(),
      });
    }
  };

  const checkAndResetRoom = async (roomData) => {
    const roomRef = doc(firestore, "rooms", room);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists()) {
      return; // Oda mevcut değilse, işlemi durdur
    }

    const now = Timestamp.now().seconds;
    const timeout = 3; // 30 saniye aktif değilse oda sıfırlanacak
    const players = Object.keys(roomData.players);
    const inactivePlayers = players.filter((player) => {
      const playerData = roomData.players[player];
      return (
        playerData.lastActivity &&
        now - playerData.lastActivity.seconds > timeout
      );
    });
  };

  const renderSquare = (index) => (
    <button className="square" onClick={() => handleClick(index)}>
      {board[index]}
    </button>
  );

  const status = winner
    ? winner === "Draw"
      ? "Draw!"
      : `Winner: ${winner}`
    : `Next player: ${isXNext ? "X" : "O"}`;

  return (
    <div className="app">
      {!connected ? (
        <div className="join-form">
          <input
            className="input"
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            type="text"
            placeholder="Room"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          />
          <button className="button" onClick={joinRoom}>
            Join Room
          </button>
        </div>
      ) : (
        <div>
          <div className="status">{status}</div>
          <div className="board">
            {[0, 1, 2].map((row) => (
              <div key={row} className="board-row">
                {[0, 1, 2].map((col) => renderSquare(row * 3 + col))}
              </div>
            ))}
          </div>
          {winner && (
            <button className="button" onClick={handleRestart}>
              Play Again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
