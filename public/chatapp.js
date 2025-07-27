const socket = io();

const messagesContainer = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendMessageButton = document.getElementById("sendMessageButton");
const roomNameDisplay = document.getElementById("roomNameDisplay");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const leaveRoomButton = document.getElementById("leaveRoomButton");
const currentYearSpan = document.getElementById("currentYear");

// Set the current year in the copyright notice
currentYearSpan.textContent = new Date().getFullYear();

let currentRoomCode = "";
let currentRoomName = "";
let currentPersonName = "";

const MESSAGE_EXPIRATION_MS = 48 * 60 * 60 * 1000; // 48 hours in milliseconds

// Function to get query parameters from URL
function getQueryParams() {
    const params = {};
    window.location.search
        .substring(1)
        .split("&")
        .forEach((param) => {
            const parts = param.split("=");
            if (parts.length === 2) {
                params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
            }
        });
    return params;
}

// Function to load messages from local storage
function loadMessages() {
    // *** CLEAR EXISTING MESSAGES BEFORE LOADING ***
    messagesContainer.innerHTML = ""; // This is the key fix

    const storedMessages = localStorage.getItem(
        `chatMessages_${currentRoomCode}`
    );
    if (storedMessages) {
        const messages = JSON.parse(storedMessages);
        const now = Date.now();
        // Filter out expired messages
        const validMessages = messages.filter(
            (msg) => now - msg.timestamp < MESSAGE_EXPIRATION_MS
        );

        validMessages.forEach((msg) => {
            addMessageToChat(
                msg.personName,
                msg.message,
                msg.timestamp,
                msg.isSelf
            );
        });
        // Save valid messages back to ensure expired ones are removed
        localStorage.setItem(
            `chatMessages_${currentRoomCode}`,
            JSON.stringify(validMessages)
        );
    }
    scrollToBottom();
}

// Function to save a message to local storage
function saveMessage(personName, message, timestamp, isSelf) {
    const storedMessages = localStorage.getItem(
        `chatMessages_${currentRoomCode}`
    );
    const messages = storedMessages ? JSON.parse(storedMessages) : [];
    messages.push({ personName, message, timestamp, isSelf });
    localStorage.setItem(
        `chatMessages_${currentRoomCode}`,
        JSON.stringify(messages)
    );
}

// Function to format timestamp
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
}

// Function to add a message to the chat display
function addMessageToChat(personName, message, timestamp, isSelf = false) {
    const messageBubble = document.createElement("div");
    messageBubble.classList.add("message-bubble");
    // Add a class for system messages if personName is "System" to style them differently
    if (personName === "System") {
        messageBubble.classList.add("system-message");
    } else {
        messageBubble.classList.add(isSelf ? "sent" : "received");
    }


    // Simple avatar based on first letter of name, only for regular messages
    let avatarHtml = '';
    if (personName !== "System") {
        const avatarText = personName ? personName.charAt(0).toUpperCase() : "?";
        const avatarColor = isSelf ? "#8a2be2" : "#20c997"; // Purple for self, green for others
        avatarHtml = `
                    <img src="https://placehold.co/36x36/${avatarColor.substring(
                        1
                    )}/FFFFFF?text=${avatarText}"
                        alt="${personName}" class="message-avatar">
                `;
    }


    messageBubble.innerHTML = `
                    ${avatarHtml}
                    <div class="message-content-wrapper">
                        <div class="message-info">
                            <span class="name">${personName}</span>
                            <span class="time">${formatTimestamp(timestamp)}</span>
                        </div>
                        <div class="message-text">${message}</div>
                    </div>
                `;
    messagesContainer.appendChild(messageBubble);
    scrollToBottom();
}

