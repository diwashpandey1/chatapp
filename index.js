// Import necessary modules
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// IMPORTANT: Cloud Run provides the port via process.env.PORT
const PORT = process.env.PORT || 8080; // Use 8080 as a common default for local testing

const io = new socketIo.Server(server, {
    cors: {
        origin: "*", // Allow all origins for Socket.IO. Adjust in production for security.
        methods: ["GET", "POST"]
    }
});

// Serve static files from the 'public' directory
// This will NOT be used in Cloud Run for static files, but kept for local development
app.use(express.static(path.join(__dirname, 'public')));

const activeRooms = {}; // Stores existing room codes for validation
// New: Store connected users by room. Helps in tracking names for disconnects.
const usersInRooms = {}; // { roomCode: { socketId: personName, ... } }

function generateUniqueRoomCode() {
    let code;
    do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (activeRooms[code]);
    return code;
}

// Define a route for the root URL ('/')
// This will NOT be used in Cloud Run, as Firebase Hosting serves index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // This 'currentRoom' variable on the server-side helps track which room a socket is currently in.
    let currentRoom = null;

    socket.on('createRoom', (callback) => {
        const roomCode = generateUniqueRoomCode();
        activeRooms[roomCode] = roomCode; // Mark room as active

        // Clear user's previous room and associated data if any
        if (currentRoom) {
            socket.leave(currentRoom);
            if (usersInRooms[currentRoom]) {
                delete usersInRooms[currentRoom][socket.id];
            }
        }

        socket.join(roomCode);
        currentRoom = roomCode;
        console.log(`User ${socket.id} created and joined room: ${roomCode}`);

        // Initialize user tracking for the new room
        if (!usersInRooms[roomCode]) {
            usersInRooms[roomCode] = {};
        }

        if (typeof callback === 'function') {
            callback({ success: true, roomCode: roomCode });
        }
    });

    socket.on('joinRoom', (roomCode, callback) => {
        if (activeRooms[roomCode]) {
            // Clear user's previous room and associated data if any
            if (currentRoom && currentRoom !== roomCode) { // Only leave if changing rooms
                socket.leave(currentRoom);
                if (usersInRooms[currentRoom]) {
                    delete usersInRooms[currentRoom][socket.id];
                }
            }

            socket.join(roomCode);
            currentRoom = roomCode;
            console.log(`User ${socket.id} joined room: ${roomCode}`);

            // Initialize user tracking for the room if not already
            if (!usersInRooms[roomCode]) {
                usersInRooms[roomCode] = {};
            }

            if (typeof callback === 'function') {
                callback({ success: true, roomCode: roomCode });
            }
            // Removed direct system message here, as it will be handled by 'userJoinedRoom' from client
        } else {
            console.log(`User ${socket.id} attempted to join non-existent room: ${roomCode}`);
            if (typeof callback === 'function') {
                callback({ success: false, message: 'Room does not exist.' });
            }
        }
    });

    // --- NEW: Handle client-side userJoinedRoom notification ---
    socket.on('userJoinedRoom', ({ roomCode, personName }) => {
        if (roomCode && personName) {
            console.log(`${personName} (${socket.id}) confirmed join to room ${roomCode}`);
            // Store the personName for this socket in this room
            if (usersInRooms[roomCode]) {
                usersInRooms[roomCode][socket.id] = personName;
            }

            // Broadcast to others in the room that this user has joined
            socket.to(roomCode).emit('userActivity', {
                message: `${personName} joined the chat.`,
                timestamp: Date.now(),
                roomCode: roomCode,
                personName: "System" // Mark as a system message
            });
        }
    });

    // --- NEW: Handle client-side userLeavingRoom notification ---
    socket.on('userLeavingRoom', ({ roomCode, personName }) => {
        if (roomCode && personName) {
            console.log(`${personName} (${socket.id}) is explicitly leaving room ${roomCode}`);
            socket.leave(roomCode);
            currentRoom = null; // Reset currentRoom for this socket

            // Remove user from tracking
            if (usersInRooms[roomCode]) {
                delete usersInRooms[roomCode][socket.id];
            }

            // Broadcast to others in the room that this user has left
            socket.to(roomCode).emit('userActivity', {
                message: `${personName} left the chat.`,
                timestamp: Date.now(),
                roomCode: roomCode,
                personName: "System" // Mark as a system message
            });

            // Check if room is empty and delete it after a short delay
            setTimeout(() => {
                const clientsInRoom = io.sockets.adapter.rooms.get(roomCode);
                if (!clientsInRoom || clientsInRoom.size === 0) {
                    console.log(`Room ${roomCode} is now empty. Deleting.`);
                    delete activeRooms[roomCode];
                    delete usersInRooms[roomCode]; // Also delete the users tracking for this room
                }
            }, 1000); // 1-second delay
        }
    });

    socket.on('chat message', (msg) => {
        // Ensure the message object has roomCode, personName, etc. (client should send this)
        if (currentRoom && msg.roomCode === currentRoom && msg.personName && msg.message) {
            console.log(`Message from ${msg.personName} in room ${msg.roomCode}: ${msg.message}`);
            // Broadcast the message to all clients in the specific room, including sender.
            // Client-side 'chat message' listener handles not re-adding self's message.
            io.to(currentRoom).emit('chat message', msg);
        } else {
            console.log(`Invalid message or not in a room: ${JSON.stringify(msg)}`);
            socket.emit('chat message', {
                personName: "System",
                message: '[System] You must join a room and provide valid message data to send messages.',
                timestamp: Date.now(),
                roomCode: currentRoom // Send back the current room if known
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // If the user was in a room, announce their departure
        if (currentRoom && usersInRooms[currentRoom] && usersInRooms[currentRoom][socket.id]) {
            const personName = usersInRooms[currentRoom][socket.id];
            delete usersInRooms[currentRoom][socket.id]; // Remove from tracking

            // Broadcast a system message to the room that the user left
            // Use io.to() here because the disconnecting socket won't receive it anyway
            io.to(currentRoom).emit('userActivity', {
                message: `${personName} left the chat.`,
                timestamp: Date.now(),
                roomCode: currentRoom,
                personName: "System" // Mark as a system message
            });

            // Check if room is empty and delete it after a short delay
            setTimeout(() => {
                const clientsInRoom = io.sockets.adapter.rooms.get(currentRoom);
                if (!clientsInRoom || clientsInRoom.size === 0) {
                    console.log(`Room ${currentRoom} is now empty. Deleting.`);
                    delete activeRooms[currentRoom];
                    delete usersInRooms[currentRoom]; // Also delete the users tracking for this room
                }
            }, 1000); // 1-second delay
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open your browser at http://localhost:${PORT}`);
});