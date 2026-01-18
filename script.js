    const ENDPOINT = "https://eunoia-backend.dylan-m-jaya.workers.dev";

    const CONVO_KEY = "eunoia_conversation_id";
    const GUEST_MESSAGE_LIMIT = 5;

    // Firebase (optional): set when SDK and config are available
    let firebaseApp = null;
    let authUser = null;
    let currentTranscript = [];

    function getConversationId() {
      if (authUser) {
        const key = `eunoia_current_conversation_${authUser.uid}`;
        let id = localStorage.getItem(key);
        if (!id) {
          id = crypto.randomUUID();
          localStorage.setItem(key, id);
        }
        return id;
      }
      let id = sessionStorage.getItem(CONVO_KEY);
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(CONVO_KEY, id);
      }
      return id;
    }

    function resetConversationId() {
      const id = crypto.randomUUID();
      if (authUser) {
        localStorage.setItem(`eunoia_current_conversation_${authUser.uid}`, id);
      } else {
        sessionStorage.setItem(CONVO_KEY, id);
      }
      return id;
    }

    function transcriptKey(conversationId) {
      return `eunoia_transcript_${conversationId}`;
    }

    function getCurrentTranscript() {
      return currentTranscript;
    }

    async function loadFromStorage(conversationId) {
      if (authUser && firebaseApp) {
        try {
          const db = firebaseApp.firestore();
          const ref = db.collection("users").doc(authUser.uid).collection("conversations").doc(conversationId);
          const snap = await ref.get();
          const data = snap.exists ? snap.data() : null;
          return Array.isArray(data?.messages) ? data.messages : [];
        } catch (e) {
          console.warn("Firestore load failed:", e);
          return [];
        }
      }
      try {
        return JSON.parse(sessionStorage.getItem(transcriptKey(conversationId)) || "[]");
      } catch {
        return [];
      }
    }

    function persistTranscript(conversationId, transcript) {
      if (authUser && firebaseApp) {
        try {
          const firstUser = transcript.find((m) => m.role === "user");
          const title = firstUser ? String(firstUser.content || "").slice(0, 60) : "New chat";
          const db = firebaseApp.firestore();
          const ref = db.collection("users").doc(authUser.uid).collection("conversations").doc(conversationId);
          ref.set(
            { updatedAt: firebase.firestore.FieldValue.serverTimestamp(), messages: transcript, title },
            { merge: true }
          ).catch((e) => console.warn("Firestore save failed:", e));
        } catch (e) {
          console.warn("Firestore save failed:", e);
        }
        return;
      }
      sessionStorage.setItem(transcriptKey(conversationId), JSON.stringify(transcript));
    }

    function addToTranscript(role, content) {
      currentTranscript.push({ role, content, ts: Date.now() });
      persistTranscript(getConversationId(), currentTranscript);
      if (!authUser) updateGuestLimitDisplay();
    }

    function formatTranscriptTxt(transcript) {
      return transcript
        .map((m) => {
          const time = new Date(m.ts).toLocaleString();
          const who = m.role === "user" ? "You" : "Eunoia";
          return `[${time}] ${who}:\n${m.content}\n`;
        })
        .join("\n");
    }

    function downloadFile(filename, content, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    }

    function downloadChat() {
      const conversationId = getConversationId();
      const transcript = getCurrentTranscript();

      if (!transcript.length) {
        alert("No chat to download yet.");
        return;
      }

      const txt = formatTranscriptTxt(transcript);
      downloadFile(`eunoia-chat-${conversationId}.txt`, txt, "text/plain");
    }

    window.addEventListener("beforeunload", (e) => {
      const transcript = getCurrentTranscript();
      if (transcript.length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    }); 

    const chatEl = document.getElementById("chat");
    const inputEl = document.getElementById("input");
    const sendBtn = document.getElementById("sendBtn");
    const downloadBtn = document.getElementById("downloadBtn");
    const composerEl = document.querySelector(".composer");

    const MAX_CHARS = Number(inputEl.getAttribute("maxlength")) || 900;
    const charCountEl = document.getElementById("charCount");

     function updateCharCount() {
      if (!charCountEl) return;
      const len = inputEl.value.length;
      charCountEl.textContent = `${len}/${MAX_CHARS}`;
    }

    function resetCharCount() {
      if (!charCountEl) return;
      charCountEl.textContent = `0/${MAX_CHARS}`;
    }

    updateCharCount();
    
    function setComposerEnabled(enabled) {
      // Only affects the input + send button; layout remains the same.
      inputEl.disabled = !enabled;
      sendBtn.disabled = !enabled;

      if (enabled) {
        composerEl.style.opacity = "1";
        composerEl.style.pointerEvents = "auto";
      } else {
        composerEl.style.opacity = "0.6";
        composerEl.style.pointerEvents = "none";
      }
      updateCharCount();
    }
    downloadBtn.addEventListener("click", downloadChat);

    const authAreaEl = document.getElementById("authArea");
    const newChatBtnEl = document.getElementById("newChatBtn");
    const sidebarToggleEl = document.getElementById("sidebarToggle");
    const sidebarEl = document.getElementById("sidebar");
    const sidebarOverlayEl = document.getElementById("sidebarOverlay");
    const sidebarCloseEl = document.getElementById("sidebarClose");
    const sidebarNewChatEl = document.getElementById("sidebarNewChat");
    const conversationListEl = document.getElementById("conversationList");

    function updateGuestLimitDisplay() {
      const el = document.getElementById("guestLimitSpan");
      if (!el) return;
      const n = getCurrentTranscript().length;
      el.textContent = `${n}/${GUEST_MESSAGE_LIMIT}`;
      el.classList.toggle("at-limit", n >= GUEST_MESSAGE_LIMIT);
    }

    function renderAuthUI() {
      if (!authAreaEl) return;
      authAreaEl.innerHTML = "";
      const hasFirebase = typeof firebase !== "undefined" && (firebase.apps?.length || !!(typeof window.firebaseConfig !== "undefined" && window.firebaseConfig?.apiKey));

      if (authUser) {
        const email = document.createElement("span");
        email.className = "user-email";
        email.title = authUser.email || "";
        email.textContent = authUser.email || "Signed in";
        const signOut = document.createElement("button");
        signOut.type = "button";
        signOut.className = "btn-signout";
        signOut.textContent = "Sign out";
        signOut.addEventListener("click", () => {
          if (firebase?.auth) firebase.auth().signOut();
        });
        authAreaEl.appendChild(email);
        authAreaEl.appendChild(signOut);
        if (newChatBtnEl) newChatBtnEl.style.display = "";
        if (sidebarToggleEl) sidebarToggleEl.style.display = "";
        return;
      }

      if (newChatBtnEl) newChatBtnEl.style.display = "none";
      if (sidebarToggleEl) sidebarToggleEl.style.display = "none";

      // Sign in with Google: always shown for guests (at any message count) so they can sign in anytime.
      if (hasFirebase) {
        const google = document.createElement("button");
        google.type = "button";
        google.className = "btn-google";
        google.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Sign in with Google`;
        google.addEventListener("click", () => {
          const provider = new firebase.auth.GoogleAuthProvider();
          firebase.auth().signInWithPopup(provider).catch((e) => {
            console.warn("Sign-in failed:", e);
            alert("Sign-in failed. Please try again or check that pop-ups are allowed.");
          });
        });
        authAreaEl.appendChild(google);
      }

      const span = document.createElement("span");
      span.id = "guestLimitSpan";
      span.className = "guest-limit";
      const n = getCurrentTranscript().length;
      span.textContent = `${n}/${GUEST_MESSAGE_LIMIT}`;
      if (n >= GUEST_MESSAGE_LIMIT) span.classList.add("at-limit");
      authAreaEl.appendChild(span);
    }

    function showGuestLimitReachedMessage() {
      addMessage("assistant", "You've reached the 5-message limit for guests. Sign in with Google to continue and save your conversations.");
    }

    async function loadInitialConversation() {
      if (authUser) {
        const cid = getConversationId();
        currentTranscript = await loadFromStorage(cid);
      } else {
        resetConversationId();
        currentTranscript = await loadFromStorage(getConversationId());
      }
      chatEl.innerHTML = "";
      for (const m of currentTranscript) {
        addMessage(m.role, m.content);
      }
    }

    function maybeAddWelcome() {
      if (getCurrentTranscript().length === 0) {
        addMessage("assistant", "Hi! I'm Eunoia. Tell me what's going on, and I'll help you think it through.");
      }
    }

    function closeSidebar() {
      if (sidebarEl) sidebarEl.classList.remove("open");
    }

    function openSidebar() {
      if (!sidebarEl) return;
      sidebarEl.classList.add("open");
      fetchConversations().then(renderConversationList);
    }

    function toggleSidebar() {
      if (sidebarEl?.classList.contains("open")) closeSidebar();
      else openSidebar();
    }

    async function fetchConversations() {
      if (!authUser || !firebaseApp) return [];
      try {
        const db = firebaseApp.firestore();
        const snap = await db.collection("users").doc(authUser.uid).collection("conversations")
          .orderBy("updatedAt", "desc")
          .limit(50)
          .get();
        return snap.docs.map((d) => {
          const d_ = d.data();
          const firstUser = (d_.messages || []).find((m) => m.role === "user");
          const title = d_.title || (firstUser ? String(firstUser.content || "").slice(0, 60) : "New chat");
          return { id: d.id, title, updatedAt: d_.updatedAt?.toMillis?.() || 0 };
        });
      } catch (e) {
        console.warn("Fetch conversations failed:", e);
        return [];
      }
    }

    function renderConversationList(list) {
      if (!conversationListEl) return;
      conversationListEl.innerHTML = "";
      if (!list || list.length === 0) {
        const li = document.createElement("li");
        li.className = "conversation-list-empty";
        li.textContent = "No conversations yet. Start a new chat above.";
        conversationListEl.appendChild(li);
        return;
      }
      for (const it of list) {
        const li = document.createElement("li");
        li.className = "conversation-item";
        li.textContent = it.title || "New chat";
        li.addEventListener("click", () => loadConversation(it.id));
        conversationListEl.appendChild(li);
      }
    }

    async function loadConversation(conversationId) {
      if (!authUser) return;
      localStorage.setItem(`eunoia_current_conversation_${authUser.uid}`, conversationId);
      currentTranscript = await loadFromStorage(conversationId);
      chatEl.innerHTML = "";
      for (const m of currentTranscript) addMessage(m.role, m.content);
      closeSidebar();
    }

    function startNewConversation() {
      closeSidebar();
      isQuizActive = false;
      resetConversationId();
      currentTranscript = [];
      chatEl.innerHTML = "";
      const endActionsEl = document.getElementById("endActions");
      if (endActionsEl) { endActionsEl.hidden = true; endActionsEl.innerHTML = ""; }
      const suggestionsEl = document.querySelector(".suggestions");
      if (suggestionsEl) suggestionsEl.style.display = "";
      const comp = document.querySelector(".composer");
      if (comp) comp.style.display = "";
      setComposerEnabled(true);
      maybeAddWelcome();
      if (!authUser) updateGuestLimitDisplay();
      renderAuthUI();
    }

    if (newChatBtnEl) newChatBtnEl.addEventListener("click", startNewConversation);
    if (sidebarToggleEl) sidebarToggleEl.addEventListener("click", toggleSidebar);
    if (sidebarOverlayEl) sidebarOverlayEl.addEventListener("click", closeSidebar);
    if (sidebarCloseEl) sidebarCloseEl.addEventListener("click", closeSidebar);
    if (sidebarNewChatEl) sidebarNewChatEl.addEventListener("click", () => { startNewConversation(); closeSidebar(); });

    function addMessage(role, text, { typing = false } = {}) {
      const wrapper = document.createElement("div");
      wrapper.className = `msg ${role}`;

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = role === "user" ? "You" : "EU";

      const bubble = document.createElement("div");
      bubble.className = "bubble";

      if (typing) {
        bubble.innerHTML = `<span class="typing" aria-label="Typing">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </span>`;
      } else {
        bubble.textContent = text;
      }

      wrapper.appendChild(avatar);
      wrapper.appendChild(bubble);
      chatEl.appendChild(wrapper);
      chatEl.scrollTop = chatEl.scrollHeight;
      return wrapper;
    }

    function autoResize() {
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
    }

    inputEl.addEventListener("input", () => {
      autoResize();
      updateCharCount();
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn.addEventListener("click", sendMessage);

    // Quiz data
    const quizData = [
      {
        question: "When something bothers you, how do you usually handle it?",
        options: [
          "I bring it up calmly and we talk it through",
          "I wait for the right moment, but it sometimes builds up",
          "I usually keep it to myself to avoid conflict",
          "It often turns into an argument or tension"
        ]
      },
      {
        question: "How emotionally safe do you feel expressing vulnerability with your partner?",
        options: [
          "Very safe—I can be fully myself",
          "Mostly safe, with a few reservations",
          "Somewhat guarded",
          "Not safe at all"
        ]
      },
      {
        question: "How do you and your partner typically resolve disagreements?",
        options: [
          "We listen, compromise, and move forward",
          "It takes time, but we eventually resolve them",
          "Issues often resurface without full resolution",
          "Conflicts feel repetitive or unresolved"
        ]
      },
      {
        question: "How aligned are you on long-term expectations (values, goals, future)?",
        options: [
          "Very aligned and openly discussed",
          "Mostly aligned, with some unclear areas",
          "Unsure—we haven't really talked about it",
          "Clearly misaligned or avoid the topic"
        ]
      },
      {
        question: "How often do you feel appreciated or valued by your partner?",
        options: [
          "Consistently",
          "Often, but not always",
          "Occasionally",
          "Rarely"
        ]
      },
      {
        question: "How do you feel after spending time with your partner?",
        options: [
          "Energized and emotionally fulfilled",
          "Generally positive, with occasional doubts",
          "Neutral or emotionally drained",
          "Frequently anxious or unhappy"
        ]
      },
      {
        question: "How balanced is effort in the relationship?",
        options: [
          "Very balanced",
          "Slightly uneven, but manageable",
          "Mostly one-sided",
          "Extremely one-sided"
        ]
      },
      {
        question: "How do you handle trust-related issues (jealousy, honesty, boundaries)?",
        options: [
          "Open communication and mutual trust",
          "Minor concerns, but manageable",
          "Ongoing doubts or insecurity",
          "Major trust issues"
        ]
      },
      {
        question: "When imagining your future, how does this relationship fit?",
        options: [
          "Clearly and positively",
          "Mostly positive, but uncertain",
          "Hard to imagine long-term",
          "I avoid thinking about it"
        ]
      },
      {
        question: "Overall, how would you describe your relationship right now?",
        options: [
          "Strong and healthy",
          "Stable, with room for growth",
          "Fragile or uncertain",
          "Strained or unhealthy"
        ]
      }
    ];

    const quizResults = {
      secure: {
        title: "<strong>Relationship Health:</strong> Secure & Thriving",
        scoreRange: [32, 40],
        content: `Your relationship shows strong signs of emotional safety, mutual effort, and constructive communication. Conflicts—when they arise—are generally handled in a way that strengthens trust rather than eroding it.

You and your partner appear aligned on core values and expectations, and there is a healthy balance between independence and connection. This creates a stable foundation for long-term growth.

<strong>What this means:</strong>

Your relationship risk is low. The focus is not on fixing problems, but on maintaining healthy habits and continuing intentional communication.

<strong>Suggested focus:</strong>

Reinforce what's working. Regular check-ins, appreciation, and shared future planning can help preserve this stability over time.`
      },
      stable: {
        title: "<strong>Relationship Health:</strong> Stable, with Room for Growth",
        scoreRange: [25, 31],
        content: `Your relationship is generally stable, but certain areas may benefit from more attention. Communication, alignment, or emotional needs are mostly met, though not always consistently.

There are no immediate red flags, but some patterns—such as avoided conversations or uneven effort—could become larger issues if left unaddressed.

<strong>What this means:</strong>

Your relationship risk is moderate and manageable. Small, proactive adjustments can significantly improve long-term health.

<strong>Suggested focus:</strong>

Identify one or two areas to improve—such as clearer expectations or emotional responsiveness—and address them intentionally before they become stress points.`
      },
      atRisk: {
        title: "<strong>Relationship Health:</strong> At Risk",
        scoreRange: [18, 24],
        content: `Your responses suggest recurring stress points within the relationship.

Communication may feel difficult, emotional needs may not be consistently met, or important issues may remain unresolved.

While the relationship may still have meaningful positives, there are warning signs that deserve attention. Ignoring these patterns could lead to increased dissatisfaction or emotional distance over time.

<strong>What this means:</strong>

Your relationship risk is elevated. Active intervention—through honest conversations or external support—may be necessary to restore balance.

<strong>Suggested focus:</strong>

Clarify unmet needs and address ongoing issues directly. Structured conversations or guided reflection can help determine whether improvement is possible and what changes are required.`
      },
      highRisk: {
        title: "<strong>Relationship Health:</strong> High Risk",
        scoreRange: [10, 17],
        content: `Your responses indicate significant strain within the relationship. Issues such as emotional unsafety, unresolved conflict, imbalance of effort, or trust concerns appear to be persistent.

This level of stress can take a toll on emotional well-being and may limit the relationship's ability to function in a healthy, sustainable way without substantial change.

<strong>What this means:</strong>

Your relationship risk is high. Continuing without change may lead to further emotional harm or burnout.

<strong>Suggested focus:</strong>

Prioritize emotional safety and clarity. This may involve setting firm boundaries, seeking professional support, or reassessing whether the relationship can meet your needs in its current form.`
      }
    };

    let quizAnswers = {};
    let currentQuestionIndex = 0;
    let isQuizActive = false;

    function showQuiz() {
      // Clear chat and reset quiz state
      chatEl.innerHTML = '';
      quizAnswers = {};
      currentQuestionIndex = 0;
      isQuizActive = true;

      // Hide end-of-quiz actions (if any)
      const endActionsEl = document.getElementById('endActions');
      if (endActionsEl) { endActionsEl.hidden = true; endActionsEl.innerHTML = ''; }
      
      // Hide suggestions and disable composer
      document.querySelector('.suggestions').style.display = 'none';
      document.querySelector('.composer').style.display = 'none';
      inputEl.disabled = true;
      
      // Show welcome message
      addMessage('assistant', "I'll help you discover your relationship health and risk profile. Let's start with a few questions.");
      
      // Show first question after a brief delay
      setTimeout(() => {
        showNextQuestion();
      }, 500);
    }

    function showNextQuestion() {
      if (currentQuestionIndex >= quizData.length) {
        // All questions answered, show results
        showQuizResults();
        return;
      }
      
      const question = quizData[currentQuestionIndex];
      
      // Add question as assistant message
      addMessage('assistant', question.question);
      
      // Add options as suggestion buttons
      const suggestionsDiv = document.createElement('div');
      suggestionsDiv.className = 'suggestions';
      suggestionsDiv.style.display = 'flex';
      
      question.options.forEach((option, optIndex) => {
        const optionBtn = document.createElement('button');
        optionBtn.className = 'suggestion-btn';
        optionBtn.textContent = option;
        optionBtn.dataset.questionIndex = currentQuestionIndex;
        optionBtn.dataset.optionIndex = optIndex;
        
        optionBtn.addEventListener('click', () => {
          // Store answer (A=4, B=3, C=2, D=1, but we use 0-3 index, so: 0=4, 1=3, 2=2, 3=1)
          quizAnswers[currentQuestionIndex] = 4 - optIndex;
          
          // Add user's answer as a message
          addMessage('user', option);
          
          // Remove options
          suggestionsDiv.remove();
          
          // Move to next question
          currentQuestionIndex++;
          setTimeout(() => {
            showNextQuestion();
          }, 500);
        });
        
        suggestionsDiv.appendChild(optionBtn);
      });
      
      chatEl.appendChild(suggestionsDiv);
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    function showQuizResults() {
      isQuizActive = false;
      
      // Calculate score
      const totalScore = Object.values(quizAnswers).reduce((sum, score) => sum + score, 0);
      
      // Determine result category
      let result;
      if (totalScore >= 32) {
        result = quizResults.secure;
      } else if (totalScore >= 25) {
        result = quizResults.stable;
      } else if (totalScore >= 18) {
        result = quizResults.atRisk;
      } else {
        result = quizResults.highRisk;
      }
      
      // Add result as assistant message with HTML formatting
      const resultText = `${result.title}\n\n${result.content}`;
      const resultHTML = resultText.replace(/\n/g, '<br>');
      
      // Create message with HTML support
      const wrapper = document.createElement("div");
      wrapper.className = "msg assistant";

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = "EU";

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.innerHTML = resultHTML;

      wrapper.appendChild(avatar);
      wrapper.appendChild(bubble);
      chatEl.appendChild(wrapper);
      
      // Add refresh button
      const refreshDiv = document.createElement('div');
      refreshDiv.className = 'suggestions';
      refreshDiv.style.display = 'flex';
      
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'suggestion-btn';
      refreshBtn.textContent = 'Start a new conversation';
      refreshBtn.addEventListener('click', () => {
        // Triggers the same unsaved-updates warning via beforeunload.
        window.location.reload();
      });
      refreshDiv.appendChild(refreshBtn);
      chatEl.appendChild(refreshDiv);
      
      chatEl.scrollTop = chatEl.scrollHeight;
      
      // Quiz finished: keep the composer disabled until a new conversation starts.
      composerEl.style.display = 'flex';
      inputEl.value = '';
      setComposerEnabled(false);
      autoResize();
      resetCharCount();
      document.querySelector('.composer').style.display = 'none';
      
      // Add to transcript (plain text version)
      addToTranscript('assistant', resultText.replace(/<[^>]*>/g, ''));
    }

    // Handle suggested question buttons
    document.querySelectorAll('.suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const question = btn.getAttribute('data-question');
        
        // Special handling for quiz button
        if (question === "Discover your relationship health and risk profile.") {
          showQuiz();
        } else {
          inputEl.value = question;
          autoResize();
          sendMessage();
        }
      });
    });

    function extractReply(data) {
      return (
        data?.outputs?.["out-0"] ??
        data?.outputs?.out0 ?? 
        JSON.stringify(data, null, 2)
      );
    }


    async function sendMessage() {
      if (sendBtn.disabled || isQuizActive) return;

      const message = inputEl.value.trim();
      if (!message) return;

      if (!authUser && getCurrentTranscript().length >= GUEST_MESSAGE_LIMIT) {
        showGuestLimitReachedMessage();
        renderAuthUI();
        return;
      }

      // Hide suggestions after first message
      const suggestionsEl = document.querySelector('.suggestions');
      if (suggestionsEl && !isQuizActive) {
        suggestionsEl.style.display = 'none';
      }

      addMessage("user", message);
      addToTranscript("user", message);

      const trimmedHistory = getCurrentTranscript().slice(-10);
      const MAX_CHARS_PER_MESSAGE = 900;
      const cappedHistory = trimmedHistory.map(m => {
        if (m.content.length > MAX_CHARS_PER_MESSAGE) {
          return {
            role: m.role,
            content: String(m.content || "").slice(0, MAX_CHARS_PER_MESSAGE)
          };
        }
        return m;
      });
      
      inputEl.value = "";
      autoResize();
      resetCharCount();

      sendBtn.disabled = true;
      downloadBtn.disabled = true;
      const typingRow = addMessage("assistant", "", { typing: true });

      try {
        const conversationId = getConversationId();
        const response = await fetch(ENDPOINT, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            message, 
            conversationId,
            history: cappedHistory 
          })
        });

        const data = await response.json();

        if (!response.ok) {
          typingRow.querySelector(".bubble").textContent =
            data?.error ? `Error: ${data.error}` : `Error: HTTP ${response.status}`;
          return;
        }

        const reply = extractReply(data);
        typingRow.querySelector(".bubble").textContent = reply;
        addToTranscript("assistant", reply);
      } catch (err) {
        typingRow.querySelector(".bubble").textContent =
          "Sorry, I'm having trouble right now. Please try again later. Thank you for your patience!";
        console.error(err);
      } finally {
        sendBtn.disabled = false;
        downloadBtn.disabled = false;
        chatEl.scrollTop = chatEl.scrollHeight;
      }
    }

    (function init() {
      const cfg = typeof window.firebaseConfig !== "undefined" && window.firebaseConfig?.apiKey;
      if (cfg && typeof firebase !== "undefined") {
        try {
          firebaseApp = firebase.initializeApp(window.firebaseConfig);
        } catch (e) {
          if (!firebase.apps?.length) console.warn("Firebase init failed:", e);
          else firebaseApp = firebase.app();
        }
      }
      function runUI() {
        renderAuthUI();
        loadInitialConversation().then(maybeAddWelcome);
      }
      authUser = null;
      runUI();
      if (firebaseApp && typeof firebase !== "undefined" && firebase.auth) {
        firebase.auth().onAuthStateChanged(function (u) {
          authUser = u || null;
          runUI();
        });
      }
    })();
