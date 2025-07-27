// Initialize Socket.IO client connection
const socket = io();

// Get elements from the DOM
const flipContainer = document.querySelector(".flip-container");
const createRoomForm = document.getElementById("createRoomForm");
const joinRoomForm = document.getElementById("joinRoomForm");
const generatedCodeDisplay = document.getElementById("generatedCodeDisplay");
const roomCodeText = document.getElementById("roomCodeText");
const roomCodeInput = document.getElementById("roomCodeInput");
const regenerateCodeButton = document.getElementById("regenerateCodeButton");
const shareableLinkDisplay = document.getElementById("shareableLinkDisplay");
const shareableLinkText = document.getElementById("shareableLinkText");
const copyShareLinkButton = document.getElementById("copyShareLinkButton");
const messageBox = document.getElementById("messageBox");
const currentYearSpan = document.getElementById("currentYear");

const flipToCreateButton = document.getElementById("flipToCreate");
const flipToJoinButton = document.getElementById("flipToJoin");

// Set the current year in the copyright notice
currentYearSpan.textContent = new Date().getFullYear();

/**
 * Displays a temporary message box with a given message and type.
 * @param {string} message - The message to display.
 * @param {'success'|'error'} type - The type of message (for styling).
 */
function showMessageBox(message, type) {
   messageBox.textContent = message;
   messageBox.className = `message-box show ${type}`;
   setTimeout(() => {
      messageBox.classList.remove("show");
   }, 3000); // Hide after 3 seconds
}

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

// Function to generate and display a new room code and shareable link
function generateAndDisplayRoomCode() {
   socket.emit("createRoom", (response) => {
      if (response.success) {
         const roomCode = response.roomCode;
         roomCodeText.textContent = roomCode;
         roomCodeInput.value = roomCode; // For internal use
         // Changed shareLink to point to index.html with room code
         const shareLink = `${window.location.origin}/index.html?room=${roomCode}`;
         shareableLinkText.textContent = shareLink;
         shareableLinkDisplay.classList.remove("hidden"); // Show shareable link

         // Store details in sessionStorage to pass to chatApp.html
         sessionStorage.setItem("chatRoomCode", roomCode);
         // Note: roomName and personName will be set on form submission
         showMessageBox(`New room code generated: ${roomCode}`, "success");
      } else {
         showMessageBox(
            "Failed to generate room code. Please try again.",
            "error"
         );
         console.error("Error generating room code:", response.message);
      }
   });
}

// Event listeners for flipping the card
flipToCreateButton.addEventListener("click", () => {
   flipContainer.classList.add("flipped");
   // Generate a new code when flipping to create room
   generateAndDisplayRoomCode();
});

flipToJoinButton.addEventListener("click", () => {
   flipContainer.classList.remove("flipped");
});

// Handle URL parameters on page load for pre-filling room ID
document.addEventListener("DOMContentLoaded", () => {
   const queryParams = getQueryParams();
   if (queryParams.room) {
      const joinRoomIdInput = document.getElementById("joinRoomId");
      joinRoomIdInput.value = queryParams.room;
      // Optionally, flip to the join form if a room code is present in the URL
      flipContainer.classList.remove("flipped");
      // Optionally, focus on the person name input for convenience
      document.getElementById("joinPersonName").focus();
   }
});

// Event listener for regenerating the room code
regenerateCodeButton.addEventListener("click", () => {
   generateAndDisplayRoomCode();
});

// Event listener for copying the shareable link
copyShareLinkButton.addEventListener("click", () => {
   const linkToCopy = shareableLinkText.textContent;
   if (linkToCopy) {
      const tempInput = document.createElement("input");
      tempInput.value = linkToCopy;
      document.body.appendChild(tempInput);
      tempInput.select();
      try {
         document.execCommand("copy");
         showMessageBox("Shareable link copied to clipboard!", "success");
      } catch (err) {
         console.error("Failed to copy text: ", err);
         showMessageBox("Failed to copy link. Please copy manually.", "error");
      } finally {
         document.body.removeChild(tempInput);
      }
   }
});

// Event listener for creating a room
createRoomForm.addEventListener("submit", (e) => {
   e.preventDefault();
   const roomName = document.getElementById("createRoomName").value;
   const personName = document.getElementById("createPersonName").value;
   const roomCode = roomCodeText.textContent; // Get the currently displayed code

   if (!roomName || !personName || roomCode === "XXXXXX") {
      // Check if code is generated
      showMessageBox(
         "Please fill in all fields and ensure a room code is generated.",
         "error"
      );
      return;
   }

   // The room is already created on the server when 'createRoom' was emitted
   // Now, just store the details and redirect
   sessionStorage.setItem("chatRoomCode", roomCode);
   sessionStorage.setItem("chatRoomName", roomName);
   sessionStorage.setItem("chatPersonName", personName);

   showMessageBox(`Entering room ${roomName}. Redirecting...`, "success");
   setTimeout(() => {
      window.location.href = `chatApp.html?room=${roomCode}`;
   }, 1000);
});

// Event listener for joining a room
joinRoomForm.addEventListener("submit", (e) => {
   e.preventDefault();
   const personName = document.getElementById("joinPersonName").value;
   const roomId = document.getElementById("joinRoomId").value;

   if (!personName || !roomId) {
      showMessageBox("Please fill in both Your Name and Room ID.", "error");
      return;
   }

   socket.emit("joinRoom", roomId, (response) => {
      if (response.success) {
         sessionStorage.setItem("chatRoomCode", roomId);
         sessionStorage.setItem("chatRoomName", `Room ${roomId}`);
         sessionStorage.setItem("chatPersonName", personName);

         showMessageBox(`Joined room ${roomId}. Redirecting...`, "success");
         setTimeout(() => {
            window.location.href = `chatApp.html?room=${roomId}`;
         }, 1000);
      } else {
         showMessageBox(
            response.message || "Failed to join room. Please check the code.",
            "error"
         );
         console.error("Error joining room:", response.message);
      }
   });
});
