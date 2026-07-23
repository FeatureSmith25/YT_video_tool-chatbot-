(() => {

const $ = (id) => document.getElementById(id);

const videoInput = $("video-input");
const languageSelect = $("language-select");

const advancedToggle = $("advanced-toggle");
const advancedPanel = $("advanced-panel");

const chunkSize = $("chunk-size");
const chunkOverlap = $("chunk-overlap");
const topK = $("top-k");

const chunkSizeValue = $("chunk-size-value");
const chunkOverlapValue = $("chunk-overlap-value");
const topKValue = $("top-k-value");

const processBtn = $("process-btn");
const processBtnLabel = $("process-btn-label");

const stepper = $("stepper");

const videoCard = $("video-card");
const videoThumb = $("video-thumb");
const videoIdLabel = $("video-id-label");
const chunkCountLabel = $("chunk-count-label");

const resetBtn = $("reset-btn");

const feed = $("feed");
const emptyState = $("empty-state");

const composer = $("composer");
const questionInput = $("question-input");
const sendBtn = $("send-btn");

const composerTimecode = $("composer-timecode");
const timecodeEl = $("timecode");

let sessionId = null;
let msgCounter = 0;
let recordingStart = null;
let timecodeInterval = null;

// ----------------------------------------

advancedToggle.addEventListener("click", () => {

    advancedToggle.classList.toggle("open");

    advancedPanel.classList.toggle("open");

});

chunkSize.addEventListener("input", () => {

    chunkSizeValue.textContent = chunkSize.value;

});

chunkOverlap.addEventListener("input", () => {

    chunkOverlapValue.textContent = chunkOverlap.value;

});

topK.addEventListener("input", () => {

    topKValue.textContent = topK.value;

});

// ----------------------------------------

function startClock(){

    recordingStart = Date.now();

    if(timecodeInterval){

        clearInterval(timecodeInterval);

    }

    timecodeInterval = setInterval(()=>{

        const elapsed = Date.now()-recordingStart;

        timecodeEl.textContent = formatTimecode(elapsed);

    },41);

}

function formatTimecode(ms){

    const totalSec=Math.floor(ms/1000);

    const hh=String(Math.floor(totalSec/3600)).padStart(2,"0");

    const mm=String(Math.floor((totalSec%3600)/60)).padStart(2,"0");

    const ss=String(totalSec%60).padStart(2,"0");

    const ff=String(Math.floor((ms%1000)/41.6)).padStart(2,"0");

    return `${hh}:${mm}:${ss}:${ff}`;

}

function formatSrtTimecode(ms){

    const totalSec=Math.floor(ms/1000);

    const mm=String(Math.floor(totalSec/60)).padStart(2,"0");

    const ss=String(totalSec%60).padStart(2,"0");

    const msPart=String(ms%1000).padStart(3,"0");

    return `00:${mm}:${ss},${msPart}`;

}

// ----------------------------------------

const STEP_ORDER=[
"fetch",
"chunk",
"embed",
"index",
"ready"
];

function resetStepper(){

    STEP_ORDER.forEach(name=>{

        const el=stepper.querySelector(`[data-step="${name}"]`);

        el.classList.remove("active","done");

    });

}

async function animateStepper(){

    resetStepper();

    const steps=[
        "fetch",
        "chunk",
        "embed",
        "index"
    ];

    for(const step of steps){

        const el=stepper.querySelector(`[data-step="${step}"]`);

        el.classList.add("active");

        await new Promise(r=>setTimeout(r,450));

        el.classList.remove("active");

        el.classList.add("done");

    }

}

function markReady(){

    stepper
    .querySelector('[data-step="ready"]')
    .classList.add("done");

}

// ----------------------------------------

processBtn.addEventListener("click",async()=>{

const raw=videoInput.value.trim();

if(!raw){

videoInput.focus();

return;

}

processBtn.disabled=true;

processBtnLabel.textContent="Processing...";

const animation=animateStepper();

try{

const response=await fetch("/api/process",{

method:"POST",

headers:{

"Content-Type":"application/json"

},

body:JSON.stringify({

video_input:raw,

language:languageSelect.value,

chunk_size:Number(chunkSize.value),

chunk_overlap:Number(chunkOverlap.value),

k:Number(topK.value)

})

});

let data;

try{

data=await response.json();

}

catch{

throw new Error("Invalid response from server.");

}

await animation;

if(!response.ok){

throw new Error(data.error||"Processing failed.");

}

sessionId=data.session_id;

videoThumb.src=data.thumbnail;

videoIdLabel.textContent=data.video_id;

chunkCountLabel.textContent=`${data.n_chunks} chunks indexed`;

videoCard.hidden=false;

markReady();

resetChat();

questionInput.disabled=false;

sendBtn.disabled=false;

questionInput.focus();

startClock();

}

catch(err){

console.error(err);

resetStepper();

alert(err.message);

}

finally{

processBtn.disabled=false;

processBtnLabel.textContent="Process Video";

}

});

resetBtn.addEventListener("click",async()=>{

if(sessionId){

await fetch("/api/reset",{

method:"POST",

headers:{

"Content-Type":"application/json"

},

body:JSON.stringify({

session_id:sessionId

})

});

}

sessionId=null;

videoCard.hidden=true;

questionInput.disabled=true;

sendBtn.disabled=true;

resetStepper();

resetChat();

});
// ---------------- Chat ----------------

function resetChat() {

    feed.innerHTML = "";

    msgCounter = 0;

    if (!sessionId) {
        feed.appendChild(emptyState);
    }

}

function pushMessage(role, text, isError = false) {

    if (emptyState.isConnected) {
        emptyState.remove();
    }

    const elapsed = recordingStart
        ? Date.now() - recordingStart
        : msgCounter * 4000;

    msgCounter++;

    const wrap = document.createElement("div");
    wrap.className = `msg ${role}`;

    const tc = document.createElement("div");
    tc.className = "msg-timecode mono";
    tc.textContent = formatSrtTimecode(elapsed);

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";

    if (isError) {
        bubble.classList.add("error");
    }

    bubble.textContent = text;

    wrap.appendChild(tc);
    wrap.appendChild(bubble);

    feed.appendChild(wrap);

    feed.scrollTop = feed.scrollHeight;

    return bubble;

}

// -----------------------------------------

function pushTyping() {

    if (emptyState.isConnected) {
        emptyState.remove();
    }

    const wrap = document.createElement("div");

    wrap.className = "msg assistant";

    wrap.id = "typing-indicator";

    const tc = document.createElement("div");

    tc.className = "msg-timecode mono";

    tc.textContent = "...";

    const bubble = document.createElement("div");

    bubble.className = "msg-bubble";

    bubble.innerHTML = `
        <span class="typing">
            <span></span>
            <span></span>
            <span></span>
        </span>
    `;

    wrap.appendChild(tc);

    wrap.appendChild(bubble);

    feed.appendChild(wrap);

    feed.scrollTop = feed.scrollHeight;

}

function removeTyping() {

    const el = $("typing-indicator");

    if (el) {
        el.remove();
    }

}

function pushSystemError(message) {

    pushMessage(
        "assistant",
        message,
        true
    );

}

// -----------------------------------------

composer.addEventListener("submit", async (e) => {

    e.preventDefault();

    const question = questionInput.value.trim();

    if (!question || !sessionId) {
        return;
    }

    composerTimecode.textContent = formatSrtTimecode(
        recordingStart
            ? Date.now() - recordingStart
            : 0
    );

    pushMessage(
        "user",
        question
    );

    questionInput.value = "";

    questionInput.disabled = true;

    sendBtn.disabled = true;

    pushTyping();

    try {

        const response = await fetch(
            "/api/ask",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({

                    session_id: sessionId,

                    question: question

                })
            }
        );

        let data;

        try {

            data = await response.json();

        }

        catch {

            throw new Error(
                "Invalid server response."
            );

        }

        removeTyping();

        if (!response.ok) {

            throw new Error(
                data.error ||
                "Unable to answer."
            );

        }

        pushMessage(
            "assistant",
            data.answer
        );

    }

    catch (err) {

        removeTyping();

        console.error(err);

        pushSystemError(
            err.message
        );

    }

    finally {

        questionInput.disabled = false;

        sendBtn.disabled = false;

        questionInput.focus();

    }

});
// -----------------------------------------
// Utility Functions
// -----------------------------------------

function showToast(message) {

    console.log(message);

}

function clearSession() {

    sessionId = null;

    recordingStart = null;

    msgCounter = 0;

    if (timecodeInterval) {

        clearInterval(timecodeInterval);

        timecodeInterval = null;

    }

    timecodeEl.textContent = "00:00:00:00";

}

// -----------------------------------------
// Window Events
// -----------------------------------------

window.addEventListener("beforeunload", async () => {

    if (!sessionId) return;

    try {

        await fetch("/api/reset", {

            method: "POST",

            headers: {

                "Content-Type": "application/json"

            },

            body: JSON.stringify({

                session_id: sessionId

            })

        });

    }

    catch (e) {

        console.log(e);

    }

});

// -----------------------------------------
// Initialize
// -----------------------------------------

resetStepper();

questionInput.disabled = true;

sendBtn.disabled = true;

videoCard.hidden = true;

timecodeEl.textContent = "00:00:00:00";

})();