// Function to scroll to the bottom of the chat
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Initialize chat details from sessionStorage or URL
document.addEventListener("DOMContentLoaded", () => {
    currentRoomCode = sessionStorage.getItem("chatRoomCode");
    currentRoomName = sessionStorage.getItem("chatRoomName");
    currentPersonName = sessionStorage.getItem("chatPersonName");

    // Flag to check if this is a fresh visit or a reload
    let isFreshVisit = false;
    if (!currentRoomCode && !sessionStorage.getItem("hasVisitedChat")) {
        isFreshVisit = true;
        sessionStorage.setItem("hasVisitedChat", "true"); // Mark that chat has been visited
    }

    // If room code is in URL, prioritize it and set session storage
    const queryParams = getQueryParams();
    if (queryParams.room) {
        currentRoomCode = queryParams.room;
        // If coming from a direct link or refresh, personName and roomName might not be in session.
        // We'll use a default or prompt if needed later, but for now, prioritize roomCode.
        if (!currentPersonName) {
            currentPersonName = `Guest-${Math.floor(Math.random() * 1000)}`;
            sessionStorage.setItem("chatPersonName", currentPersonName);
            // If personName was just generated, it's likely a fresh visit to this specific room link
            isFreshVisit = true;
        }
        if (!currentRoomName) {
            currentRoomName = `Room ${currentRoomCode}`;
            sessionStorage.setItem("chatRoomName", currentRoomName);
        }
        sessionStorage.setItem("chatRoomCode", currentRoomCode); // Ensure it's in session
    }

    // If no room code at all, redirect to index
    if (!currentRoomCode) {
        window.location.href = "/";
        return;
    }

    // ALWAYS attempt to join the room on the server when chatApp.html loads
    // This ensures the server-side socket is correctly associated with the room
    socket.emit("joinRoom", currentRoomCode, (response) => {
        if (response.success) {
            updateHeaderDisplays();
            loadMessages(); // Load messages from local storage after joining

            // Only show initial welcome message if it's a fresh join (first time this user enters this room)
            if (isFreshVisit && !localStorage.getItem(`hasJoinedRoom_${currentRoomCode}`)) {
                // This is the initial "Welcome!" message, not the "joined the chat" broadcast
                addMessageToChat(
                    "System",
                    `Welcome! You joined as ${currentPersonName}.`,
                    Date.now(),
                    false
                );
                saveMessage(
                    "System",
                    `Welcome! You joined as ${currentPersonName}.`,
                    Date.now(),
                    false
                );
                localStorage.setItem(`hasJoinedRoom_${currentRoomCode}`, "true"); // Mark that this user has seen the welcome for this room
            }

            // *** Emit event to notify others that this user joined ***
            // This event tells the server to broadcast "X joined the chat"
            socket.emit("userJoinedRoom", {
                roomCode: currentRoomCode,
                personName: currentPersonName
            });

        } else {
            // Room does not exist on server, or other error
            // Clear session storage for this room to prevent looping
            sessionStorage.removeItem("chatRoomCode");
            sessionStorage.removeItem("chatRoomName");
            sessionStorage.removeItem("chatPersonName");
            localStorage.removeItem(`hasJoinedRoom_${currentRoomCode}`); // Also clear this flag
            alert(response.message || "Failed to join room. Redirecting to home.");
            window.location.href = "/"; // Redirect to home on failure
        }
    });
});

function updateHeaderDisplays() {
    roomNameDisplay.textContent = currentRoomName;
    roomCodeDisplay.textContent = `Room Code: ${currentRoomCode}`;
    // Update room avatar text
    const roomAvatar = document.querySelector(".room-avatar");
    roomAvatar.src = `https://placehold.co/40x40/555555/FFFFFF?text=${currentRoomName
        .charAt(0)
        .toUpperCase()}`;
}

// Event listener for sending a message
sendMessageButton.addEventListener("click", () => {
    const message = messageInput.value.trim();
    if (message && currentRoomCode && currentPersonName) {
        const fullMessage = {
            personName: currentPersonName,
            message: message,
            timestamp: Date.now(),
            roomCode: currentRoomCode, // Include roomCode for server-side routing
        };
        socket.emit("chat message", fullMessage);
        addMessageToChat(currentPersonName, message, fullMessage.timestamp, true); // Add to UI immediately
        saveMessage(currentPersonName, message, fullMessage.timestamp, true); // Save to local storage
        messageInput.value = ""; // Clear input
    }
});

// Allow sending message with Enter key
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendMessageButton.click();
    }
});

// Listen for incoming messages
socket.on("chat message", (msg) => {
    // Only display messages if they belong to the current room and are not from self (already displayed)
    // or if it's a system message
    if (msg.roomCode === currentRoomCode) {
        if (msg.personName !== currentPersonName || typeof msg.personName === "undefined") {
            // If it's a system message (personName is undefined or "System") or a message from another user
            addMessageToChat(msg.personName, msg.message, msg.timestamp, false);
            saveMessage(msg.personName, msg.message, msg.timestamp, false);
        }
    }
});

// Listen for user join/leave notifications from the server
socket.on("userActivity", (msg) => {
    if (msg.roomCode === currentRoomCode) {
        addMessageToChat("System", msg.message, msg.timestamp, false);
        saveMessage("System", msg.message, msg.timestamp, false);
    }
});


// Event listener for leaving the room
leaveRoomButton.addEventListener("click", () => {
    // Emit event to notify others that this user is leaving
    socket.emit("userLeavingRoom", {
        roomCode: currentRoomCode,
        personName: currentPersonName
    });

    // Clear relevant session storage items
    sessionStorage.removeItem("chatRoomCode");
    sessionStorage.removeItem("chatRoomName");
    sessionStorage.removeItem("chatPersonName");
    localStorage.removeItem(`hasJoinedRoom_${currentRoomCode}`); // Clear this flag when leaving
    sessionStorage.removeItem("hasVisitedChat"); // Clear the general visit flag too
    window.location.href = "/"; // Redirect to home page
});

// Handle browser back/forward buttons to ensure correct room context
window.addEventListener("popstate", () => {
    if (!sessionStorage.getItem("chatRoomCode")) {
        window.location.href = "/"; // Redirect to home if no room in session
    }
});